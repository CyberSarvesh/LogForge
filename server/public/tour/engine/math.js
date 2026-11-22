// The little linear algebra the renderer needs. Matrices are column-major, as WebGL expects.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const ease = (t) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

export function lookAt(eye, target) {
  const z = normalize(sub(eye, target));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

/** Perspective projection whose centre is shifted to `center` (in NDC). */
export function perspective(tanY, aspect, near, far, center) {
  return new Float32Array([
    1 / (tanY * aspect), 0, 0, 0,
    0, 1 / tanY, 0, 0,
    -center[0], -center[1], (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

export function ortho(halfSize, near, far) {
  return new Float32Array([
    1 / halfSize, 0, 0, 0,
    0, 1 / halfSize, 0, 0,
    0, 0, 2 / (near - far), 0,
    0, 0, (far + near) / (near - far), 1,
  ]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
  }
  return out;
}
