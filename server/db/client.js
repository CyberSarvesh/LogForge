import pkg from "pg";
import { DATABASE_URL, DB_POOL_MAX } from "../config/env.js";

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
});
