// Unit meshes. Each vertex is `position.xyz, normal.xyz`.

/**
 * A box whose corners are rounded in the vertex shader, so one mesh fits any size and radius.
 * The steps either side of zero (±E) are pulled apart to form the flat faces; the rest form the bevel.
 */
export function roundedBox(steps) {
  const E = 1e-4;
  const line = [];
  for (let i = steps; i >= 1; i--) line.push(-i / steps);
  line.push(-E, E);
  for (let i = 1; i <= steps; i++) line.push(i / steps);

  const vertices = [];
  const indices = [];
  const n = line.length;
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const base = vertices.length / 6;
      for (const a of line) {
        for (const b of line) {
          const p = [];
          p[axis] = side;
          p[(axis + 1) % 3] = a;
          p[(axis + 2) % 3] = b;
          const length = Math.hypot(...p);
          vertices.push(...p, ...p.map((v) => v / length));
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - 1; j++) {
          const k = base + i * n + j;
          indices.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
        }
      }
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

export function cylinder(segments) {
  const profile = [[0, 1], [0.94, 1], [1, 0.82], [1, -0.82], [0.94, -1], [0, -1]];
  const vertices = [];
  const indices = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    const length = Math.hypot(y0 - y1, r1 - r0);
    const nr = (y0 - y1) / length;
    const ny = (r1 - r0) / length;
    const base = vertices.length / 6;
    for (let i = 0; i <= segments; i++) {
      const c = Math.cos((i / segments) * Math.PI * 2);
      const s = Math.sin((i / segments) * Math.PI * 2);
      vertices.push(c * r0, y0, s * r0, c * nr, ny, s * nr, c * r1, y1, s * r1, c * nr, ny, s * nr);
      if (i < segments) {
        const v = base + i * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}
