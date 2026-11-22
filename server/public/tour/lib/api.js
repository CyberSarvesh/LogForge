import { sleep } from "./util.js";

// HTTP/1.1 browsers open 6 connections per host. The live tail holds one and metrics
// polling needs one, so 4 senders is the most that really run in parallel.
export const SENDERS = 4;

const SERVICES = ["auth", "payments", "gateway", "orders", "search", "notifications", "inventory"];
const REGIONS = ["us-east", "eu-west", "ap-south"];
const MESSAGES = [
  (r) => `Request ${r} completed`,
  (r) => `Cache miss for key user:${r}`,
  (r) => `Upstream timeout after ${(r % 900) + 100}ms`,
  (r) => `Payment ${r} authorized`,
  (r) => `Retrying job ${r} (attempt ${(r % 4) + 1})`,
  (r) => `Connection pool saturated (${r % 50} waiting)`,
  (r) => `User ${r} logged in`,
  (r) => `Slow query detected: ${(r % 2000) + 300}ms`,
  (r) => `Webhook ${r} delivered`,
  (r) => `Disk usage at ${(r % 30) + 70}%`,
];

const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function generateLog() {
  const r = Math.floor(Math.random() * 1e6);
  const p = Math.random();
  return {
    service: pick(SERVICES),
    level: p < 0.7 ? "info" : p < 0.92 ? "warn" : "error",
    message: pick(MESSAGES)(r),
    metadata: { requestId: r.toString(36), region: pick(REGIONS) },
  };
}

export const generateLogs = (count) => Array.from({ length: count }, generateLog);

/** Never throws for HTTP or network failures: status 0 means unreachable or aborted. */
export async function request(method, path, body, signal) {
  const start = performance.now();
  try {
    const res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    return { status: res.status, data, retryAfter, ms: performance.now() - start };
  } catch (err) {
    const error = err.name === "AbortError" ? "Cancelled" : "Cannot reach the LogForge server";
    return { status: 0, data: { error }, retryAfter: 0, ms: performance.now() - start };
  }
}

export const errorText = ({ status, data }) =>
  `${status ? `HTTP ${status}: ` : ""}${data?.error || "Request failed"}`;

/**
 * Sends batches from `senders` parallel loops until stopped. Honours Retry-After.
 * `onResult` sees every response, so nothing on screen has to be sampled.
 */
export function startLoad({ senders, batch, signal, durationMs = Infinity, onResult }) {
  const start = performance.now();
  let stopped = false;
  const running = () => !stopped && !signal.aborted && performance.now() - start < durationMs;

  const sendLoop = async (sender) => {
    while (running()) {
      const res = await request("POST", "/logs/batch", generateLogs(batch), signal);
      if (signal.aborted) return;
      onResult(res, sender);
      if (res.status === 201) continue;
      const until = performance.now() + (res.retryAfter * 1000 || 500);
      while (running() && performance.now() < until) await sleep(50);
    }
  };

  return {
    stop() {
      stopped = true;
    },
    done: Promise.all(Array.from({ length: senders }, (_, i) => sendLoop(i))).then(() => performance.now() - start),
  };
}

/** Polls /api/metrics one request at a time, so polling never takes a second connection. */
export function watchMetrics({ signal, everyMs, onSample }) {
  let stopped = false;
  (async () => {
    while (!stopped && !signal.aborted) {
      const res = await request("GET", "/metrics", undefined, signal);
      if (!stopped && !signal.aborted && res.status === 200) onSample(res.data);
      await sleep(everyMs);
    }
  })();
  return () => {
    stopped = true;
  };
}
