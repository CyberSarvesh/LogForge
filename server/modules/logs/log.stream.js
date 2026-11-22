import { PUBLIC_DEMO } from "../../config/env.js";
import { clientKey } from "../../middlewares/clientKey.js";

// Live tail over Server-Sent Events. Inserted rows are buffered and flushed
// a few times a second so a 20k logs/sec burst can't flood browsers.
const clients = new Map(); // response -> client key
let buffer = [];
let count = 0;
let timer = null;

const FLUSH_MS = 250;
const MAX_ROWS_PER_FLUSH = 40;
// Every stream holds a socket and memory. Per-IP is generous: a room of viewers can share one IP.
const MAX_STREAMS = PUBLIC_DEMO ? 300 : Infinity;
const MAX_STREAMS_PER_IP = PUBLIC_DEMO ? 40 : Infinity;

const flush = () => {
  if (count === 0) return;
  const payload = JSON.stringify({ rows: buffer.slice(-MAX_ROWS_PER_FLUSH), count });
  buffer = [];
  count = 0;
  for (const res of clients.keys()) {
    // A reader that can't keep up misses updates, so its buffer can't grow without bound.
    if (!res.writableNeedDrain) res.write(`event: logs\ndata: ${payload}\n\n`);
  }
};

export const publish = (rows) => {
  if (clients.size === 0) return;
  count += rows.length;
  buffer.push(...rows.slice(-MAX_ROWS_PER_FLUSH));
  if (buffer.length > MAX_ROWS_PER_FLUSH * 4) buffer = buffer.slice(-MAX_ROWS_PER_FLUSH);
};

export const subscribe = (req, res) => {
  const key = clientKey(req);
  const mine = [...clients.values()].filter((k) => k === key).length;
  if (clients.size >= MAX_STREAMS || mine >= MAX_STREAMS_PER_IP) {
    return res.status(503).json({ error: "Too many live tails are open" });
  }
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // asks proxies not to hold events back
  });
  res.flushHeaders();
  res.write("retry: 2000\n\n");

  clients.set(res, key);
  if (!timer) timer = setInterval(flush, FLUSH_MS);

  const heartbeat = setInterval(() => {
    if (!res.writableNeedDrain) res.write(": ping\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) {
      clearInterval(timer);
      timer = null;
      buffer = [];
      count = 0;
    }
  });
};

export const closeStreams = () => {
  for (const res of clients.keys()) res.end();
};
