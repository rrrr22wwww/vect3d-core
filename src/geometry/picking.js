import * as THREE from 'three';

// ─── Поиск ребра под курсором ──────────────────────────────────────────────
// Выбор идёт по реальным рёбрам меша, а не по нарисованным штрихам: курсор
// притягивается к ближайшему ребру топологии. Экранная проекция кэшируется
// оболочкой и пересобирается только когда камера реально сдвинулась.

export const PICK_RADIUS = 12;   // px

/**
 * Экранная проекция всех рёбер для попадания курсором.
 * Координаты — в пикселях вьюпорта (Y вниз), как у событий мыши.
 */
export function projectEdgesForPicking(topology, camera, W, H) {
  const edges = topology.edges;
  const xy = new Float32Array(edges.length * 4);
  const depth = new Float32Array(edges.length);
  const ok = new Uint8Array(edges.length);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3();
  camera.updateMatrixWorld();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    a.set(e.px, e.py, e.pz).project(camera);
    b.set(e.qx, e.qy, e.qz).project(camera);
    if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue;   // вне фрустума
    const o = i * 4;
    xy[o]   = (a.x * 0.5 + 0.5) * W; xy[o+1] = (0.5 - a.y * 0.5) * H;
    xy[o+2] = (b.x * 0.5 + 0.5) * W; xy[o+3] = (0.5 - b.y * 0.5) * H;
    m.set((e.px + e.qx) / 2, (e.py + e.qy) / 2, (e.pz + e.qz) / 2)
     .applyMatrix4(camera.matrixWorldInverse);
    depth[i] = -m.z;
    ok[i] = 1;
  }
  return { xy, depth, ok, W, H };
}

function segDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-9 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/**
 * Ключ ближайшего ребра к точке (px, py) вьюпорта или null.
 * @param {ReturnType<typeof projectEdgesForPicking>} cache
 */
export function pickEdge(topology, cache, px, py, radius = PICK_RADIUS) {
  const { xy, depth, ok } = cache;
  const edges = topology.edges;
  let best = -1, bestDist = radius, bestDepth = Infinity;
  for (let i = 0; i < edges.length; i++) {
    if (!ok[i]) continue;
    const o = i * 4;
    const d = segDistance(px, py, xy[o], xy[o+1], xy[o+2], xy[o+3]);
    if (d > bestDist + 2) continue;
    // При почти равном экранном расстоянии выигрывает ближнее к камере ребро,
    // иначе сквозь модель выбиралось бы ребро на её обратной стороне.
    if (d < bestDist - 2 || (d <= bestDist + 2 && depth[i] < bestDepth)) {
      best = i; bestDist = Math.min(bestDist, d); bestDepth = depth[i];
    }
  }
  return best >= 0 ? edges[best].key : null;
}
