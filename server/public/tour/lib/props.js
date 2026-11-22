// The reusable objects the chapters are built from.
import { mix, clamp } from "../engine/math.js";

export const COLOR = {
  info: [0.36, 0.68, 0.98],
  warn: [1, 0.76, 0.24],
  error: [1, 0.31, 0.3],
  ok: [0.36, 0.89, 0.68],
  white: [0.9, 0.92, 0.9],
  steel: [0.27, 0.31, 0.33],
  dark: [0.14, 0.165, 0.18],
  deep: [0.095, 0.11, 0.12],
  floor: [0.085, 0.1, 0.11],
};

export function floor(g) {
  g.box([0, -0.55, 0], [400, 1, 400], COLOR.floor, { radius: 0.01, glow: -1 });
}

export function plate(g, [x, y, z], width, depth, color = COLOR.dark) {
  g.box([x, y, z], [width, 0.3, depth], color, { radius: 0.15 });
}

export function belt(g, from, to, z, width, time) {
  const length = to - from;
  g.box([(from + to) / 2, 0.15, z], [length, 0.4, width], COLOR.deep, { radius: 0.15 });
  for (const side of [-1, 1]) {
    g.box([(from + to) / 2, 0.42, z + (side * width) / 2], [length, 0.18, 0.16], COLOR.steel, { radius: 0.06 });
  }
  for (let d = (time * 0.0012) % 1.5; d < length - 0.2; d += 1.5) {
    g.box([from + d + 0.1, 0.36, z], [0.12, 0.04, width * 0.65], COLOR.steel, { radius: 0.01 });
  }
}

export function arch(g, x, z, color, { flash = 0, height = 3.4, width = 3.4 } = {}) {
  for (const side of [-1, 1]) {
    const post = z + (side * width) / 2;
    g.box([x, height / 2, post], [0.7, height, 0.5], COLOR.steel, { radius: 0.12 });
    g.box([x + 0.37, height / 2, post], [0.06, height * 0.7, 0.14], color, { radius: 0.02, glow: 0.35 + flash * 0.65 });
  }
  g.box([x, height + 0.2, z], [1, 0.55, width + 0.9], COLOR.dark, { radius: 0.18 });
  g.box([x, height + 0.5, z], [0.4, 0.1, width + 0.3], color, { radius: 0.04, glow: 0.45 + flash * 0.55 });
}

export function database(g, [x, y, z], { radius = 2.2, flash = 0, layers = 4 } = {}) {
  const d = radius * 2;
  for (let i = 0; i < layers; i++) {
    const base = y + i * 1.15;
    g.cylinder([x, base + 0.5, z], [d, 0.9, d], mix(COLOR.steel, COLOR.ok, flash * 0.35));
    g.cylinder([x, base + 1.02, z], [d * 0.94, 0.22, d * 0.94], COLOR.ok, { glow: 0.25 + flash * 0.75 });
  }
  g.cylinder([x, y + layers * 1.15 + 0.1, z], [d, 0.3, d], COLOR.steel);
}

export function service(g, [x, y, z], color, flash = 0) {
  g.box([x, y + 0.9, z], [2, 1.8, 2], COLOR.dark, { radius: 0.3 });
  g.box([x, y + 1.86, z], [1.2, 0.16, 1.2], color, { radius: 0.06, glow: 0.3 + flash * 0.7 });
  for (let i = 0; i < 3; i++) {
    g.box([x + 1.02, y + 0.5 + i * 0.4, z], [0.06, 0.14, 1.2], COLOR.steel, { radius: 0.02 });
  }
}

/** Twelve bars, so the logs inside stay visible and countable. */
export function cage(g, [x, y, z], [w, h, d], color, thickness = 0.12) {
  const style = { radius: thickness / 3, glow: 0.5 };
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      g.box([x, y + (a * h) / 2, z + (b * d) / 2], [w + thickness, thickness, thickness], color, style);
      g.box([x + (a * w) / 2, y, z + (b * d) / 2], [thickness, h + thickness, thickness], color, style);
      g.box([x + (a * w) / 2, y + (b * h) / 2, z], [thickness, thickness, d + thickness], color, style);
    }
  }
}

export function gridSlot(index, [cols, rows, layers], pitch, [x, y, z]) {
  const layer = Math.floor(index / (cols * rows));
  return [
    x + ((index % cols) - (cols - 1) / 2) * pitch,
    y + (layer - (layers - 1) / 2) * pitch,
    z + ((Math.floor(index / cols) % rows) - (rows - 1) / 2) * pitch,
  ];
}

/** 1 right after `at`, fading to 0 over `duration`. */
export const pulse = (now, at, duration = 500) => (now < at ? 0 : clamp(1 - (now - at) / duration));
