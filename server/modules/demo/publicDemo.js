import { pool } from "../../db/client.js";
import { DEMO_RESET_AT_MB } from "../../config/env.js";

const SAMPLE_ROWS = 100000;
const CHUNK = 10000; // short statements, so a tiny database stays responsive and under the timeout
const MIN_ROWS = 50000; // below this the tour's index race means nothing
const CHECK_MS = 5000;

// Deterministic samples, so the tour's default search ("Payment 4242") always has a few matches.
const SEED_SQL = `
  INSERT INTO logs (service, level, message, timestamp)
  SELECT
    (ARRAY['auth','payments','gateway','orders','search','notifications','inventory'])[1 + g % 7],
    (ARRAY['info','info','info','info','info','info','info','warn','warn','error'])[1 + g % 10],
    CASE g % 7
      WHEN 0 THEN 'User ' || g % 5000 || ' logged in'
      WHEN 1 THEN 'Payment ' || g % 5000 || ' authorized'
      WHEN 2 THEN 'Request ' || g || ' completed'
      WHEN 3 THEN 'Retrying job ' || g || ' (attempt ' || (1 + g % 4) || ')'
      WHEN 4 THEN 'Cache miss for key user:' || g
      WHEN 5 THEN 'Webhook ' || g || ' delivered'
      ELSE 'Upstream timeout after ' || (100 + g % 900) || 'ms'
    END,
    now() - make_interval(secs => ($3::int - g) * 0.5)
  FROM generate_series($1::int, $2::int) AS g`;

const seed = async () => {
  for (let from = 1; from <= SAMPLE_ROWS; from += CHUNK) {
    await pool.query(SEED_SQL, [from, from + CHUNK - 1, SAMPLE_ROWS]);
  }
  await pool.query("ANALYZE logs");
};

/**
 * A public demo takes writes from strangers into a 1 GB database that suspends itself when full.
 * Seeds sample data and, if DEMO_RESET_AT_MB is set, wipes the logs table back to it at that size.
 * TRUNCATE is used because it returns the disk space immediately, unlike DELETE.
 */
export const startPublicDemo = () => {
  let busy = false;
  let needsSeedCheck = true;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (DEMO_RESET_AT_MB) {
        const { rows } = await pool.query("SELECT pg_total_relation_size('logs') / 1048576 AS mb");
        if (Number(rows[0].mb) >= DEMO_RESET_AT_MB) {
          console.log(`Public demo: logs reached ${rows[0].mb} MB, resetting to sample data.`);
          await pool.query("TRUNCATE logs");
          needsSeedCheck = true;
        }
        // The table is UNLOGGED (see db/setup.js), so a Postgres crash also empties it.
        const { rows: found } = await pool.query("SELECT EXISTS (SELECT 1 FROM logs) AS any");
        if (!found[0].any) needsSeedCheck = true;
      }
      if (needsSeedCheck) {
        const { rows } = await pool.query("SELECT count(*)::int AS n FROM (SELECT 1 FROM logs LIMIT $1) AS t", [MIN_ROWS]);
        if (rows[0].n < MIN_ROWS) {
          await seed();
          console.log(`Public demo: added ${SAMPLE_ROWS} sample logs.`);
        }
        needsSeedCheck = false;
      }
    } catch (err) {
      console.error("Public demo upkeep failed, will retry:", err.message);
    } finally {
      busy = false;
    }
  };

  tick();
  setInterval(tick, CHECK_MS).unref();
};
