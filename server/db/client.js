import pkg from "pg";
import { DATABASE_URL, DB_POOL_MAX, demo } from "../config/env.js";

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
});

// ---- Concurrency gate (bulkhead) ------------------------------------------------
// Caps how many queries run against Postgres at once and exposes the wait queue.
// pg's own pool queue is hidden and its max can't be shrunk at runtime, so we gate
// in front of it. That makes "busy / limit / waiting" exact and lets backpressure
// and the demo controls act on one source of truth.
let limit = DB_POOL_MAX;
let active = 0;
const waiters = [];

const acquire = () =>
  new Promise((resolve) => {
    if (active < limit) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });

const drain = () => {
  while (active < limit && waiters.length) {
    active++;
    waiters.shift()();
  }
};

const release = () => {
  active--;
  drain();
};

export const gate = {
  get limit() {
    return limit;
  },
  get active() {
    return active;
  },
  get waiting() {
    return waiters.length;
  },
  setLimit(n) {
    limit = Math.max(1, Math.min(DB_POOL_MAX, n));
    drain();
  },
};

// ---- Per-stage timing -----------------------------------------------------------
let waitSamples = [];
let querySamples = [];

export const takeDbStats = () => {
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const stats = {
    samples: querySamples.length,
    avgWaitMs: Math.round(avg(waitSamples) * 10) / 10,
    avgQueryMs: Math.round(avg(querySamples) * 10) / 10,
  };
  waitSamples = [];
  querySamples = [];
  return stats;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run one query through the gate. All app queries go through here. */
export const query = async (sql, params) => {
  const t0 = performance.now();
  await acquire();
  const t1 = performance.now();
  let client;
  try {
    client = await pool.connect();
    if (demo.dbLatencyMs > 0) await sleep(demo.dbLatencyMs); // simulated slow database
    const result = await client.query(sql, params);
    if (waitSamples.length < 5000) {
      waitSamples.push(t1 - t0);
      querySamples.push(performance.now() - t1);
    }
    return result;
  } finally {
    client?.release();
    release();
  }
};
