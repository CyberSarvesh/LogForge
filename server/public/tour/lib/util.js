const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const formatCount = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
};

export const formatMs = (ms) => {
  if (ms === null || ms === undefined) return "–";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
};

export const formatRatio = (x) => `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`;

export const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const stat = (id, label, value = "–") =>
  `<div class="stat"><b id="${id}">${value}</b><span>${label}</span></div>`;

/**
 * Two measured durations can differ by 100×, so a linear replay would hide the short one.
 * Both lanes share this clock: slow until the short one finishes, then faster for the rest.
 */
export function replayClock(shortMs, longMs, elapsed, shortPlay = 2200, longPlay = 6000) {
  const first = Math.min(shortMs, longMs);
  if (elapsed <= shortPlay) return { ms: (first * elapsed) / shortPlay, slowdown: shortPlay / first, done: false };

  const rest = Math.max(longMs - first, 0.001);
  const k = Math.min(1, (elapsed - shortPlay) / longPlay);
  return { ms: first + rest * k, slowdown: longPlay / rest, done: k === 1 };
}

export const describeSpeed = (slowdown) =>
  slowdown >= 1 ? `slowed ${formatRatio(slowdown)}` : `sped up ${formatRatio(1 / slowdown)}`;
