import { pool } from "../../db/client.js";

export const insertLog = async (log) => {
  const result = await pool.query(
    `INSERT INTO logs (service, level, message, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [log.service, log.level, log.message, log.metadata || {}]
  );
  return result.rows[0];
};

// One round trip and one statement for the whole batch.
export const insertLogs = async (logs) => {
  const result = await pool.query(
    `INSERT INTO logs (service, level, message, metadata)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::jsonb[])
     RETURNING *`,
    [
      logs.map((l) => l.service),
      logs.map((l) => l.level),
      logs.map((l) => l.message),
      logs.map((l) => JSON.stringify(l.metadata || {})),
    ]
  );
  return result.rows;
};

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

export const fetchLogs = async ({ service, level, search, before, limit }) => {
  const values = [];
  const where = [];

  if (service) {
    values.push(service);
    where.push(`service = $${values.length}`);
  }
  if (level) {
    values.push(level);
    where.push(`level = $${values.length}`);
  }
  if (search) {
    values.push(`%${escapeLike(search)}%`);
    where.push(`message ILIKE $${values.length}`);
  }
  if (before) {
    values.push(before);
    where.push(`id < $${values.length}`);
  }
  values.push(limit);

  const sql = `
    SELECT * FROM logs
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id DESC
    LIMIT $${values.length}`;

  const result = await pool.query(sql, values);
  return result.rows;
};

export const fetchStats = async ({ windowSecs, bucketSecs }) => {
  const [series, services, total] = await Promise.all([
    pool.query(
      `SELECT date_bin(make_interval(secs => $2), timestamp, TIMESTAMPTZ '2000-01-01') AS t,
              level, count(*)::int AS n
       FROM logs
       WHERE timestamp > now() - make_interval(secs => $1)
       GROUP BY 1, 2
       ORDER BY 1`,
      [windowSecs, bucketSecs]
    ),
    pool.query(
      `SELECT service, count(*)::int AS n
       FROM logs
       WHERE timestamp > now() - make_interval(secs => $1)
       GROUP BY service
       ORDER BY n DESC
       LIMIT 12`,
      [windowSecs]
    ),
    // Planner estimate: instant even on huge tables, unlike count(*).
    pool.query(
      `SELECT GREATEST(reltuples, 0)::bigint AS n FROM pg_class WHERE oid = 'logs'::regclass`
    ),
  ]);

  let totalRows = Number(total.rows[0]?.n ?? 0);
  if (totalRows < 50000) {
    // Estimate is stale on small/new tables; an exact count is cheap here.
    totalRows = Number((await pool.query("SELECT count(*) AS n FROM logs")).rows[0].n);
  }

  return {
    series: series.rows,
    services: services.rows,
    totalRows,
  };
};

export const ping = async () => {
  await pool.query("SELECT 1");
};
