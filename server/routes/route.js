import express from "express";
import logsRoutes from "../modules/logs/log.routes.js";
import { ping } from "../modules/logs/log.repository.js";

const router = express.Router();

router.get("/health", async (req, res) => {
  const start = performance.now();
  try {
    await ping();
    res.json({ status: "ok", db: "up", dbMs: Math.round((performance.now() - start) * 100) / 100 });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

router.use("/logs", logsRoutes);

export default router;
