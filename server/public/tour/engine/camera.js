import { add, sub, scale, dot, cross, normalize, lerp, mix, lookAt, perspective, multiply } from "./math.js";

const TAN_Y = Math.tan((15 * Math.PI) / 180);

/**
 * Frames a bounding box inside whatever part of the screen the interface leaves free,
 * so every chapter fits on a phone and on a projector without hand-tuned positions.
 */
export function createCamera() {
  let pose = null;
  let projection = null;

  return {
    get state() {
      return projection;
    },

    update({ min, max, direction }, viewport, rect, blend) {
      const { width, height } = viewport;
      const center = scale(add(min, max), 0.5);
      const back = normalize(direction);
      const right = normalize(cross([0, 1, 0], back));
      const up = cross(back, right);

      const tanY = (TAN_Y * rect.height) / height;
      const tanX = (TAN_Y * rect.width) / height;
      // Furthest reach of the box towards each edge of the free area. Perspective makes the near
      // side larger, so balancing opposite edges centres it better than aiming at the box's middle.
      let [east, west, north, south] = [-Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 8; i++) {
        const corner = sub([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]], center);
        const z = dot(corner, back);
        const x = dot(corner, right) / tanX;
        const y = dot(corner, up) / tanY;
        east = Math.max(east, z + x);
        west = Math.max(west, z - x);
        north = Math.max(north, z + y);
        south = Math.max(south, z - y);
      }
      const distance = Math.max(1, (east + west) / 2, (north + south) / 2);
      const offset = add(scale(right, ((east - west) / 2) * tanX), scale(up, ((north - south) / 2) * tanY));
      const aim = add(center, offset);
      const extent = Math.hypot(...sub(max, min)) * 0.75;
      const shift = [((rect.x + rect.width / 2) / width) * 2 - 1, 1 - ((rect.y + rect.height / 2) / height) * 2];

      pose = pose
        ? {
            target: mix(pose.target, aim, blend),
            back: normalize(mix(pose.back, back, blend)),
            distance: lerp(pose.distance, distance, blend),
            extent: lerp(pose.extent, extent, blend),
            shift: [lerp(pose.shift[0], shift[0], blend), lerp(pose.shift[1], shift[1], blend)],
          }
        : { target: aim, back, distance, extent, shift };

      const eye = add(pose.target, scale(pose.back, pose.distance));
      const near = Math.max(0.5, pose.distance * 0.08);
      const far = pose.distance + 600;
      const matrix = multiply(perspective(TAN_Y, width / height, near, far, pose.shift), lookAt(eye, pose.target));
      projection = { ...pose, eye, matrix, width, height };
      return projection;
    },

    /** World position to CSS pixels, or null when behind the camera. */
    project([x, y, z]) {
      const m = projection.matrix;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 0) return null;
      return [
        (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5) * projection.width,
        (0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5) * projection.height,
      ];
    },
  };
}
