import { generateLogs, request, errorText, SENDERS } from "../lib/api.js";
import { COLOR, plate, gridSlot } from "../lib/props.js";
import { clamp } from "../engine/math.js";
import { escapeHtml, formatCount, formatMs, formatRatio, replayClock, describeSpeed, stat } from "../lib/util.js";

const BLOCKS = 400;
const PITCH = 0.78;
const SCAN_Z = -5.5;
const INDEX_Z = 5.5;
const TOO_SMALL = 50000;
const SEED_BATCHES = 100;

export default {
  nav: "Search",
  title: "Find it without reading it all",
  lead: "Each field is your whole logs table, cut into 400 blocks. A full scan reads every block. A trigram index looks up three-letter pieces of your search and jumps to the rows that can match.",
  panel: `
    <label class="field">Search every message for<input id="term" value="Payment 4242" maxlength="100" autocomplete="off"></label>
    <div class="actions">
      <button type="button" class="primary" id="run">Race the two plans</button>
      <button type="button" id="seed" hidden>Add 100,000 sample logs</button>
    </div>
    <p id="caption" aria-live="polite">A specific phrase shows the index at its best. Try a common word to see when it stops helping.</p>
    <div class="stats">${stat("scanTime", "full scan")}${stat("indexTime", "planner's choice")}${stat("ratio", "faster")}</div>
    <p class="note" id="plans"></p>`,

  mount(ctx) {
    let result = null;
    let startedAt = 0;

    async function checkSize() {
      const res = await request("GET", "/logs/stats?window=10&bucket=5", undefined, ctx.signal);
      if (ctx.signal.aborted || res.status !== 200) return;
      const small = res.data.totalRows < TOO_SMALL;
      ctx.$("seed").hidden = !small;
      if (small) ctx.$("caption").textContent = `The table has ${formatCount(res.data.totalRows)} rows, too few for an index to matter. Add sample logs first.`;
    }
    checkSize();

    ctx.action("seed", async () => {
      let next = 0;
      let failure = null;
      const sendLoop = async () => {
        while (next < SEED_BATCHES && !failure && !ctx.signal.aborted) {
          next++;
          ctx.$("caption").textContent = `Adding sample logs: ${formatCount(next * 1000)} of 100k`;
          const res = await request("POST", "/logs/batch", generateLogs(1000), ctx.signal);
          if (res.status !== 201) failure = res;
        }
      };
      await Promise.all(Array.from({ length: SENDERS }, sendLoop));
      if (ctx.signal.aborted) return;
      if (failure) throw new Error(errorText(failure));
      ctx.$("seed").hidden = true;
      ctx.$("caption").textContent = "Added 100k logs. Now race the two plans.";
    });

    ctx.action("run", async () => {
      result = null;
      for (const id of ["scanTime", "indexTime", "ratio"]) ctx.$(id).textContent = "–";
      ctx.$("plans").textContent = "";
      ctx.$("caption").textContent = "Postgres is running both plans…";
      const query = new URLSearchParams({ search: ctx.$("term").value, blocks: BLOCKS });
      const res = await request("GET", `/demo/explain?${query}`, undefined, ctx.signal);
      if (ctx.signal.aborted) return;
      if (res.status !== 200) {
        ctx.$("caption").textContent = "The race did not run.";
        throw new Error(errorText(res));
      }

      const { term, matches, tableRows, scan, indexed, blocks } = res.data;
      const usesIndex = indexed.nodes.some((node) => node.includes("Index"));
      result = { term, scan, indexed, usesIndex, hits: new Map(blocks), tableRows };
      startedAt = ctx.now();

      ctx.$("scanTime").textContent = formatMs(scan.ms);
      ctx.$("indexTime").textContent = formatMs(indexed.ms);
      ctx.$("ratio").textContent = usesIndex ? formatRatio(scan.ms / indexed.ms) : "–";
      ctx.$("caption").textContent = usesIndex
        ? `${formatCount(matches)} matches in about ${formatCount(tableRows)} rows.`
        : `${formatCount(matches)} matches. Postgres chose a full scan here: the phrase is too common, or has too few letters in a row, for the index to pay off.`;
      ctx.$("plans").textContent = `Plan used: ${indexed.nodes.at(-1)}. The times come from EXPLAIN ANALYZE, and lit blocks are where matches really are, ordered by id. The sweep illustrates the scan.`;
      if (!blocks) ctx.notice("Restart the LogForge server to see where the matches are.");
    });

    return {
      view: () => ({ min: [-20, 0, -11], max: [20, 4, 10.5], direction: [0, 0.95, 1] }),

      draw(g, now, idle) {
        let time = -1;
        let clock = null;
        if (result) {
          clock = replayClock(result.indexed.ms, result.scan.ms, now - startedAt, 1800, 4500);
          time = clock.ms;
        }
        const scanned = result ? clamp(time / result.scan.ms) * BLOCKS : 0;
        const looked = result ? clamp(time / result.indexed.ms) : 0;
        const indexLaneScans = result && !result.usesIndex;

        for (const z of [SCAN_Z, INDEX_Z]) {
          const isScan = z === SCAN_Z || indexLaneScans;
          const reached = z === SCAN_Z ? scanned : looked * BLOCKS;
          plate(g, [0, -0.05, z], 40, 7);

          for (let i = 0; i < BLOCKS; i++) {
            const [x, , blockZ] = gridSlot(i, [50, 8, 1], PITCH, [0, 0, z]);
            const matches = result?.hits.get(i) ?? 0;
            const read = isScan ? i < reached : matches > 0 && looked === 1;
            const reading = isScan && reached > 0 && reached < BLOCKS && Math.abs(i - reached) < 8;

            let height = 0.4 + (idle ? Math.sin(i * 0.37 + idle / 900) * 0.04 : 0);
            let color = COLOR.steel;
            let glow = 0;
            if (read) color = [0.36, 0.43, 0.47];
            if (reading) {
              color = COLOR.white;
              glow = 0.7;
              height = 0.75;
            }
            if (read && matches) {
              color = isScan ? COLOR.warn : COLOR.ok;
              glow = 0.6;
              height = 1 + Math.min(Math.log2(matches) * 0.3, 2.4);
            }
            g.box([x, 0.1 + height / 2, blockZ], [0.62, height, 0.62], color, { radius: 0.1, glow });
          }
        }

        g.label("scan", [-12, 2, SCAN_Z - 3.6], `Full scan<small>${result ? formatMs(Math.min(time, result.scan.ms)) : "reads every block"}</small>`, "warn");
        const indexTitle = indexLaneScans ? "Planner also chose a scan" : "Trigram index";
        g.label("index", [-12, 2, INDEX_Z - 3.6], `${indexTitle}<small>${result ? formatMs(Math.min(time, result.indexed.ms)) : "jumps to the matches"}</small>`, "ok");

        if (!result) return;
        if (!clock.done) g.label("clock", [11, 2, SCAN_Z - 3.6], describeSpeed(clock.slowdown));
        if (result.usesIndex) {
          const word = result.term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
          const grams = [...new Set(word.split(" ").flatMap((w) => Array.from({ length: Math.max(0, w.length - 2) }, (_, i) => w.slice(i, i + 3))))];
          g.label("grams", [8, 2, INDEX_Z - 3.6], `${grams.slice(0, 6).map(escapeHtml).join(" · ")}<small>pieces looked up</small>`, "ok");
        }
      },
    };
  },
};
