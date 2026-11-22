import express from "express";
import rateLimit from "express-rate-limit";
import { pool, gate } from "../../db/client.js";
import { demo, DB_POOL_MAX, DB_QUEUE_MAX, ENABLE_DEMO, PUBLIC_DEMO } from "../../config/env.js";
import { ValidationError, rejectNul } from "../logs/log.schema.js";
import { escapeLike } from "../logs/log.repository.js";
import localOnly from "../../middlewares/localOnly.middleware.js";
import { clientKey } from "../../middlewares/clientKey.js";

const router = express.Router();

// Demo endpoints change runtime behaviour on purpose; keep them off unless enabled.
// The app allows any origin so that services can ingest. That must not extend to these.
// The one exception is the read-only search race on a public demo, throttled below.
router.use((req, res, next) => {
  if (ENABLE_DEMO) return localOnly(req, res, next);
  if (PUBLIC_DEMO && req.method === "GET" && req.path === "/explain") return next();
  res.status(404).json({ error: "Demo endpoints are disabled" });
});

const publicRaceLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: { xForwardedForHeader: false },
  skip: () => !PUBLIC_DEMO,
  message: { error: "That's a lot of races. Try again in a minute." },
});

// A race reads the whole table several times, so a public demo runs one at a time.
let racing = false;
const publicRaceGuard = (req, res, next) => {
  if (!PUBLIC_DEMO) return next();
  if (req.get("sec-fetch-site") === "cross-site") {
    return res.status(403).json({ error: "The search race can't be started from another site" });
  }
  if (racing) {
    res.set("Retry-After", "3");
    return res.status(503).json({ error: "Someone else is racing right now. Try again in a few seconds." });
  }
  next();
};

const config = () => ({
  poolLimit: gate.limit,
  poolCapacity: DB_POOL_MAX,
  dbLatencyMs: demo.dbLatencyMs,
  queueMax: demo.queueMax,
  queueMaxDefault: DB_QUEUE_MAX,
});

const intIn = (v, lo, hi, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) {
    throw new ValidationError(`${name} must be an integer between ${lo} and ${hi}`);
  }
  return n;
};

router.get("/config", (_req, res) => res.json(config()));

router.post("/config", (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.poolLimit !== undefined) gate.setLimit(intIn(b.poolLimit, 1, DB_POOL_MAX, "poolLimit"));
    if (b.dbLatencyMs !== undefined) demo.dbLatencyMs = intIn(b.dbLatencyMs, 0, 1000, "dbLatencyMs");
    if (b.queueMax !== undefined) demo.queueMax = intIn(b.queueMax, 0, 500, "queueMax");
    res.json(config());
  } catch (err) {
    next(err);
  }
});

router.post("/reset", (_req, res) => {
  gate.setLimit(DB_POOL_MAX);
  demo.dbLatencyMs = 0;
  demo.queueMax = DB_QUEUE_MAX;
  res.json(config());
});

const planNodes = (node, out = []) => {
  out.push(node["Node Type"] + (node["Index Name"] ? ` (${node["Index Name"]})` : ""));
  (node.Plans || []).forEach((p) => planNodes(p, out));
  return out;
};

// Which of `count` equal slices of the id range hold matches, as [index, matches] pairs.
const matchBlocks = async (client, pattern, count) => {
  const [{ lo, hi }] = (await client.query("SELECT min(id) AS lo, max(id) AS hi FROM logs")).rows;
  if (lo === null) return [];
  const { rows } = await client.query(
    `SELECT width_bucket(id::float8, $2::float8, $3::float8 + 1, $4::int) - 1 AS block, count(*)::int AS n
     FROM logs
     WHERE message ILIKE $1 AND id <= $3::bigint
     GROUP BY 1`,
    [pattern, lo, hi, count]
  );
  return rows.map((r) => [r.block, r.n]);
};

/**
 * Race the same search with and without the trigram index. Each plan runs inside a
 * transaction that is rolled back, so no data or settings change. Postgres cannot
 * use a GIN index except through a bitmap scan, so disabling bitmap scans forces
 * the sequential-scan plan.
 */
router.get("/explain", publicRaceLimit, publicRaceGuard, async (req, res, next) => {
  const search = String(req.query.search || "");
  rejectNul(search, "search");
  const term = search.slice(0, 100);
  if (term.length < 3) return next(new ValidationError("search must be at least 3 characters"));
  const blockCount = intIn(req.query.blocks ?? 400, 1, 1000, "blocks");

  racing = true;
  let client;
  try {
    client = await pool.connect();
    const sql = "EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM logs WHERE message ILIKE $1";
    const param = [`%${escapeLike(term)}%`];
    const run = async (forceScan) => {
      await client.query("BEGIN");
      try {
        if (forceScan) await client.query("SET LOCAL enable_bitmapscan = off");
        const r = await client.query(sql, param);
        const plan = r.rows[0]["QUERY PLAN"][0];
        return { ms: plan["Execution Time"], nodes: planNodes(plan.Plan) };
      } finally {
        await client.query("ROLLBACK");
      }
    };

    await run(true); // warm the cache for both so neither pays a cold-read penalty
    await run(false);
    const scan = await run(true);
    const indexed = await run(false);
    const [{ n: matches }] = (
      await client.query("SELECT count(*)::int AS n FROM logs WHERE message ILIKE $1", param)
    ).rows;
    const [{ n: rows }] = (
      await client.query("SELECT GREATEST(reltuples, 0)::bigint AS n FROM pg_class WHERE oid = 'logs'::regclass")
    ).rows;

    const blocks = await matchBlocks(client, param[0], blockCount);

    res.json({ term, matches, tableRows: Number(rows), scan, indexed, blocks });
  } catch (err) {
    next(err);
  } finally {
    client?.release();
    racing = false;
  }
});

export default router;
