import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_DEMO } from "./config/env.js";
import routes from "./routes/route.js";
import rateLimitMiddleware from "./middlewares/rateLimit.middleware.js";
import { metricsMiddleware } from "./middlewares/metrics.middleware.js";
import errorMiddleware, { notFound } from "./middlewares/error.middleware.js";

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  next();
});
// Liveness for the host: no database, rate limit or body parsing, so it answers under any load.
app.get("/api/live", (_req, res) => res.json({ status: "ok" }));

app.use(cors());
// In public, no compressed bodies (decompression bombs) and no more than a full batch needs.
app.use(express.json(PUBLIC_DEMO ? { limit: "512kb", inflate: false } : { limit: "5mb" }));
app.use(express.static(publicDir));

app.use("/api", metricsMiddleware, rateLimitMiddleware, routes);

app.use(notFound);
app.use(errorMiddleware);

export default app;
