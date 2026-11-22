import express from "express";
import backpressure from "../../middlewares/backpressure.middleware.js";
import {
  createLog,
  createLogsBatch,
  getLogs,
  getStats,
  streamLogs,
} from "./log.controller.js";

const router = express.Router();

router.post("/", backpressure, createLog);
router.post("/batch", backpressure, createLogsBatch);
router.get("/", getLogs);
router.get("/stats", getStats);
router.get("/stream", streamLogs);

export default router;
