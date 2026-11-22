import { pool } from "../db/client.js";
import { DB_QUEUE_MAX } from "../config/env.js";

// Load shedding: when requests are already queuing for a DB connection, taking
// more only makes everyone slower and risks memory blowup. Tell clients to back off.
const backpressureMiddleware = (req, res, next) => {
  if (pool.waitingCount > DB_QUEUE_MAX) {
    res.set("Retry-After", "1");
    return res.status(503).json({ error: "Overloaded: database queue is full, retry shortly." });
  }
  next();
};

export default backpressureMiddleware;
