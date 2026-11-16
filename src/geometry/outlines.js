import { clipEdgeToSegments } from './projection.js';
import { isBakedHardEdge } from './topology.js';

// Ребро считается «вшитым hard edge», если в САМОМ ФАЙЛЕ вершины вдоль него
// расщеплены: две смежные грани держат в общей точке РАЗНЫЕ нормали.
// Именно так хранят жёсткость все нормальные пайплайны:
//   • Blender «Mark Sharp» + Auto Smooth → split normals в GLB/GLTF;
//   • OBJ: smoothing groups (`s off` / `s 1` …) → разные vn у соседних граней;
//   • любой flat-shaded участок.
// Гладкое (welded) ребро даёт в общей точке ОДНУ и ту же нормаль.
// Порог 1° — запас на потери точности при квантовании нормалей в файле.
const EMPTY_SET = new Set();

// Классификация рёбер + проекция + клиппинг по глубине → плоские сегменты SVG.
function extractOutlineSegments(topo, camera, W, H, opts, isVisible) {
  const { wantSilhouette, wantEdges, mode, angleDeg,
          forced = EMPTY_SET, removed = EMPTY_SET, clipStepPx = 3 } = opts;
  const cosCrease = Math.cos(angleDeg * Math.PI / 180);
  const { fN, fC, fMat, faceCount, edges } = topo;
  const cam = camera.position;

  const front = new Uint8Array(faceCount);
  for (let t = 0; t < faceCount; t++) {
    const o = t * 3;
    front[t] = (fN[o] * (cam.x - fC[o]) + fN[o + 1] * (cam.y - fC[o + 1]) + fN[o + 2] * (cam.z - fC[o + 2])) > 0 ? 1 : 0;
  }

  const wantMat   = wantEdges && mode === 'material';
  const wantBaked = wantEdges && mode === 'baked';
  const segs = [];
  for (const e of edges) {
    if (e.n > 2) continue;                          // non-manifold — пропуск
    if (removed.has(e.key)) continue;               // ребро снято вручную
    if (forced.has(e.key)) {
      // Добавлено вручную кликом по мешу: рисуем всегда и целиком. Пользователь
      // указал конкретное ребро, поэтому ни классификация, ни удаление скрытых
      // линий его не отменяют — иначе выбор выглядел бы как «не сработало».
      clipEdgeToSegments(e, camera, W, H, null, segs);
      continue;
    }
    const open = e.t1 < 0;
    const f0 = front[e.t0] === 1;
    const f1 = !open && front[e.t1] === 1;

    let draw = false;
    if (wantSilhouette && (open ? f0 : (f0 !== f1))) draw = true;
    if (!draw && wantEdges && (f0 || f1)) {
      if (open) {
        draw = true;                                // граничное (открытое) ребро
      } else if (wantBaked) {
        // Только то, что помечено жёстким в файле. Ни угол, ни материалы
        // здесь не участвуют — это и есть третий, «файловый» детектор.
        draw = isBakedHardEdge(e);
      } else if (wantMat && fMat[e.t0] !== fMat[e.t1]) {
        draw = true;                                // граница материалов
      } else {
        const a = e.t0 * 3, b = e.t1 * 3;
        const d01 = fN[a] * fN[b] + fN[a + 1] * fN[b + 1] + fN[a + 2] * fN[b + 2];
        if (d01 < cosCrease) draw = true;           // геометрический hard edge
      }
    }
    if (!draw) continue;
    clipEdgeToSegments(e, camera, W, H, isVisible, segs, clipStepPx);
  }
  return segs;
}

export { extractOutlineSegments };
