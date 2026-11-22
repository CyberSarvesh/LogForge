import { startLoad, watchMetrics, SENDERS } from "../lib/api.js";
import { COLOR, plate, gridSlot } from "../lib/props.js";
import { ease } from "../engine/math.js";
import { formatCount, formatMs, percentile, sleep, stat } from "../lib/util.js";

const STAGE_MS = 3500;
const PER_LAYER = 9;
const MAX_CUBES = 162;
const STAGES = [
  { senders: 1, batch: 500 },
  { senders: 2, batch: 500 },
  { senders: 3, batch: 500 },
  { senders: SENDERS, batch: 500 },
  { senders: SENDERS, batch: 1000 },
];
const towerX = (i) => (i - (STAGES.length - 1) / 2) * 6;

/** The smallest round number of logs/sec per cube that keeps the tallest tower on screen. */
function cubeValue(max) {
  for (let power = 10; ; power *= 10) {
    for (const k of [1, 2, 5]) {
      if (max / (k * power) <= MAX_CUBES) return k * power;
    }
  }
}

function explain(stages) {
  const peak = stages.reduce((a, b) => (b.rate > a.rate ? b : a));
  const percent = Math.round(peak.serviceShare * 100);

  if (stages.some((s) => s.refused)) return "The server refused work, so a configured limit was reached: the DB queue or the rate limiter.";
  if (peak.waiting) return "Requests queued for a database connection, so the DB gate is the limit.";
  if (peak.cpu > 85) return `Node is the limit. Its one process was at ${Math.round(peak.cpu)}% CPU, so more processes would help.`;
  if (stages[3].rate > stages[0].rate * 3.2) return "Throughput was still growing with each sender, so this browser is the limit. A tool like k6 could push further.";
  if (peak.serviceShare > 0.6) return `Postgres is the limit. ${percent}% of each request was spent waiting for the insert, while Node used ${Math.round(peak.cpu)}% CPU. Every index makes a write cost more.`;
  return `No single part maxed out. The insert took ${percent}% of each request, and the rest went on JSON, the network and this browser.`;
}

export default {
  nav: "Limits",
  title: "Find the ceiling",
  lead: "Add load in steps until more load stops buying more throughput. Each tower is one measured step, built out of the logs it stored per second.",
  panel: `
    <div class="actions"><button type="button" class="primary" id="run">Push it to the limit</button></div>
    <p id="caption" aria-live="polite">Five steps, about 20 seconds in total. It writes real rows.</p>
    <div class="stats">${stat("peak", "peak logs / sec")}${stat("latencyP95", "p95 at peak")}</div>
    <p id="verdict"></p>
    <p class="note">A browser runs ${SENDERS} useful senders at most, so this client is part of what is measured.</p>`,

  mount(ctx) {
    let stages = [];
    let current = null;

    ctx.action("run", async () => {
      stages = [];
      for (const id of ["peak", "latencyP95", "verdict"]) ctx.$(id).textContent = "";

      for (const [index, step] of STAGES.entries()) {
        ctx.$("caption").textContent = `Step ${index + 1} of ${STAGES.length}: ${step.senders} × ${step.batch} logs at a time…`;
        const latencies = [];
        const shares = [];
        const cpus = [];
        let logs = 0;
        let refused = 0;
        let failed = null;
        let waiting = 0;
        const began = performance.now();
        current = { index, rate: 0 };

        const stopWatching = watchMetrics({
          signal: ctx.signal,
          everyMs: 500,
          onSample(m) {
            cpus.push(m.cpuPct);
            waiting = Math.max(waiting, m.pool.waiting);
          },
        });
        const load = startLoad({
          ...step,
          signal: ctx.signal,
          durationMs: STAGE_MS,
          onResult(res) {
            if (res.status === 201) {
              logs += step.batch;
              latencies.push(res.ms);
              shares.push(res.data.tookMs / res.ms);
            } else if (res.status === 503 || res.status === 429) {
              refused++;
            } else {
              failed = res;
            }
            current.rate = logs / Math.max(1, (performance.now() - began) / 1000);
          },
        });
        const elapsed = await load.done;
        stopWatching();
        current = null;
        if (ctx.signal.aborted) return;
        if (failed || !logs) {
          ctx.$("caption").textContent = "The test stopped, because requests failed.";
          throw new Error(failed?.data?.error || "No request succeeded.");
        }

        stages.push({
          ...step,
          rate: logs / (elapsed / 1000),
          p95: percentile(latencies, 0.95),
          serviceShare: percentile(shares, 0.5),
          // The first sample covers the idle time before the step.
          cpu: percentile(cpus.slice(1), 0.5) ?? 0,
          waiting,
          refused,
          at: ctx.now(),
        });
        const peak = stages.reduce((a, b) => (b.rate > a.rate ? b : a));
        ctx.$("peak").textContent = formatCount(peak.rate);
        ctx.$("latencyP95").textContent = formatMs(peak.p95);
        await sleep(300);
        if (ctx.signal.aborted) return;
      }
      ctx.$("caption").textContent = "Done.";
      ctx.$("verdict").textContent = explain(stages);
    });

    return {
      view: () => ({ min: [-15, 0, -2.5], max: [15, 17.5, 3.5], direction: [0.18, 0.38, 1] }),

      draw(g, now) {
        const max = Math.max(1000, current?.rate ?? 0, ...stages.map((s) => s.rate));
        const value = cubeValue(max);
        const peak = Math.max(0, ...stages.map((s) => s.rate));

        STAGES.forEach((step, i) => {
          const x = towerX(i);
          const stage = stages[i];
          const measuring = current?.index === i;
          const rate = stage?.rate ?? (measuring ? current.rate : 0);
          const best = stage && stage.rate === peak;
          const cubes = Math.round(rate / value);

          plate(g, [x, 0, 0], 3.5, 3.5, measuring ? COLOR.steel : COLOR.dark);
          for (let k = 0; k < cubes; k++) {
            const layer = Math.floor(k / PER_LAYER);
            const [cx, , cz] = gridSlot(k % PER_LAYER, [3, 3, 1], 0.86, [x, 0, 0]);
            const drop = stage ? (1 - ease((now - stage.at - layer * 25) / 350)) * 0.6 : 0;
            g.box([cx, 0.55 + layer * 0.84 + drop, cz], [0.74, 0.74, 0.74], best ? COLOR.ok : COLOR.info, {
              radius: 0.12,
              glow: measuring ? 0.4 : 0.08,
            });
          }

          const top = 1.4 + Math.ceil(cubes / PER_LAYER) * 0.84;
          if (rate) g.label(`rate${i}`, [x, top, 0], formatCount(rate), best ? "big ok" : "big");
          g.label(`step${i}`, [x, -0.5, 3.4], `${step.senders} × ${step.batch}<small>senders × batch</small>`);
        });
        if (stages.length || current) g.label("scale", [-11, 17, 0], `1 cube = ${formatCount(value)} logs/sec`);
      },
    };
  },
};
