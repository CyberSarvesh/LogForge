import { request, errorText } from "../lib/api.js";
import { COLOR, plate, belt, arch, database, service, pulse } from "../lib/props.js";
import { clamp, lerp } from "../engine/math.js";
import { formatMs } from "../lib/util.js";

const START = -12;
const DB = 13;
const SPEED = 0.0075; // world units per ms
const RETURN_MS = 1600;
const STOPS = [
  { x: -7.5, name: "Rate limiter", does: "too many? 429" },
  { x: -2.8, name: "Backpressure", does: "overloaded? 503" },
  { x: 1.9, name: "Validation", does: "malformed? 400" },
  { x: 6.6, name: "DB gate", does: "wait for a free slot" },
];
const STOPPED_BY = { 429: 0, 503: 1, 400: 2 };

export default {
  nav: "One log",
  title: "Follow one log",
  lead: "A log is a small piece of JSON that a service sends when something happens. Here it is one cube. It has to get past four checkpoints before Postgres stores it.",
  panel: `
    <div class="actions">
      <button type="button" class="primary" id="valid">Send a log</button>
      <button type="button" id="invalid">Send a broken one</button>
    </div>
    <p id="caption" aria-live="polite">Each button makes a real request. The cube stops wherever the server stopped it.</p>
    <pre id="response" hidden></pre>`,

  mount(ctx) {
    let trip = null;

    async function send(level) {
      const log = { service: "checkout", level, message: "Order 4821 confirmed" };
      const current = { level, at: ctx.now(), result: null };
      trip = current;
      ctx.$("caption").textContent = "On its way…";
      const res = await request("POST", "/logs", log, ctx.signal);
      if (ctx.signal.aborted || trip !== current) return;

      current.result = res;
      current.stop = res.status === 201 ? null : STOPPED_BY[res.status] ?? 3;
      const { data, status } = res;
      ctx.$("caption").textContent =
        status === 201
          ? `Stored as row ${data.id} in ${formatMs(res.ms)}. The cube replays that trip slowly enough to follow.`
          : `Stopped${status === 400 ? " at validation. The database was never touched" : ""}. ${errorText(res)}`;
      ctx.$("response").hidden = false;
      ctx.$("response").textContent = `POST /api/logs → ${status || "no response"}\n${JSON.stringify(data, null, 2)}`;
    }
    ctx.action("valid", () => send("info"));
    ctx.action("invalid", () => send("critical"));

    return {
      view: () => ({ min: [-14.5, 0, -2.4], max: [15, 6.2, 3.2], direction: [-0.38, 0.62, 1] }),

      draw(g, now, idle) {
        let x = START;
        let arrived = null;
        if (trip) {
          const wanted = START + (now - trip.at) * SPEED;
          const end = !trip.result ? STOPS[0].x - 1.5 : trip.stop === null ? DB - 2.2 : STOPS[trip.stop].x - 1.1;
          x = Math.min(wanted, end);
          if (trip.result && wanted >= end) arrived = trip.at + (end - START) / SPEED;
        }
        const stored = arrived !== null && trip.stop === null;
        const refused = arrived !== null && trip.stop !== null;

        service(g, [START - 1.8, 0, 0], COLOR.info, pulse(now, trip?.at ?? -1e9));
        g.label("service", [START - 1.8, 3, 0], "checkout<small>your service</small>");
        belt(g, START - 0.6, DB - 2, 0, 2.5, idle);

        STOPS.forEach((stop, i) => {
          const hit = refused && trip.stop === i;
          const passed = trip && x > stop.x;
          arch(g, stop.x, 0, hit ? COLOR.error : passed ? COLOR.ok : COLOR.white, {
            flash: hit ? 1 : passed ? Math.max(0, 1 - (x - stop.x) / 3) : 0,
          });
          const raised = i % 2 ? 5.7 : 4.2;
          g.label(`stop${i}`, [stop.x, raised, -1.7], `${stop.name}<small>${stop.does}</small>`, hit ? "bad" : "");
        });

        plate(g, [DB, 0, 0], 5.2, 5.2);
        database(g, [DB, 0.15, 0], { flash: stored ? pulse(now, arrived, 1800) : 0 });
        g.label("db", [DB, 6.2, 0], "Postgres<small>stored for good</small>", stored ? "ok" : "");

        if (stored) {
          const back = clamp((now - arrived) / RETURN_MS);
          const point = [lerp(DB - 2, START - 1.8, back), 0.5, 2.9];
          g.box(point, [0.5, 0.5, 0.5], COLOR.ok, { radius: 0.2, glow: 0.8 });
          g.label("reply", [point[0], 1.1, 2.9], "201 Created", "ok");
          return;
        }

        const fall = refused ? clamp((now - arrived) / 700) : 0;
        const bob = trip ? 0 : Math.sin(idle / 450) * 0.1;
        const position = [x - fall * 0.6, 1.3 + bob + Math.sin(fall * Math.PI) * 1.2 - fall * 0.6, fall * 3];
        const broken = refused || trip?.level === "critical";
        g.box(position, [1.4, 1.4, 1.4], broken ? COLOR.error : COLOR.info, {
          radius: 0.22,
          glow: 0.18,
          turn: fall * 2.2 + (trip ? 0 : idle / 2500),
        });

        if (refused) g.label("log", [position[0], 2.2, position[2]], String(trip.result.status || "no response"), "big bad");
        else if (!trip) g.label("log", [x + 3.2, -1.2, 4.2], 'level: "info"<small>Order 4821 confirmed</small>', "card");
      },
    };
  },
};
