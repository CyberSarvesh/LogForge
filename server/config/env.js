import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL;
// Requests per minute per IP across /api (the UI's load generator needs headroom).
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 2000;
// Postgres connections in the pool, and how many requests may queue for one before we shed load.
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX) || 20;
export const DB_QUEUE_MAX = Number(process.env.DB_QUEUE_MAX) || 50;
// Demo/chaos endpoints (/api/demo/*) let the guided tour resize the DB gate and inject latency.
// Never on in production unless explicitly enabled.
export const ENABLE_DEMO =
  process.env.ENABLE_DEMO !== undefined
    ? process.env.ENABLE_DEMO === "true"
    : process.env.NODE_ENV !== "production";

// Mutable at runtime by the demo API.
export const demo = { dbLatencyMs: 0, queueMax: DB_QUEUE_MAX };
