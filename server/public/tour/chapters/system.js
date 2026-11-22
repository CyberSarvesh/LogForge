import { COLOR, plate, belt, arch, database, service, cage, gridSlot } from "../lib/props.js";

const DECISIONS = [
  { name: "Batched ingest", at: [-9, 0], why: "One INSERT … unnest() stores up to 1,000 logs in one round trip.", cost: "Clients have to buffer, and a failed request fails the whole batch.", file: "modules/logs/log.repository.js" },
  { name: "Rate limiting", at: [-5.5, 0], why: "A per-IP budget stops one noisy client from taking the whole server.", cost: "Counters live in memory, so several processes would need a shared store.", file: "middlewares/rateLimit.middleware.js" },
  { name: "Load shedding", at: [-1.5, 0], why: "A full queue answers 503 with Retry-After at once, so waiting stays bounded.", cost: "Refused logs are lost unless the sender retries.", file: "middlewares/backpressure.middleware.js" },
  { name: "Validation", at: [2.5, 0], why: "Bad input gets a clear 400 before it can take a database connection.", cost: "One bad log rejects its batch.", file: "modules/logs/log.schema.js" },
  { name: "Concurrency gate", at: [6.5, 0], why: "A bulkhead whose limit and queue can be observed and resized while running.", cost: "It is per process. Two processes means twice the connections.", file: "db/client.js" },
  { name: "Trigram index", at: [12, 0], why: "Substring search looks up candidates and avoids reading the whole table.", cost: "Every insert also updates the index, so writes slow as it grows.", file: "db/schema.sql" },
  { name: "Cursor pagination", at: [12, -7], why: "Paging by id costs the same on page 1 and page 10,000.", cost: "You cannot jump straight to page N.", file: "modules/logs/log.repository.js" },
  { name: "Live tail", at: [1, 7], why: "SSE bursts are merged into four flushes a second, so floods can't swamp browsers.", cost: "It shows a sample under load, and scaling out needs pub/sub.", file: "modules/logs/log.stream.js" },
  { name: "Shared stats query", at: [4, -7], why: "Dashboards share one aggregate query per second, so reads don't pile onto writes.", cost: "The numbers can be a second old.", file: "modules/logs/logs.service.js" },
  { name: "Observability", at: [-5, -7], why: "Event-loop lag, gate use and outcome counts are measured inside the process.", cost: "Nothing is kept. A real deployment would export these.", file: "middlewares/metrics.middleware.js" },
];
const OVERVIEW = { min: [-15, 0, -8], max: [14.5, 4.5, 8], direction: [-0.3, 0.95, 1] };
const LEVELS = ["info", "info", "warn", "info", "error", "info", "info"];

export default {
  nav: "The design",
  title: "Every decision has a price",
  lead: "This is the whole system. Pick a decision to fly to it and see what it buys, what it costs, and where the code is.",
  panel: `
    <div class="decisions">
      ${DECISIONS.map((d, i) => `<button type="button" data-decision="${i}" aria-pressed="false">${d.name}</button>`).join("")}
    </div>
    <div id="detail" aria-live="polite">
      <p id="why">Not built yet: authentication, retention and partitioning, automated tests, and running on more than one process.</p>
      <p class="note" id="cost"></p>
      <code id="file"></code>
    </div>
    <div class="actions" style="margin-top:12px"><button type="button" id="overview" hidden>See the whole system</button></div>`,

  mount(ctx) {
    let selected = null;
    const buttons = [...ctx.$("detail").parentElement.querySelectorAll("[data-decision]")];

    function select(index) {
      selected = index;
      const decision = DECISIONS[index];
      ctx.$("why").textContent = decision?.why ?? "";
      ctx.$("cost").textContent = decision ? `The price: ${decision.cost}` : "";
      ctx.$("file").textContent = decision ? `server/${decision.file}` : "";
      ctx.$("overview").hidden = !decision;
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    }
    buttons.forEach((button, i) => button.addEventListener("click", () => select(i), { signal: ctx.signal }));
    ctx.$("overview").addEventListener("click", () => select(null), { signal: ctx.signal });

    return {
      view() {
        if (selected === null) return OVERVIEW;
        const [x, z] = DECISIONS[selected].at;
        return { min: [x - 4.5, 0, z - 3], max: [x + 4.5, 5.5, z + 3], direction: [-0.6, 0.7, 1] };
      },

      draw(g, now, idle) {
        const tint = (i, color = COLOR.white) => (selected === i ? COLOR.ok : color);
        const flash = (i) => (selected === i ? 1 : 0);

        for (const z of [-2.6, 0, 2.6]) service(g, [-14, 0, z], COLOR.info, 0.4);
        g.label("services", [-14, 3, -2.6], "Your services");
        belt(g, -12.5, 9.8, 0, 2.6, idle);
        for (const i of [1, 2, 3, 4]) arch(g, DECISIONS[i].at[0], 0, tint(i), { flash: flash(i) });

        for (let n = 0; n < 3; n++) {
          const x = -11.5 + ((idle * 0.003 + n * 7) % 21);
          for (let i = 0; i < 100; i++) {
            g.box(gridSlot(i, [5, 5, 4], 0.31, [x, 1.1, 0]), [0.25, 0.25, 0.25], COLOR[LEVELS[(i + n) % LEVELS.length]], { radius: 0.05, glow: 0.1 });
          }
          cage(g, [x, 1.1, 0], [1.65, 1.35, 1.65], tint(0, COLOR.steel), 0.07);
        }

        plate(g, [12, 0, 0], 5.4, 5.4);
        database(g, [12, 0.15, 0], { flash: flash(5) });

        plate(g, [12, 0, -7], 5, 3.6);
        for (let k = 0; k < 5; k++) {
          const current = k === Math.floor(idle / 700) % 5;
          g.box([10.2 + k * 0.9, 1, -7], [0.18, 1.6, 2.4], current ? tint(6) : COLOR.steel, { glow: current ? 0.5 : 0 });
        }

        plate(g, [4, 0, -7], 5, 3.6);
        g.cylinder([4, 0.8, -7], [2.4, 1.2, 2.4], COLOR.steel);
        g.cylinder([4, 1.5, -7], [2, 0.2, 2], tint(8), { glow: 0.4 + flash(8) * 0.6 });

        plate(g, [-5, 0, -7], 5, 3.6);
        for (let k = 0; k < 6; k++) {
          const height = 1.2 + Math.sin(idle / 500 + k) * 0.6;
          g.box([-6.8 + k * 0.72, 0.2 + height / 2, -7], [0.5, height, 0.5], tint(9, COLOR.info), { glow: 0.2 });
        }

        plate(g, [1, 0, 7], 6.4, 3.6);
        g.box([1, 1.5, 7], [5, 2.3, 0.4], COLOR.deep, { radius: 0.15 });
        for (let k = 0; k < 5; k++) {
          const level = LEVELS[(k + Math.floor(idle / 600)) % LEVELS.length];
          g.box([1, 0.7 + k * 0.4, 7.23], [4.3 - (k % 3) * 0.6, 0.16, 0.06], tint(7, COLOR[level]), { glow: 0.6, radius: 0.03 });
        }

        DECISIONS.forEach(({ name, at: [x, z] }, i) => {
          if (selected !== null && selected !== i) return;
          const height = z ? 3 : i === 5 ? 6 : i % 2 ? 4.2 : 5.6;
          g.label(`decision${i}`, [x, height, z], name, selected === i ? "big ok" : "");
        });
      },
    };
  },
};
