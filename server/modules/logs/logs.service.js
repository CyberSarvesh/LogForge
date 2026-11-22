import { insertLog, insertLogs, fetchLogs, fetchStats } from "./log.repository.js";
import { validateLog, validateBatch, parseQuery } from "./log.schema.js";
import { publish } from "./log.stream.js";

export const createLogService = async (data) => {
  validateLog(data);
  const row = await insertLog(data);
  publish([row]);
  return row;
};

export const createLogsBatchService = async (logs) => {
  validateBatch(logs);
  const rows = await insertLogs(logs);
  publish(rows);
  return { inserted: rows.length };
};

export const getLogsService = async (query) => {
  const params = parseQuery(query);
  const data = await fetchLogs(params);
  const nextCursor = data.length === params.limit ? data[data.length - 1].id : null;
  return { data, nextCursor };
};

// Stats aggregate every row in the window, which gets expensive during heavy ingest.
// Cache for 1s and share one in-flight query between all callers so dashboards
// can't pile aggregate queries on top of the write load.
const STATS_TTL_MS = 1000;
const statsCache = new Map();

export const getStatsService = async (query) => {
  const windowSecs = Math.min(Math.max(Number(query.window) || 300, 10), 86400);
  const bucketSecs = Math.min(Math.max(Number(query.bucket) || 5, 1), 3600);
  const key = `${windowSecs}:${bucketSecs}`;

  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.promise;

  const promise = fetchStats({ windowSecs, bucketSecs }).then((s) => ({ windowSecs, bucketSecs, ...s }));
  statsCache.set(key, { at: Date.now(), promise });
  promise.catch(() => statsCache.delete(key));
  return promise;
};
