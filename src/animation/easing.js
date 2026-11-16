

// ─── Camera controls & keyframes ──────────────────────────────────────────
const EASE_PRESETS = Object.freeze({
  linear:        [0, 0, 1, 1],
  ease:          [0.25, 0.1, 0.25, 1],
  'ease-in':     [0.42, 0, 1, 1],
  'ease-out':    [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
});

// Кубическая временная кривая: сначала решаем Bx(u)=progress, затем берём By(u).
// Прямая подстановка progress вместо u дала бы неверную скорость для всех
// стандартных CSS-easing, у которых x1/x2 не равны 1/3 и 2/3.
function cubicBezierCoord(u, p1, p2) {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}

function cubicBezierDerivative(u, p1, p2) {
  const v = 1 - u;
  return 3 * v * v * p1 + 6 * v * u * (p2 - p1) + 3 * u * u * (1 - p2);
}

function evaluateCubicEase(progress, ease) {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) return x;
  const [x1, y1, x2, y2] = ease.values;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const error = cubicBezierCoord(u, x1, x2) - x;
    if (Math.abs(error) < 1e-7) return cubicBezierCoord(u, y1, y2);
    const slope = cubicBezierDerivative(u, x1, x2);
    if (Math.abs(slope) < 1e-7) break;
    const next = u - error / slope;
    if (next < 0 || next > 1) break;
    u = next;
  }
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    u = (lo + hi) / 2;
    if (cubicBezierCoord(u, x1, x2) < x) lo = u; else hi = u;
  }
  return cubicBezierCoord((lo + hi) / 2, y1, y2);
}

export { EASE_PRESETS, evaluateCubicEase };
