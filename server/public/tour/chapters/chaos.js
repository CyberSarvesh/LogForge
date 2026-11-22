import { request, errorText, startLoad, watchMetrics, SENDERS } from "../lib/api.js";
import { COLOR, plate, arch, service, database, cage, gridSlot, pulse } from "../lib/props.js";
import { clamp, ease, mix } from "../engine/math.js";
import { formatCount, formatMs, percentile, stat } from "../lib/util.js";

const BATCH = 100;
const WINDOW_MS = 3000;
const SHED_X = -8.5;
const DB = [15, 0, 0];
const GATE_SOCKETS = 20;
const LEVEL_PATTERN = ["info", "info", "warn", "info", "info", "error", "info", "info", "warn", "info"];
const PRESETS = {
  slow: { dbLatencyMs: 300 },
  narrow: { poolLimit: 1, dbLatencyMs: 120 },
  overload: { poolLimit: 1, dbLatencyMs: 300, queueMax: 1 },
};
const CONTROLS = { poolLimit: "gate", dbLatencyMs: "latency", queueMax: "queue" };

// Settings are server-wide, so a reset from the last visit must land before we read them again.
let resetting = Promise.resolve();

const senderZ = (i) => (i - (SENDERS - 1) / 2) * 3.4;
const socket = (i) => gridSlot(i, [5, 4, 1], 2.2, [5, 0, 0]);

function crate(g, [x, y, z], { refused = false, turn = 0 } = {}) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  for (let i = 0; i < BATCH; i++) {
    const [dx, dy, dz] = gridSlot(i, [5, 5, 4], 0.31, [0, 0, 0]);
    const color = refused ? COLOR.error : COLOR[LEVEL_PATTERN[(i * 7 + Math.floor(i / 10)) % 10]];
    g.box([x + dx * c + dz * s, y + dy, z - dx * s + dz * c], [0.25, 0.25, 0.25], color, { radius: 0.05, glow: 0.12, turn });
  }
}

export default {
  nav: "Break it",
  title: "Break it on purpose",
  lead: "Four services flood the server. Every crate is 100 logs. Sabotage the database and watch the queue form. When it is full the server refuses new work at once, so it never collapses.",
  panel: `
    <div id="controls">
      <div class="actions">
        <button type="button" class="primary" id="flood">Start flood</button>
        <button type="button" id="heal">Heal</button>
      </div>
      <div class="actions">
        <button type="button" id="slow-db">Slow database</button>
        <button type="button" id="narrow">One connection</button>
        <button type="button" id="overload">Overload</button>
      </div>
      <label class="slider">DB connections<input type="range" id="gate" min="1" max="20"><output id="gateValue"></output></label>
      <label class="slider">Added DB delay<input type="range" id="latency" min="0" max="500" step="10"><output id="latencyValue"></output></label>
      <label class="slider">Queue limit<input type="range" id="queue" min="0" max="50"><output id="queueValue"></output></label>
    </div>
    <p id="caption" aria-live="polite">Start the flood, or pick a way to break it.</p>
    <div class="stats">${stat("rate", "logs / sec")}${stat("latencyP95", "p95 latency")}${stat("refused", "refused (503)", "0")}</div>
    <p class="note">These are real server settings. They reset when you leave this chapter.</p>`,

  mount(ctx) {
    let config = null;
    let defaults = null;
    let metrics = null;
    let load = null;
    let stopWatching = null;
    let changed = false;
    let refused = 0;
    let recent = [];
    let flights = [];
    let writes = Promise.resolve();
    const sentAt = new Array(SENDERS).fill(-1e6);

    function showConfig() {
      for (const [key, id] of Object.entries(CONTROLS)) {
        ctx.$(id).value = config[key];
        ctx.$(`${id}Value`).textContent = key === "dbLatencyMs" ? `${config[key]} ms` : config[key];
      }
    }

    function configure(patch) {
      changed = true;
      config = { ...config, ...patch };
      showConfig();
      const { poolLimit, dbLatencyMs, queueMax } = config;
      writes = writes.then(async () => {
        if (ctx.signal.aborted) return;
        const res = await request("POST", "/demo/config", { poolLimit, dbLatencyMs, queueMax });
        if (res.status !== 200) ctx.notice(errorText(res));
      });
    }

    function setFlooding(on) {
      const button = ctx.$("flood");
      button.textContent = on ? "Stop flood" : "Start flood";
      button.classList.toggle("primary", !on);
    }

    function stop() {
      load?.stop();
      stopWatching?.();
      load = null;
      stopWatching = null;
      metrics = null;
      setFlooding(false);
    }

    function start() {
      if (load) return;
      refused = 0;
      recent = [];
      setFlooding(true);
      stopWatching = watchMetrics({ signal: ctx.signal, everyMs: 150, onSample: (m) => (metrics = m) });
      load = startLoad({
        senders: SENDERS,
        batch: BATCH,
        signal: ctx.signal,
        onResult(res, sender) {
          const now = ctx.now();
          sentAt[sender] = now;
          recent.push({ at: performance.now(), ok: res.status === 201, ms: res.ms });
          if (res.status === 503) refused++;
          if (res.status === 0) ctx.notice(errorText(res));
          flights.push({ at: now, sender, ok: res.status === 201, status: res.status });
          // Responses keep arriving in a background tab, where nothing draws them away.
          if (flights.length > 24) flights.shift();
        },
      });
    }

    function report() {
      if (!load) return;
      const now = performance.now();
      recent = recent.filter((r) => now - r.at < WINDOW_MS);
      const stored = recent.filter((r) => r.ok);
      ctx.$("rate").textContent = formatCount((stored.length * BATCH) / (WINDOW_MS / 1000));
      ctx.$("latencyP95").textContent = formatMs(percentile(stored.map((r) => r.ms), 0.95));
      ctx.$("refused").textContent = formatCount(refused);
      ctx.$("caption").textContent =
        recent.length > stored.length
          ? "Shedding load. Refused services wait for Retry-After, and accepted work keeps a bounded wait."
          : metrics?.pool.waiting
            ? "Queuing. Every free connection is taken, so requests wait their turn and latency climbs."
            : config.dbLatencyMs
              ? "Slow database. Each crate holds its connection longer, so throughput drops."
              : "Healthy. Crates get a connection as soon as they arrive.";
    }

    ctx.$("flood").addEventListener("click", () => (load ? stop() : start()), { signal: ctx.signal });
    ctx.$("heal").addEventListener("click", () => configure(defaults), { signal: ctx.signal });
    for (const [id, preset] of [["slow-db", "slow"], ["narrow", "narrow"], ["overload", "overload"]]) {
      ctx.$(id).addEventListener("click", () => {
        configure({ ...defaults, ...PRESETS[preset] });
        start();
      }, { signal: ctx.signal });
    }
    for (const [key, id] of Object.entries(CONTROLS)) {
      ctx.$(id).addEventListener("change", (event) => configure({ [key]: Number(event.target.value) }), { signal: ctx.signal });
      ctx.$(id).addEventListener("input", (event) => {
        ctx.$(`${id}Value`).textContent = key === "dbLatencyMs" ? `${event.target.value} ms` : event.target.value;
      }, { signal: ctx.signal });
    }

    ctx.$("controls").hidden = true;
    (async () => {
      await resetting;
      const res = await request("GET", "/demo/config", undefined, ctx.signal);
      if (ctx.signal.aborted) return;
      if (res.status !== 200) {
        ctx.$("caption").textContent = "The controls for this chapter are unavailable.";
        return ctx.notice(errorText(res));
      }
      config = res.data;
      defaults = { poolLimit: config.poolCapacity, dbLatencyMs: 0, queueMax: config.queueMaxDefault };
      ctx.$("gate").max = config.poolCapacity;
      ctx.$("queue").max = Math.max(50, config.queueMaxDefault);
      showConfig();
      ctx.$("controls").hidden = false;
    })();

    const timer = setInterval(report, 500);

    return {
      view: () => ({ min: [-17, 0, -8], max: [18, 6.5, 8], direction: [-0.12, 0.95, 1] }),

      leave() {
        clearInterval(timer);
        stop();
        if (changed) resetting = writes.then(() => request("POST", "/demo/reset"));
      },

      unload() {
        if (changed) navigator.sendBeacon("/api/demo/reset");
      },

      draw(g, now) {
        flights = flights.filter((f) => now - f.at < (f.ok ? 650 : 1500));
        const limit = config?.poolLimit ?? GATE_SOCKETS;
        const queueMax = config?.queueMax ?? 4;
        const busy = metrics?.pool.busy ?? 0;
        const waiting = metrics?.pool.waiting ?? 0;
        const shedding = flights.some((f) => !f.ok);

        for (let i = 0; i < SENDERS; i++) {
          const z = senderZ(i);
          service(g, [-15, 0, z], COLOR.info, pulse(now, sentAt[i]));
          if (load) crate(g, [-12.6, 0.8, z]);
        }
        g.label("senders", [-15, 2.8, senderZ(0)], "4 services<small>100 logs per crate</small>");

        arch(g, SHED_X, 0, shedding ? COLOR.error : COLOR.white, { flash: shedding ? 1 : 0, width: 12, height: 3 });
        g.label("shed", [SHED_X, 4.4, -6], "Backpressure<small>full? refuse now</small>", shedding ? "bad" : "");

        // Four senders can never have more than four requests waiting.
        for (let i = 0; i < SENDERS; i++) {
          const z = senderZ(i) * 0.65;
          const open = i < queueMax;
          plate(g, [-4, 0, z], 2, 1.9, open ? COLOR.steel : COLOR.deep);
          if (i < waiting) crate(g, [-4, 0.85, z]);
        }
        g.label("queue", [-4, 2.5, -4.6], `Queue<small>${waiting} waiting · limit ${queueMax}</small>`, waiting ? "warn" : "");

        for (let i = 0; i < GATE_SOCKETS; i++) {
          const [x, , z] = socket(i);
          const open = i < limit;
          plate(g, [x, 0, z], 1.9, 1.9, open ? COLOR.steel : COLOR.deep);
          if (i < busy) {
            crate(g, [x, 0.85, z]);
            cage(g, [x, 0.85, z], [1.65, 1.35, 1.65], COLOR.ok, 0.07);
          } else if (!open) {
            for (const turn of [Math.PI / 4, -Math.PI / 4]) {
              g.box([x, 0.22, z], [1.3, 0.08, 0.14], COLOR.error, { radius: 0.03, glow: 0.2, turn });
            }
          }
        }
        g.label("gate", [5, 2.3, -5], `DB gate<small>${busy} busy of ${limit}</small>`);

        let landed = 0;
        for (const flight of flights) {
          const age = now - flight.at;
          if (flight.ok) {
            const t = clamp(age / 650);
            const [x, y, z] = mix([9.6, 1, senderZ(flight.sender) * 0.6], [DB[0] - 1.6, 2, 0], ease(t));
            crate(g, [x, y + Math.sin(t * Math.PI), z]);
            landed = Math.max(landed, t);
          } else {
            const t = age / 1500;
            const z = senderZ(flight.sender);
            const position = [SHED_X - t * 2.5, 1 + Math.sin(t * Math.PI) * 3.2, z + Math.sign(z) * t * 5];
            crate(g, position, { refused: true, turn: t * 5 });
            g.label(`refused${flight.sender}`, [position[0], position[1] + 1.2, position[2]], String(flight.status || "failed"), "big bad");
          }
        }

        database(g, DB, { flash: landed });
        g.label("db", [DB[0], 6.1, 0], `Postgres<small>${config?.dbLatencyMs ? `+${config.dbLatencyMs} ms delay` : "full speed"}</small>`);
      },
    };
  },
};
