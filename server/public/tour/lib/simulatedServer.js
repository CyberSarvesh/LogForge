// Stands in for the server in "Break it" where the real controls are unavailable, such as a public
// deploy: one visitor must not be able to sabotage the server for everyone else. Same rules as
// db/client.js and the backpressure middleware, running in the visitor's own tab.
import { sleep } from "./util.js";

const INSERT_MS = 110; // a typical 100-log insert, slowed enough to watch

export const SIMULATED_DEFAULTS = {
  poolLimit: 20,
  poolCapacity: 20,
  dbLatencyMs: 0,
  queueMax: 50,
  queueMaxDefault: 50,
};

export function createSimulatedServer() {
  let config = { ...SIMULATED_DEFAULTS };
  let active = 0;
  const waiters = [];

  const drain = () => {
    while (active < config.poolLimit && waiters.length) {
      active++;
      waiters.shift()();
    }
  };

  return {
    configure(next) {
      config = { ...config, ...next };
      drain();
    },

    async send() {
      const start = performance.now();
      await sleep(15); // the trip there
      if (waiters.length >= config.queueMax) {
        return { status: 503, data: { error: "Overloaded" }, retryAfter: 1, ms: performance.now() - start };
      }
      await new Promise((resolve) => {
        waiters.push(resolve);
        drain();
      });
      try {
        await sleep(INSERT_MS * (0.8 + Math.random() * 0.4) + config.dbLatencyMs);
      } finally {
        active--;
        drain();
      }
      return { status: 201, data: {}, retryAfter: 0, ms: performance.now() - start };
    },

    readMetrics: async () => ({ status: 200, data: { pool: { busy: active, waiting: waiters.length } } }),
  };
}
