import { formatCount } from "./util.js";

/** The real SSE live tail, shown as one line under the stage. */
export function startTail(state, line) {
  let received = 0;
  let live = false;
  const stream = new EventSource("/api/logs/stream");

  stream.onopen = () => {
    live = true;
  };
  stream.onerror = () => {
    live = false;
  };
  stream.addEventListener("logs", (event) => {
    const { rows, count } = JSON.parse(event.data);
    received += count;
    const last = rows.at(-1);
    if (last) line.textContent = `${last.level.toUpperCase()}  ${last.service}  ${last.message}`;
  });

  setInterval(() => {
    state.textContent = live ? `live · ${formatCount(received)} logs/s` : "live tail reconnecting";
    state.classList.toggle("live", live);
    received = 0;
  }, 1000);
}
