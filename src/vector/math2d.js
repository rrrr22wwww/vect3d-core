

// ═══════════════════════════════════════════════════════════════════════════
//  ВЕКТОРИЗАЦИЯ: острые углы + прямые линии
// ═══════════════════════════════════════════════════════════════════════════
const fmt = n => Number(n.toFixed(2)).toString();

const pt = (x, y) => ({ x, y });

const add = (a, b) => pt(a.x + b.x, a.y + b.y);

const sub = (a, b) => pt(a.x - b.x, a.y - b.y);

const mul = (a, s) => pt(a.x * s, a.y * s);

const dot = (a, b) => a.x * b.x + a.y * b.y;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp1 = v => Math.max(-1, Math.min(1, v));

function norm(v, fallback = { x: 1, y: 0 }) {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? pt(v.x / l, v.y / l) : pt(fallback.x, fallback.y);
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return L;
}

export { pt, polylineLength, fmt, dist, clamp1, dot, norm, sub, mul, add };
