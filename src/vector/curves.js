import { dist, pt, clamp1, dot, norm, sub, fmt, mul, add } from './math2d.js';

function cleanChain(points) {
  const out = [];
  // 0.05 px: после отсечения окклюзией остаются почти совпадающие точки, из
  // которых считается касательная — их шум и раздувал кривую на стыках.
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > 0.05) out.push(pt(p.x, p.y));
  }
  return out;
}

function turnAngle(points, i, closed) {
  const n = points.length;
  if (!closed && (i === 0 || i === n - 1)) return 0;
  const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n];
  return Math.acos(clamp1(dot(norm(sub(b, a)), norm(sub(c, b))))) * 180 / Math.PI;
}

// Точка на расстоянии `target` вдоль контура от вершины i (знак = направление).
function pointAtOffset(points, i, target, closed) {
  const n = points.length;
  const dir = target > 0 ? 1 : -1;
  let remain = Math.abs(target);
  let idx = i, cur = points[i];
  for (let step = 0; step < n; step++) {
    let j = idx + dir;
    if (closed) j = (j + n) % n;
    else if (j < 0 || j >= n) return cur;          // открытый контур — упёрлись в конец
    const seg = dist(cur, points[j]);
    if (seg >= remain) {
      const t = seg > 1e-9 ? remain / seg : 0;
      return pt(cur.x + (points[j].x - cur.x) * t, cur.y + (points[j].y - cur.y) * t);
    }
    remain -= seg;
    idx = j; cur = points[j];
    if (closed && j === i) return cur;
  }
  return cur;
}

// Детектор углов по ОКНУ ДУГИ, а не по одному звену полилинии.
//
// Почему старая проверка (turnAngle одной вершины >= 50°) ломала форму:
//   • Фаска/микро-скругление разбивает угол 100° на два поворота по ~50°,
//     каждый ниже порога → шов не ставился → фиттер проводил через них одну
//     гладкую кривую в пределах допуска → острый угол превращался в дугу.
//   • Порог 50° вообще слишком груб: излом 30–45° в чертеже читается как угол.
//   • Результат зависел от плотности тесселяции: на мелкой сетке поворот
//     размазывался по вершинам и не набирал порог нигде.
//
// Здесь поворот меряется на фиксированной длине дуги (cornerWindow px) вокруг
// вершины. На гладкой дуге радиуса R он равен window/R и от тесселяции не
// зависит; на угле и на фаске — набирает полную величину излома. Второе
// условие (локальный поворот) отсекает соседние вершины на прямых участках,
// чтобы шов был ровно на изломе, но ОБЕ вершины фаски остались углами.
function detectCorners(points, closed, angleThresh, windowLen) {
  const n = points.length;
  const corner = new Uint8Array(n);
  if (n < 3) return corner;
  const localMin = Math.max(2, angleThresh * 0.2);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const back = pointAtOffset(points, i, -windowLen, closed);
    const fwd  = pointAtOffset(points, i,  windowLen, closed);
    const inc = sub(points[i], back), outg = sub(fwd, points[i]);
    if (Math.hypot(inc.x, inc.y) < 1e-6 || Math.hypot(outg.x, outg.y) < 1e-6) continue;
    const windowed = Math.acos(clamp1(dot(norm(inc), norm(outg)))) * 180 / Math.PI;
    if (windowed >= angleThresh && turnAngle(points, i, closed) >= localMin) corner[i] = 1;
  }
  return corner;
}

// Прямизна участка: максимум перпендикулярного отклонения от хорды.
// Возвращает Infinity, если участок «загибается» за пределы хорды (шпилька) —
// такое нельзя выпрямлять в одну линию.
function maxChordDeviation(points, first, last) {
  const a = points[first], b = points[last];
  const abx = b.x - a.x, aby = b.y - a.y;
  const L = Math.hypot(abx, aby);
  if (L < 1e-9) return Infinity;
  let max = 0;
  for (let i = first + 1; i < last; i++) {
    const rx = points[i].x - a.x, ry = points[i].y - a.y;
    const along = (rx * abx + ry * aby) / L;
    if (along < -0.5 || along > L + 0.5) return Infinity;
    const d = Math.abs(rx * aby - ry * abx) / L;
    if (d > max) max = d;
  }
  return max;
}

// Адаптивная аппроксимация: прямые участки → L, кривые → C (Безье).
// Раньше КАЖДЫЙ участок становился кубикой: прямые рёбра модели получали
// управляющие точки и слегка выгибались, а в Figma приходили как кривые.
function bezierPathData(rawPoints, error, cornerAngle = 25, cornerWindow = 4) {
  let points = cleanChain(rawPoints);
  if (points.length < 2) return '';
  const closed = points.length > 2 && dist(points[0], points[points.length - 1]) <= 0.05;
  if (closed) points = points.slice(0, -1);
  if (points.length < 2) return '';

  const flags = detectCorners(points, closed, cornerAngle, cornerWindow);
  const corners = [];
  for (let i = 0; i < points.length; i++) if (flags[i]) corners.push(i);

  const parts = [];
  let startIndex = 0;
  if (closed) {
    // Замкнутый участок start=end вырожден, поэтому у петли всегда >= 2 шва.
    if (!corners.length) corners.push(0, Math.floor(points.length / 2));
    else if (corners.length === 1) corners.push((corners[0] + Math.floor(points.length / 2)) % points.length);
    corners.sort((a, b) => a - b);
    startIndex = corners[0];
    for (let k = 0; k < corners.length; k++) {
      const a = corners[k], b = corners[(k + 1) % corners.length];
      const span = [points[a]];
      for (let i = (a + 1) % points.length; i !== (b + 1) % points.length; i = (i + 1) % points.length) {
        span.push(points[i]);
      }
      parts.push(...fitSpan(span, error));
    }
  } else {
    const seams = [0, ...corners.filter(i => i > 0 && i < points.length - 1), points.length - 1];
    for (let k = 0; k < seams.length - 1; k++) {
      parts.push(...fitSpan(points.slice(seams[k], seams[k + 1] + 1), error));
    }
  }

  if (!parts.length) return '';
  let d = `M ${fmt(points[startIndex].x)} ${fmt(points[startIndex].y)}`;
  for (const p of parts) {
    d += p.line
      ? ` L ${fmt(p.line.x)} ${fmt(p.line.y)}`
      : ` C ${fmt(p.c[1].x)} ${fmt(p.c[1].y)} ${fmt(p.c[2].x)} ${fmt(p.c[2].y)} ${fmt(p.c[3].x)} ${fmt(p.c[3].y)}`;
  }
  return closed ? d + ' Z' : d;
}

function fitSpan(points, error) {
  if (points.length < 2) return [];
  const tol = Math.max(error, 0.01);
  // Весь участок между углами прямой → одна команда L, без узлов и выгибов.
  if (points.length === 2 || maxChordDeviation(points, 0, points.length - 1) <= tol) {
    return [{ line: points[points.length - 1] }];
  }
  const left = norm(sub(points[1], points[0]));
  const right = norm(sub(points[points.length - 2], points[points.length - 1]), mul(left, -1));
  const out = [];
  fitCubic(points, 0, points.length - 1, left, right, tol, out);
  return out;
}

function fitCubic(points, first, last, tan1, tan2, error, out) {
  const count = last - first + 1;
  if (count === 2) {
    out.push({ line: points[last] });
    return;
  }

  let u = chordParameters(points, first, last);
  let curve = generateBezier(points, first, last, u, tan1, tan2);
  let result = maxBezierError(points, first, last, curve, u);
  const error2 = error * error;
  if (result.error <= error2) { out.push({ c: curve }); return; }

  if (result.error <= error2 * 4) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(points, first, last, u, curve);
      curve = generateBezier(points, first, last, u, tan1, tan2);
      result = maxBezierError(points, first, last, curve, u);
      if (result.error <= error2) { out.push({ c: curve }); return; }
    }
  }

  const split = Math.max(first + 1, Math.min(last - 1, result.split));
  const center = norm(sub(points[split - 1], points[split + 1]), mul(tan1, -1));
  fitCubic(points, first, split, tan1, center, error, out);
  fitCubic(points, split, last, mul(center, -1), tan2, error, out);
}

function chordParameters(points, first, last) {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + dist(points[i], points[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map(v => v / total);
}

function generateBezier(points, first, last, u, tan1, tan2) {
  const p0 = points[first], p3 = points[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i <= last - first; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * t * mt * mt, b2 = 3 * t * t * mt, b3 = t * t * t;
    const a0 = mul(tan1, b1), a1 = mul(tan2, b2);
    const base = add(mul(p0, b0 + b1), mul(p3, b2 + b3));
    const tmp = sub(points[first + i], base);
    c00 += dot(a0, a0); c01 += dot(a0, a1); c11 += dot(a1, a1);
    x0 += dot(a0, tmp); x1 += dot(a1, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = det ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = dist(p0, p3), minAlpha = seg * 1e-6;
  if (!Number.isFinite(alpha1) || !Number.isFinite(alpha2) || alpha1 < minAlpha || alpha2 < minAlpha) {
    alpha1 = alpha2 = seg / 3;
  }
  return [p0, add(p0, mul(tan1, alpha1)), add(p3, mul(tan2, alpha2)), p3];
}

function bezierAt(c, t) {
  const mt = 1 - t, b0 = mt*mt*mt, b1 = 3*mt*mt*t, b2 = 3*mt*t*t, b3 = t*t*t;
  return pt(c[0].x*b0 + c[1].x*b1 + c[2].x*b2 + c[3].x*b3,
            c[0].y*b0 + c[1].y*b1 + c[2].y*b2 + c[3].y*b3);
}

function maxBezierError(points, first, last, curve, u) {
  let max = 0, split = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i++) {
    const q = bezierAt(curve, u[i - first]);
    const delta = sub(q, points[i]);
    const d = dot(delta, delta);
    if (d >= max) { max = d; split = i; }
  }
  return { error: max, split };
}

function reparameterize(points, first, last, u, curve) {
  return u.map((t, i) => newtonBezier(curve, points[first + i], t));
}

function newtonBezier(c, p, u) {
  const q = bezierAt(c, u);
  const d1c = [mul(sub(c[1], c[0]), 3), mul(sub(c[2], c[1]), 3), mul(sub(c[3], c[2]), 3)];
  const mt = 1 - u;
  const q1 = add(add(mul(d1c[0], mt*mt), mul(d1c[1], 2*mt*u)), mul(d1c[2], u*u));
  const d2a = mul(add(sub(c[2], mul(c[1], 2)), c[0]), 6);
  const d2b = mul(add(sub(c[3], mul(c[2], 2)), c[1]), 6);
  const q2 = add(mul(d2a, mt), mul(d2b, u));
  const diff = sub(q, p);
  const denom = dot(q1, q1) + dot(diff, q2);
  if (Math.abs(denom) < 1e-9) return u;
  return Math.max(0, Math.min(1, u - dot(diff, q1) / denom));
}

export { bezierPathData };
