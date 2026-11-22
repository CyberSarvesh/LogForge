import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes/route.js";
import rateLimitMiddleware from "./middlewares/rateLimit.middleware.js";
import { metricsMiddleware } from "./middlewares/metrics.middleware.js";
import errorMiddleware, { notFound } from "./middlewares/error.middleware.js";

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir));

app.use("/api", metricsMiddleware, rateLimitMiddleware, routes);

app.use(notFound);
app.use(errorMiddleware);

export default app;
