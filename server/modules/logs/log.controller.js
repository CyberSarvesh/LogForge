import {
  createLogService,
  getLogsService,
} from "./logs.service.js";

export const createLog = async (req, res, next) => {
  try {
    const log = await createLogService(req.body);
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

export const getLogs = async (req, res, next) => {
  try {
    const logs = await getLogsService(req.query);
    res.json(logs);
  } catch (err) {
    next(err);
  }
};