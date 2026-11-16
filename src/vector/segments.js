import { pt } from './math2d.js';

function dedupeSegments(segs, tolerance) {
  const q = v => Math.round(v / tolerance);
  const pointKey = (x, y) => `${q(x)},${q(y)}`;
  const seen = new Set();
  const out = [];
  for (const s of segs) {
    if (![s.x1,s.y1,s.x2,s.y2].every(Number.isFinite)) continue;
    if (Math.hypot(s.x2-s.x1, s.y2-s.y1) < 1e-4) continue;
    const a = pointKey(s.x1, s.y1), b = pointKey(s.x2, s.y2);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return mergeCollinearSegments(out, tolerance);
}

// Схлопывает частично перекрывающиеся КОЛЛИНЕАРНЫЕ рёбра (A→C поверх A→B→C):
// один и тот же контур приходит и из силуэта, и из hard edge, и режется
// окклюзией на разные куски. Раньше группировка шла по хэш-бакетам угла и
// смещения — дубли на границе бакета не склеивались (линия выходила двойной,
// толще и темнее). Теперь — сортировка + свипинг, границ бакетов нет.
function mergeCollinearSegments(segs, tolerance) {
  const ANG_TOL = 0.004;          // ~0.23°: реальный излом всегда больше
  const items = [];
  for (const s of segs) {
    let dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    dx /= length; dy /= length;
    // Каноническое направление, чтобы A→B и B→A попали в одну группу
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
    const ta = dx * s.x1 + dy * s.y1, tb = dx * s.x2 + dy * s.y2;
    items.push({
      angle: Math.atan2(dy, dx),
      offset: -dy * s.x1 + dx * s.y1,   // знаковое расстояние до начала координат
      ...(ta <= tb
        ? { min: ta, max: tb, pMin: pt(s.x1, s.y1), pMax: pt(s.x2, s.y2) }
        : { min: tb, max: ta, pMin: pt(s.x2, s.y2), pMax: pt(s.x1, s.y1) }),
    });
  }
  if (!items.length) return [];

  const merged = [];
  const flushGroup = (group) => {
    group.sort((a, b) => a.min - b.min);
    let cur = group[0];
    for (let i = 1; i < group.length; i++) {
      const nx = group[i];
      if (nx.min <= cur.max + tolerance) {
        if (nx.max > cur.max) { cur.max = nx.max; cur.pMax = nx.pMax; }
      } else {
        merged.push({ x1: cur.pMin.x, y1: cur.pMin.y, x2: cur.pMax.x, y2: cur.pMax.y });
        cur = nx;
      }
    }
    merged.push({ x1: cur.pMin.x, y1: cur.pMin.y, x2: cur.pMax.x, y2: cur.pMax.y });
  };

  // Свип по углу, внутри — свип по смещению.
  items.sort((a, b) => a.angle - b.angle);
  let angleRun = [items[0]];
  const flushAngleRun = (run) => {
    run.sort((a, b) => a.offset - b.offset);
    let offRun = [run[0]];
    for (let i = 1; i < run.length; i++) {
      if (run[i].offset - run[i - 1].offset <= tolerance) offRun.push(run[i]);
      else { flushGroup(offRun); offRun = [run[i]]; }
    }
    flushGroup(offRun);
  };
  for (let i = 1; i < items.length; i++) {
    if (items[i].angle - items[i - 1].angle <= ANG_TOL) angleRun.push(items[i]);
    else { flushAngleRun(angleRun); angleRun = [items[i]]; }
  }
  flushAngleRun(angleRun);
  return merged;
}

export { dedupeSegments };
