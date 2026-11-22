import express from "express";
import { pool, gate } from "../../db/client.js";
import { demo, DB_POOL_MAX, DB_QUEUE_MAX, ENABLE_DEMO } from "../../config/env.js";
import { ValidationError } from "../logs/log.schema.js";

const router = express.Router();

// Demo endpoints change runtime behaviour on purpose; keep them off unless enabled.
router.use((_req, res, next) => {
  if (!ENABLE_DEMO) return res.status(404).json({ error: "Demo endpoints are disabled" });
  next();
});

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

const escapeLike = (s) => s.replace(/[\%_]/g, "\$&");

/**
 * Race the same search with and without the trigram index. Each plan runs inside a
 * transaction that is rolled back, so no data or settings change. Postgres cannot
 * use a GIN index except through a bitmap scan, so disabling bitmap scans forces
 * the sequential-scan plan.
 */
router.get("/explain", async (req, res, next) => {
  const term = String(req.query.search || "").slice(0, 100);
  if (term.length < 3) return next(new ValidationError("search must be at least 3 characters"));

  const client = await pool.connect();
  try {
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

    res.json({ term, matches, tableRows: Number(rows), scan, indexed });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

export default router;
