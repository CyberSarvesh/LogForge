import { gate } from "../db/client.js";
import { demo } from "../config/env.js";

// Load shedding: when requests are already queuing for the database, taking more
// only makes everyone slower and risks memory blowup. Tell clients to back off.
const backpressureMiddleware = (_req, res, next) => {
  // queueMax is the most requests allowed to wait; the next arrival is refused.
  if (gate.waiting >= demo.queueMax) {
    res.set("Retry-After", "1");
    return res.status(503).json({ error: "Overloaded: database queue is full, retry shortly." });
  }
  next();
};

export default backpressureMiddleware;
