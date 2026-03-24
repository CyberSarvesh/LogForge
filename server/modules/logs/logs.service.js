import { insertLog, fetchLogs } from "./logs.repository.js";
import { validateLog } from "./logs.schema.js";

export const createLogService = async (data) => {
  validateLog(data);
  return await insertLog(data);
};

export const getLogsService = async (query) => {
  return await fetchLogs(query);
};