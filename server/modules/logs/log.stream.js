// Live tail over Server-Sent Events. Inserted rows are buffered and flushed
// a few times a second so a 20k logs/sec burst can't flood browsers.
const clients = new Set();
let buffer = [];
let count = 0;
let timer = null;

const FLUSH_MS = 250;
const MAX_ROWS_PER_FLUSH = 40;

const flush = () => {
  if (count === 0) return;
  const payload = JSON.stringify({ rows: buffer.slice(-MAX_ROWS_PER_FLUSH), count });
  buffer = [];
  count = 0;
  for (const res of clients) res.write(`event: logs\ndata: ${payload}\n\n`);
};

export const publish = (rows) => {
  if (clients.size === 0) return;
  count += rows.length;
  buffer.push(...rows.slice(-MAX_ROWS_PER_FLUSH));
  if (buffer.length > MAX_ROWS_PER_FLUSH * 4) buffer = buffer.slice(-MAX_ROWS_PER_FLUSH);
};

export const subscribe = (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("retry: 2000\n\n");

  clients.add(res);
  if (!timer) timer = setInterval(flush, FLUSH_MS);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
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
