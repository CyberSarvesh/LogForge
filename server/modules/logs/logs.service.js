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

export const getStatsService = async (query) => {
  const windowSecs = Math.min(Math.max(Number(query.window) || 300, 10), 86400);
  const bucketSecs = Math.min(Math.max(Number(query.bucket) || 5, 1), 3600);
  return { windowSecs, bucketSecs, ...(await fetchStats({ windowSecs, bucketSecs })) };
};
