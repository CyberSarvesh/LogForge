import express from "express";
import {
  createLog,
  createLogsBatch,
  getLogs,
  getStats,
  streamLogs,
} from "./log.controller.js";

const router = express.Router();

router.post("/", createLog);
router.post("/batch", createLogsBatch);
router.get("/", getLogs);
router.get("/stats", getStats);
router.get("/stream", streamLogs);

export default router;
