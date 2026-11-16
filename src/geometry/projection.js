import * as THREE from 'three';

// Проекция мировой точки в координаты SVG: viewBox = "0 0 W H", Y вниз.
const _prj = new THREE.Vector3();

function projectToSvg(world, camera, W, H) {
  _prj.copy(world).project(camera);
  if (_prj.z < -1 || _prj.z > 1) return null;       // вне near/far
  return { x: (_prj.x * 0.5 + 0.5) * W, y: (0.5 - _prj.y * 0.5) * H };
}

// Режет ребро на ВИДИМЫЕ под-отрезки, сэмплируя глубину вдоль ребра.
const _cp = new THREE.Vector3(), _cq = new THREE.Vector3(), _cm = new THREE.Vector3();

function clipEdgeToSegments(e, camera, W, H, isVisible, out, sampleStepPx = 3) {
  _cp.set(e.px, e.py, e.pz);
  _cq.set(e.qx, e.qy, e.qz);
  const a = projectToSvg(_cp, camera, W, H);
  const b = projectToSvg(_cq, camera, W, H);
  if (!a || !b) return;
  if (!isVisible) { out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); return; }

  const screenLen = Math.hypot(b.x - a.x, b.y - a.y);
  const stepPx = Math.max(0.25, Math.min(20, Number(sampleStepPx) || 3));
  // При дефолтных 3 px сохраняем прежний лимит 300 сэмплов. Если пользователь
  // уменьшает шаг, пропорционально повышаем лимит, чтобы настройка реально
  // добавляла точность и на длинных рёбрах (с защитным потолком по времени).
  const maxSteps = Math.max(45, Math.min(2400, Math.ceil(900 / stepPx)));
  const steps = Math.max(1, Math.min(maxSteps, Math.ceil(screenLen / stepPx)));
  const vis = new Uint8Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    _cm.lerpVectors(_cp, _cq, i / steps);
    vis[i] = isVisible(_cm) ? 1 : 0;
  }
  // Закрываем одиночные «дырки» (шум сэмплирования на скользящих углах)
  for (let i = 1; i < steps; i++) if (!vis[i] && vis[i - 1] && vis[i + 1]) vis[i] = 1;

  // Уточнение границы видимости бисекцией: без него концы отсечённых рёбер
  // «плавают» на ±3 px (шаг сэмплирования) и стыки контура выглядят рвано.
  const refine = (tVis, tHid) => {
    let lo = tVis, hi = tHid;
    for (let k = 0; k < 5; k++) {
      const m = (lo + hi) / 2;
      _cm.lerpVectors(_cp, _cq, m);
      if (isVisible(_cm)) lo = m; else hi = m;
    }
    return lo;
  };

  let runStart = -1;
  for (let i = 0; i <= steps; i++) {
    if (vis[i] && runStart < 0) runStart = i;
    if (runStart >= 0 && (!vis[i] || i === steps)) {
      const runEnd = vis[i] ? i : i - 1;
      // Даже один видимый сэмпл — это реальный короткий участок между двумя
      // перекрытиями. Раньше такие фрагменты (до ~3 px) целиком пропадали как
      // раз у границы, где один близко стоящий объект входит в другой.
      if (runEnd >= runStart) {
        // Точный t: на концах ребра берём 0/1 без уточнения (ребро видно целиком).
        const t0 = runStart === 0 ? 0 : refine(runStart / steps, (runStart - 1) / steps);
        const t1 = runEnd === steps ? 1 : refine(runEnd / steps, (runEnd + 1) / steps);

        // t относится к мировой прямой P→Q. После перспективной проекции тот
        // же t уже НЕ является линейным экранным параметром: интерполяция a→b
        // сдвигала конец линии от фактической границы окклюдера. Проецируем
        // уточнённые мировые точки заново, чтобы отсечение точно совпадало с ней.
        _cm.lerpVectors(_cp, _cq, t0);
        const p0 = projectToSvg(_cm, camera, W, H);
        _cm.lerpVectors(_cp, _cq, t1);
        const p1 = projectToSvg(_cm, camera, W, H);
        if (p0 && p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-4) {
          out.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y });
        }
      }
      runStart = -1;
    }
  }
}

export { clipEdgeToSegments };
