import { monitorEventLoopDelay } from "node:perf_hooks";
import { pool, gate, takeDbStats } from "../db/client.js";
import { demo } from "../config/env.js";

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const counts = { total: 0, ok: 0, limited: 0, shed: 0, errors: 0 };
let inflight = 0;
let lastCpu = process.cpuUsage();
let lastT = performance.now();

// Long-lived or meta routes would distort in-flight/throughput numbers.
const SKIP = new Set(["/metrics", "/health", "/logs/stream"]);

export const metricsMiddleware = (req, res, next) => {
  if (SKIP.has(req.path)) return next();
  inflight++;
  res.on("close", () => {
    inflight--;
    counts.total++;
    if (res.statusCode === 429) counts.limited++;
    else if (res.statusCode === 503) counts.shed++;
    else if (res.statusCode >= 500) counts.errors++;
    else counts.ok++;
  });
  next();
};

export const snapshot = () => {
  const now = performance.now();
  const cpu = process.cpuUsage(lastCpu);
  const cpuPct = ((cpu.user + cpu.system) / ((now - lastT) * 1000)) * 100;
  lastCpu = process.cpuUsage();
  lastT = now;

  const mem = process.memoryUsage();
  const out = {
    cpuPct: Math.round(cpuPct * 10) / 10,
    loopLagP99Ms: Math.round((loop.percentile(99) / 1e6) * 10) / 10,
    loopLagMaxMs: Math.round((loop.max / 1e6) * 10) / 10,
    inflight,
    // "pool" is the concurrency gate in front of the real pg pool (see db/client.js).
    pool: {
      max: gate.limit,
      capacity: pool.options.max,
      busy: gate.active,
      waiting: gate.waiting,
      queueMax: demo.queueMax,
    },
    db: takeDbStats(),
    heapMb: Math.round(mem.heapUsed / 1048576),
    rssMb: Math.round(mem.rss / 1048576),
    requests: { ...counts },
    uptimeSecs: Math.round(process.uptime()),
  };
  loop.reset();
  return out;
};
