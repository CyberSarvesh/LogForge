import { generateLogs, request, errorText } from "../lib/api.js";
import { COLOR, cage, plate, database, gridSlot, pulse } from "../lib/props.js";
import { ease, mix, sub, dot } from "../engine/math.js";
import { escapeHtml, formatMs, stat } from "../lib/util.js";

const COUNT = 500;
const PITCH = 0.9;
const SHEETS = [[-10.5, -5.6], [0, -5.6], [10.5, -5.6], [-5.25, 5.6], [5.25, 5.6]];
const CRATE = [0, 2.75, 0];
const DB = [17, 0, 0];
const ARRIVED = { min: [12, 0, -4], max: [22, 8.5, 4], direction: [0.1, 0.6, 1] };
const MOVE_MS = 900;
const HOVER_PX = 16;

const VIEWS = {
  loose: {
    caption: "500 logs, as your services produce them: scattered, each one separate.",
    bounds: { min: [-16, 0, -10.5], max: [16, 3, 10.5], direction: [0, 1.2, 1] },
  },
  count: {
    caption: "Count them: 10 across, 10 deep is 100. There are five of those squares.",
    bounds: { min: [-15.5, 0, -10.5], max: [15.5, 2, 10.5], direction: [0, 1.6, 1] },
  },
  packed: {
    caption: "The same 500 cubes in one crate. The crate is one HTTP request and one INSERT.",
    bounds: { min: [-6, 0, -6], max: [6, 8.6, 6], direction: [0.75, 0.65, 1] },
  },
  layers: {
    caption: "The crate, opened. Five layers of 100, and nothing was merged or lost.",
    bounds: { min: [-7, 0, -5.5], max: [9, 23.5, 5.5], direction: [0.35, 0.42, 1] },
  },
  sent: {
    caption: "Sending one request…",
    bounds: { min: [-6, 0, -6], max: [20, 7.5, 6], direction: [0.1, 0.65, 1] },
  },
};

function slot(view, i, scatter) {
  const sheet = Math.floor(i / 100);
  if (view === "loose") return scatter[i];
  if (view === "count") return gridSlot(i % 100, [10, 10, 1], PITCH, [SHEETS[sheet][0], 0.5, SHEETS[sheet][1]]);
  if (view === "layers") return gridSlot(i % 100, [10, 10, 1], PITCH, [0, 0.7 + sheet * 5.1, 0]);
  return gridSlot(i, [10, 10, 5], PITCH, CRATE);
}

export default {
  nav: "What is 500?",
  title: "This is 500 logs",
  lead: "One cube is one log, and nothing here is sampled. Count them, pack them, open the crate again, or point at any cube to read the log inside it.",
  panel: `
    <div class="actions">
      <button type="button" data-view="loose">Scattered</button>
      <button type="button" data-view="count">Count them</button>
      <button type="button" data-view="packed">Pack them</button>
      <button type="button" data-view="layers">Open the crate</button>
    </div>
    <p id="caption" aria-live="polite"></p>
    <div class="actions"><button type="button" class="primary" id="send">Send these exact 500</button></div>
    <div class="stats" id="result" hidden>${stat("requests", "request", "1")}${stat("rows", "rows stored")}${stat("time", "round trip")}</div>`,

  mount(ctx) {
    let logs = generateLogs(COUNT);
    // Shuffled cells with jitter: scattered, but never hiding one cube inside another.
    const cells = Array.from({ length: 29 * 19 }, (_, i) => i).sort(() => Math.random() - 0.5);
    const scatter = logs.map((_, i) => [
      ((cells[i] % 29) - 14) * 1.08 + (Math.random() - 0.5) * 0.3,
      0.5,
      (Math.floor(cells[i] / 29) - 9) * 1.08 + (Math.random() - 0.5) * 0.3,
    ]);

    let view = "loose";
    let from = scatter;
    let movedAt = -1e6;
    let storedAt = null;
    let pointer = null;

    const delay = (i) => (view === "count" ? Math.floor(i / 100) * 380 + (i % 100) * 3 : Math.floor(i / 10) * 8);
    const position = (i, now) => mix(from[i], slot(view, i, scatter), ease((now - movedAt - delay(i)) / MOVE_MS));

    function show(next) {
      const now = ctx.now();
      from = storedAt === null ? logs.map((_, i) => position(i, now)) : scatter;
      if (storedAt !== null && next !== "sent") logs = generateLogs(COUNT);
      view = next;
      movedAt = now;
      storedAt = null;
      ctx.$("caption").textContent = VIEWS[next].caption;
      for (const button of ctx.$("caption").parentElement.querySelectorAll("[data-view]")) {
        button.setAttribute("aria-pressed", String(button.dataset.view === next));
      }
    }

    for (const button of ctx.$("caption").parentElement.querySelectorAll("[data-view]")) {
      button.addEventListener("click", () => show(button.dataset.view), { signal: ctx.signal });
    }
    show("loose");

    ctx.action("send", async () => {
      if (storedAt !== null) logs = generateLogs(COUNT);
      show("sent");
      const res = await request("POST", "/logs/batch", logs, ctx.signal);
      if (ctx.signal.aborted) return;
      if (res.status !== 201) {
        show("packed");
        throw new Error(errorText(res));
      }
      if (view !== "sent") return;
      storedAt = Math.max(ctx.now(), movedAt + 1500);
      ctx.$("caption").textContent = "Done: one trip through the pipeline, 500 rows in Postgres.";
      ctx.$("result").hidden = false;
      ctx.$("rows").textContent = res.data.inserted;
      ctx.$("time").textContent = formatMs(res.ms);
    });

    return {
      view: () => (storedAt !== null && ctx.now() > storedAt + 1300 ? ARRIVED : VIEWS[view].bounds),
      pointer(point) {
        pointer = point;
      },

      draw(g, now) {
        const sending = view === "sent";
        const travel = sending && storedAt !== null ? ease((now - storedAt) / 1500) : 0;
        const shift = travel * DB[0];
        const points = logs.map((_, i) => position(i, now));

        let hovered = -1;
        if (pointer && !sending) {
          let nearest = Infinity;
          points.forEach((point, i) => {
            const screen = g.project(point);
            if (!screen || Math.hypot(screen[0] - pointer[0], screen[1] - pointer[1]) > HOVER_PX) return;
            const depth = -dot(sub(point, g.camera.target), g.camera.back);
            if (depth < nearest) {
              nearest = depth;
              hovered = i;
            }
          });
        }

        if (travel < 1) {
          const squeeze = 1 - Math.max(0, travel - 0.7) / 0.3;
          points.forEach(([x, y, z], i) => {
            const size = (i === hovered ? 1.05 : 0.72) * squeeze;
            g.box([x * squeeze + shift, y, z * squeeze], [size, size, size], COLOR[logs[i].level], {
              radius: 0.13 * squeeze,
              // The layers shade each other, so light them from within.
              glow: i === hovered ? 0.8 : view === "layers" ? 0.45 : 0.05,
            });
          });
        }

        const settled = now - movedAt > MOVE_MS + 450;
        if ((view === "packed" || sending) && settled && travel < 0.7) {
          cage(g, [shift, CRATE[1], 0], [9.3, 4.8, 9.3], COLOR.ok);
          g.label("crate", [shift, 8.2, -3], "× 500<small>1 request</small>", "big ok");
        }
        if (view === "count") {
          SHEETS.forEach(([x, z], k) => {
            if (now - movedAt < k * 380 + 1100) return;
            plate(g, [x, -0.05, z], 9.3, 9.3);
            g.label(`sheet${k}`, [x, 1.2, z], String((k + 1) * 100), "huge");
          });
        }
        if (view === "layers" && settled) {
          for (let k = 0; k < 5; k++) {
            plate(g, [0, 0.15 + k * 5.1, 0], 9.3, 9.3);
            g.label(`layer${k}`, [7.2, 0.7 + k * 5.1, 0], `${(k + 1) * 100}`, "big");
          }
        }
        if (sending) {
          database(g, DB, { radius: 2.8, layers: 5, flash: storedAt === null ? 0 : pulse(now, storedAt + 1200, 1500) });
          g.label("db", [DB[0], 7, 0], travel === 1 ? "+500 rows<small>Postgres</small>" : "Postgres", travel === 1 ? "big ok" : "");
        }
        if (hovered >= 0) {
          const log = logs[hovered];
          const [x, y, z] = points[hovered];
          g.label(
            "inspect",
            [x, y + 1, z],
            `#${hovered + 1} ${log.level} · ${escapeHtml(log.service)}<small>${escapeHtml(log.message)}</small>`,
            "card"
          );
        }
      },
    };
  },
};
