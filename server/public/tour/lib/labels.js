/** HTML labels pinned to 3D points. A label lives as long as it is set every frame. */
export function createLabels(root, project) {
  const labels = new Map();
  let frame = 0;

  return {
    begin() {
      frame++;
    },

    set(id, position, html, className = "") {
      let label = labels.get(id);
      if (!label) {
        label = { el: root.appendChild(document.createElement("div")), html: null, className: null };
        labels.set(id, label);
      }
      if (label.html !== html || label.className !== className) {
        label.el.innerHTML = html;
        label.el.className = `label ${className}`;
        label.width = label.el.offsetWidth;
        label.height = label.el.offsetHeight;
        Object.assign(label, { html, className });
      }
      label.frame = frame;
      label.position = position;
    },

    end(bounds) {
      const visible = [];
      for (const [id, label] of labels) {
        const point = label.frame === frame ? project(label.position) : null;
        if (!point) {
          label.el.remove();
          labels.delete(id);
          continue;
        }
        if (point[0] < bounds.x - 40 || point[0] > bounds.x + bounds.width + 40) {
          label.el.style.transform = "translate(-9999px, 0)";
          continue;
        }
        const half = label.width / 2 + 6;
        const x = Math.max(bounds.x + half, Math.min(bounds.x + bounds.width - half, point[0]));
        visible.push({ label, x, y: point[1] });
      }

      // The label nearest the viewer keeps its place and the ones behind it stack upwards.
      const placed = [];
      for (const item of visible.sort((a, b) => b.y - a.y)) {
        for (const other of placed) {
          const apart = Math.abs(item.x - other.x) >= (item.label.width + other.label.width) / 2 + 6;
          const above = item.y <= other.y - other.label.height - 3;
          const below = item.y - item.label.height >= other.y + 3;
          if (!apart && !above && !below) item.y = other.y - other.label.height - 4;
        }
        placed.push(item);
        placed.sort((a, b) => b.y - a.y);
        item.label.el.style.transform = `translate(${item.x}px, ${item.y}px) translate(-50%, -100%)`;
      }
    },
  };
}
