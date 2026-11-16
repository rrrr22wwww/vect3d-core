import { norm, pt, sub, dot } from './math2d.js';

// ── Graph-based segment stitching ──────────────────────────────────────────
function stitchSegments(segsIn, eps) {
  const n = segsIn.length;
  if (!n) return [];
  const used = new Uint8Array(n);
  const sc = 1 / eps;
  const cell = (x, y) => [Math.floor(x * sc), Math.floor(y * sc)];
  const key = (x, y) => `${x},${y}`;
  const adj = new Map();
  const addPt = (x, y, idx, isStart) => {
    const [cx, cy] = cell(x, y);
    const k = key(cx, cy);
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push({ idx, isStart, x, y });
  };
  for (let i = 0; i < n; i++) {
    addPt(segsIn[i].x1, segsIn[i].y1, i, true);
    addPt(segsIn[i].x2, segsIn[i].y2, i, false);
  }
  const grab = (x, y, prevX, prevY, excludeIdx) => {
    const [cx, cy] = cell(x, y);
    const desired = norm(pt(x - prevX, y - prevY));
    let best = null, bestScore = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const list = adj.get(key(cx + ox, cy + oy));
      if (!list) continue;
      for (const e of list) {
        if (e.idx === excludeIdx || used[e.idx]) continue;
        const gap = Math.hypot(e.x - x, e.y - y);
        if (gap > eps) continue;
        const s = segsIn[e.idx];
        const other = e.isStart ? pt(s.x2, s.y2) : pt(s.x1, s.y1);
        const direction = norm(sub(other, pt(x, y)), desired);
        const score = (1 - dot(desired, direction)) * 4 + gap / eps;
        if (score < bestScore) {
          bestScore = score;
          // joinX/joinY — ближний конец соседа. Раньше цепочка прыгала сразу в
          // дальний конец, «срезая» стык до eps px: на изломе это заметно
          // скругляло/смещало вершину угла.
          best = { x: other.x, y: other.y, joinX: e.x, joinY: e.y, idx: e.idx };
        }
      }
    }
    if (best) used[best.idx] = 1;
    return best;
  };
  // Сваривает текущий конец цепочки с началом присоединяемого сегмента:
  // общая вершина становится одной точкой, а не парой почти совпадающих.
  const weld = (end, r) => { end.x = (end.x + r.joinX) / 2; end.y = (end.y + r.joinY) / 2; };
  const chains = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segsIn[i];
    const pts = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    let lf = i;
    for (;;) {
      const end = pts[pts.length - 1], prev = pts[pts.length - 2];
      const r = grab(end.x, end.y, prev.x, prev.y, lf);
      if (!r) break;
      weld(end, r);
      pts.push({ x: r.x, y: r.y });
      lf = r.idx;
    }
    let lb = i;
    for (;;) {
      const start = pts[0], next = pts[1];
      const r = grab(start.x, start.y, next.x, next.y, lb);
      if (!r) break;
      weld(start, r);
      pts.unshift({ x: r.x, y: r.y });
      lb = r.idx;
    }
    chains.push(pts);
  }
  return chains;
}

export { stitchSegments };
