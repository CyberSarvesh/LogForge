import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL;
// Requests per minute per IP across /api (the UI's load generator needs headroom).
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 2000;
// Postgres connections in the pool, and how many requests may queue for one before we shed load.
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX) || 20;
export const DB_QUEUE_MAX = Number(process.env.DB_QUEUE_MAX) || 50;
