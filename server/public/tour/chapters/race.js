import { generateLogs, request, errorText, SENDERS } from "../lib/api.js";
import { COLOR, belt, plate, cage, gridSlot, database } from "../lib/props.js";
import { clamp, lerp } from "../engine/math.js";
import { formatMs, formatRatio, percentile, replayClock, describeSpeed, stat } from "../lib/util.js";

const COUNT = 500;
const BATCH_RUNS = 3;
const PITCH = 0.44;
const CUBE = [0.34, 0.34, 0.34];
const START = -16;
const TRAY = 14;
const FROM = -9.5;
const TO = 7.5;
const SINGLE_Z = -6.5;
const BATCH_Z = 6.5;

export default {
  nav: "The race",
  title: "500 trips, or one",
  lead: "Both lanes store the same 500 logs. The far lane makes a request for every log. The near lane puts all of them in one request. Both are timed for real, then replayed on one shared clock.",
  panel: `
    <div class="actions">
      <button type="button" class="primary" id="run">Run the race</button>
      <button type="button" id="again" hidden>Replay</button>
    </div>
    <p id="caption" aria-live="polite">Ready: 500 cubes in each lane.</p>
    <div class="stats">${stat("singleTime", "500 requests")}${stat("batchTime", "1 request")}${stat("ratio", "faster")}</div>
    <p class="note">The far lane gets ${SENDERS} requests in parallel, which favours it. The batch time is the median of ${BATCH_RUNS} runs. A race writes ${COUNT * (BATCH_RUNS + 1)} rows.</p>`,

  mount(ctx) {
    const logs = generateLogs(COUNT);
    let trips = [];
    let phase = "ready";
    let measuringFrom = 0;
    let replayFrom = 0;
    let singleMs = 0;
    let batchMs = 0;

    function replay() {
      phase = "replay";
      replayFrom = ctx.now();
      ctx.$("caption").textContent = "Replaying both measured runs together. Every cube leaves and lands when its request really did.";
    }
    ctx.$("again").addEventListener("click", replay, { signal: ctx.signal });

    ctx.action("run", async () => {
      ctx.$("again").hidden = true;
      for (const id of ["singleTime", "batchTime", "ratio"]) ctx.$(id).textContent = "–";
      phase = "single";
      trips = [];
      ctx.$("caption").textContent = "Timing 500 separate requests…";

      const start = performance.now();
      measuringFrom = start;
      let next = 0;
      let failure = null;
      const sendLoop = async (lane) => {
        while (next < COUNT && !failure && !ctx.signal.aborted) {
          const i = next++;
          trips[i] = { lane, start: performance.now() - start };
          const res = await request("POST", "/logs", logs[i], ctx.signal);
          trips[i].end = performance.now() - start;
          if (res.status !== 201) failure = res;
        }
      };
      await Promise.all(Array.from({ length: SENDERS }, (_, lane) => sendLoop(lane)));
      if (ctx.signal.aborted) return;
      if (failure) {
        phase = "ready";
        ctx.$("caption").textContent = "The race stopped, because a request failed.";
        throw new Error(errorText(failure));
      }
      singleMs = performance.now() - start;
      ctx.$("singleTime").textContent = formatMs(singleMs);

      phase = "batch";
      ctx.$("caption").textContent = "Timing the same 500 as one request…";
      const times = [];
      for (let i = 0; i < BATCH_RUNS; i++) {
        const res = await request("POST", "/logs/batch", logs, ctx.signal);
        if (ctx.signal.aborted) return;
        if (res.status !== 201) {
          phase = "ready";
          throw new Error(errorText(res));
        }
        times.push(res.ms);
      }
      batchMs = percentile(times, 0.5);
      ctx.$("batchTime").textContent = formatMs(batchMs);
      ctx.$("ratio").textContent = formatRatio(singleMs / batchMs);
      ctx.$("again").hidden = false;
      replay();
    });

    return {
      view: () => ({ min: [-22, 0, -13], max: [24, 4, 12], direction: [0, 1.05, 1] }),

      draw(g, now, idle) {
        let time = -1;
        let clock = null;
        if (phase === "single") time = performance.now() - measuringFrom;
        if (phase === "batch") time = Infinity;
        if (phase === "replay") {
          clock = replayClock(batchMs, singleMs, now - replayFrom);
          time = clock.ms;
        }

        for (const z of [SINGLE_Z, BATCH_Z]) {
          plate(g, [START, 0.05, z], 11.6, 9.4);
          plate(g, [TRAY, 0.05, z], 11.6, 9.4);
          belt(g, FROM, TO, z, 3.8, idle);
          database(g, [22, 0, z], { radius: 1.3, layers: 2 });
        }

        let landed = 0;
        for (let i = 0; i < COUNT; i++) {
          const color = COLOR[logs[i].level];
          const trip = trips[i];
          let position;
          if (!trip || time < trip.start) {
            position = gridSlot(i, [25, 20, 1], PITCH, [START, 0.42, SINGLE_Z]);
          } else if (trip.end === undefined || time < trip.end) {
            const progress = trip.end === undefined ? 0.5 : (time - trip.start) / Math.max(trip.end - trip.start, 0.01);
            position = [lerp(FROM, TO, progress), 0.72, SINGLE_Z + (trip.lane - (SENDERS - 1) / 2) * 0.85];
          } else {
            landed++;
            position = gridSlot(i, [25, 20, 1], PITCH, [TRAY, 0.42, SINGLE_Z]);
          }
          const flying = position[1] > 0.6;
          g.box(position, flying ? [0.6, 0.6, 0.6] : CUBE, color, { radius: 0.07, glow: flying ? 0.5 : 0.05 });
        }

        const progress = phase === "replay" ? clamp(time / batchMs) : 0;
        const batchDone = progress === 1;
        const crateX = lerp(FROM - 0.5, TO, progress);
        for (let i = 0; i < COUNT; i++) {
          const position = batchDone
            ? gridSlot(i, [25, 20, 1], PITCH, [TRAY, 0.42, BATCH_Z])
            : gridSlot(i, [10, 10, 5], PITCH, [crateX, 1.6, BATCH_Z]);
          g.box(position, CUBE, COLOR[logs[i].level], { radius: 0.07, glow: 0.05 });
        }
        if (!batchDone) cage(g, [crateX, 1.6, BATCH_Z], [4.6, 2.4, 4.6], COLOR.ok);

        g.label("single", [START, 1.6, SINGLE_Z - 5], "One log per request<small>500 requests</small>");
        g.label("batch", [START, 1.6, BATCH_Z - 2], "One batch<small>1 request</small>", "ok");
        g.label("singleCount", [TRAY, 1.6, SINGLE_Z - 5], `${landed} / 500`, "big");
        g.label("batchCount", [TRAY, 1.6, BATCH_Z - 5], `${batchDone ? 500 : 0} / 500`, "big ok");
        if (clock) {
          const speed = clock.done ? `finished in ${formatMs(singleMs)}` : describeSpeed(clock.slowdown);
          g.label("clock", [-1, 2, -10.5], `${formatMs(Math.min(time, singleMs))}<small>${speed}</small>`, "big");
          if (batchDone) g.label("won", [-1, 1.5, BATCH_Z - 3], `done at ${formatMs(batchMs)}`, "big ok");
        }
      },
    };
  },
};
