import {
  createLogService,
  createLogsBatchService,
  getLogsService,
  getStatsService,
} from "./logs.service.js";
import { subscribe } from "./log.stream.js";

const timed = async (fn) => {
  const start = performance.now();
  const result = await fn();
  return { ...result, tookMs: Math.round((performance.now() - start) * 100) / 100 };
};

export const createLog = async (req, res, next) => {
  try {
    res.status(201).json(await createLogService(req.body));
  } catch (err) {
    next(err);
  }
};

export const createLogsBatch = async (req, res, next) => {
  try {
    res.status(201).json(await timed(() => createLogsBatchService(req.body)));
  } catch (err) {
    next(err);
  }
};

export const getLogs = async (req, res, next) => {
  try {
    res.json(await timed(() => getLogsService(req.query)));
  } catch (err) {
    next(err);
  }
};

export const getStats = async (req, res, next) => {
  try {
    res.json(await timed(() => getStatsService(req.query)));
  } catch (err) {
    next(err);
  }
};

export const streamLogs = (req, res) => subscribe(req, res);
