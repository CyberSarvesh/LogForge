import { createRenderer } from "./engine/renderer.js";
import { createCamera } from "./engine/camera.js";
import { floor } from "./lib/props.js";
import { createLabels } from "./lib/labels.js";
import { startTail } from "./lib/tail.js";
import journey from "./chapters/journey.js";
import batch from "./chapters/batch.js";
import race from "./chapters/race.js";
import search from "./chapters/search.js";
import chaos from "./chapters/chaos.js";
import limits from "./chapters/limits.js";
import system from "./chapters/system.js";

const CHAPTERS = [journey, batch, race, search, chaos, limits, system];
const NO_3D = "The 3D view needs WebGL2, which this browser has turned off. All the controls and measurements still work.";
const NARROW = 760;

const $ = (id) => document.getElementById(id);
const canvas = $("world");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const camera = createCamera();
const labels = createLabels($("labels"), camera.project);

let renderer = null;
let pixelRatio = Math.min(devicePixelRatio || 1, 1.75);
let layout;
let active = null;

function initRenderer() {
  try {
    renderer = createRenderer(canvas);
  } catch (err) {
    console.error(err);
    renderer = null;
  }
}

function measure() {
  const width = innerWidth;
  const height = innerHeight;
  const top = document.querySelector("header").offsetHeight;
  const bottom = document.querySelector("footer").offsetHeight;
  const story = $("story").getBoundingClientRect();
  const narrow = width <= NARROW;
  const stage = narrow
    ? { x: 6, y: top + 8, width: width - 12, height: story.top - top - 16 }
    : { x: story.right + 12, y: top + 16, width: width - story.right - 36, height: height - top - bottom - 32 };
  stage.width = Math.max(stage.width, 80);
  stage.height = Math.max(stage.height, 80);
  layout = { width, height, stage };
}

// Scene time. Slow motion stretches it without touching what is measured.
let sceneTime = 0;
let lastTick = performance.now();
function tick() {
  const now = performance.now();
  sceneTime += (now - lastTick) * ($("slow").checked ? 0.25 : 1);
  lastTick = now;
  return sceneTime;
}

/** What a chapter may use. Everything in it dies with the chapter. */
function createContext(root, controller) {
  const { signal } = controller;
  const find = (id) => root.querySelector(`#${id}`);
  const notice = (text) => {
    if (!signal.aborted) $("notice").textContent = text || (renderer ? "" : NO_3D);
  };
  return {
    signal,
    notice,
    $: find,
    now: tick,
    /** Binds an async handler that cannot be started twice. */
    action(id, handler) {
      const button = find(id);
      button.addEventListener("click", async () => {
        button.disabled = true;
        notice("");
        try {
          await handler();
        } catch (err) {
          if (!signal.aborted) notice(err.message);
        } finally {
          button.disabled = false;
        }
      }, { signal });
    },
  };
}

function go(requested, { focus = false } = {}) {
  const index = Math.max(0, Math.min(CHAPTERS.length - 1, requested));
  if (active?.index === index) return;
  active?.controller.abort();
  active?.scene.leave?.();

  const chapter = CHAPTERS[index];
  const root = document.createElement("div");
  root.innerHTML = chapter.panel;
  $("panel").replaceChildren(root);
  $("step").textContent = `${index + 1} of ${CHAPTERS.length}`;
  $("title").textContent = chapter.title;
  $("lead").textContent = chapter.lead;
  $("notice").textContent = renderer ? "" : NO_3D;
  $("story").scrollTop = 0;
  $("prev").disabled = index === 0;
  $("next").disabled = index === CHAPTERS.length - 1;
  [...$("chapters").children].forEach((button, i) => {
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });

  const controller = new AbortController();
  active = { index, controller, scene: chapter.mount(createContext(root, controller)) };
  history.replaceState(null, "", `#act${index + 1}`);
  if (focus) $("title").focus({ preventScroll: true });
}

const graphics = {
  box: (...args) => renderer?.box(...args),
  cylinder: (...args) => renderer?.cylinder(...args),
  label: (...args) => renderer && labels.set(...args),
  project: camera.project,
  get camera() {
    return camera.state;
  },
};

let previousFrame = performance.now();
let slowFrames = 0;
function frame(time) {
  requestAnimationFrame(frame);
  const elapsed = Math.max(0, time - previousFrame);
  previousFrame = time;
  const now = tick();

  // Weak GPU: trade resolution for frame rate. Gaps over 100 ms are a throttled tab, not a slow GPU.
  slowFrames = elapsed > 40 && elapsed < 100 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  if (slowFrames > 45 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    slowFrames = 0;
  }

  const { scene } = active;
  const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 280);
  const view = camera.update(scene.view(), layout, layout.stage, blend);

  renderer?.begin();
  labels.begin();
  if (renderer) floor(graphics);
  scene.draw(graphics, now, reducedMotion.matches ? 0 : now);
  labels.end(layout.stage);
  renderer?.render(view, pixelRatio);
}

$("chapters").innerHTML = CHAPTERS.map(
  (chapter, i) => `<button type="button" title="${chapter.nav}" data-index="${i}"><b>${i + 1}</b><span>${chapter.nav}</span></button>`
).join("");
$("chapters").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) go(Number(button.dataset.index), { focus: true });
});
$("prev").addEventListener("click", () => go(active.index - 1, { focus: true }));
$("next").addEventListener("click", () => go(active.index + 1, { focus: true }));

addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input:not([type="checkbox"])')) return;
  if (event.key === "ArrowRight") go(active.index + 1, { focus: true });
  if (event.key === "ArrowLeft") go(active.index - 1, { focus: true });
});

const chapterFromHash = () => (Number.parseInt(location.hash.replace("#act", ""), 10) || 1) - 1;
addEventListener("hashchange", () => go(chapterFromHash()));
addEventListener("resize", measure);
addEventListener("pagehide", () => active.scene.unload?.());

canvas.addEventListener("pointermove", (event) => active.scene.pointer?.([event.clientX, event.clientY]));
canvas.addEventListener("pointerdown", (event) => active.scene.pointer?.([event.clientX, event.clientY]));
canvas.addEventListener("pointerleave", () => active.scene.pointer?.(null));
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  renderer = null;
});
canvas.addEventListener("webglcontextrestored", initRenderer);

initRenderer();
measure();
startTail($("tailState"), $("tailLine"));
go(chapterFromHash());
requestAnimationFrame(frame);
