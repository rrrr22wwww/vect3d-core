import * as THREE from 'three';

// ─── Удаление скрытых линий без GPU ─────────────────────────────────────────
// Программный аналог depth pass из occlusion/webgl.js. Треугольники модели
// растеризуются в буфер ЛИНЕЙНОЙ (view-space) глубины той же сеткой пикселей,
// что и offscreen-буфер WebGL:
//   • начало координат — левый нижний угол (как у readRenderTargetPixels);
//   • пиксель (px, py) покрывается, если его центр (px+0.5, py+0.5) внутри
//     треугольника;
//   • отбрасываются задние грани (MeshDepthMaterial рисует FrontSide), с учётом
//     зеркальных трансформаций (отрицательный определитель matrixWorld);
//   • треугольники режутся ближней плоскостью, глубже far ничего не пишется.
// Тест видимости точки — та же формула, что и у WebGL-версии: «крест» из
// 5 пикселей, максимум глубины и bias в мировых единицах.
//
// Работает в любой JS-среде (Node, Deno, Bun, Worker, браузер), потому что
// использует только математику Three.js.

/**
 * Растеризует видимые меши `root` в буфер линейной глубины.
 * @returns {Float32Array} width*height значений; пустой пиксель = camera.far
 */
function rasterizeDepth(root, camera, width, height) {
  camera.updateMatrixWorld();
  const near = camera.near, far = camera.far;
  const depth = new Float32Array(width * height).fill(far);
  const mv = new THREE.Matrix4(), mvp = new THREE.Matrix4();
  root.updateMatrixWorld(true);

  // Вершины полигона после отсечения: [clipX, clipY, clipZ, clipW, viewDepth]
  const poly = [];
  const tmp = [new Float64Array(5), new Float64Array(5), new Float64Array(5)];
  const clipped = Array.from({ length: 4 }, () => new Float64Array(5));
  const sx = new Float64Array(4), sy = new Float64Array(4), iw = new Float64Array(4), dw = new Float64Array(4);

  const rasterTri = (a, b, c, flip) => {
    const x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[c], y2 = sy[c];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!(Math.abs(area) > 1e-12)) return;
    // В оконных координатах с осью Y вверх лицевая грань идёт против часовой.
    if ((area > 0) === flip) return;
    const minX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5));
    const maxX = Math.min(width - 1, Math.floor(Math.max(x0, x1, x2) - 0.5));
    const minY = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5));
    const maxY = Math.min(height - 1, Math.floor(Math.max(y0, y1, y2) - 0.5));
    if (minX > maxX || minY > maxY) return;
    const inv = 1 / area;
    const iw0 = iw[a], iw1 = iw[b], iw2 = iw[c];
    const dw0 = dw[a], dw1 = dw[b], dw2 = dw[c];
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      const row = py * width;
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const b0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv;
        if (b0 < 0) continue;
        const b1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv;
        if (b1 < 0) continue;
        const b2 = 1 - b0 - b1;
        if (b2 < 0) continue;
        // Перспективно-корректная интерполяция: в экранном пространстве
        // линейны 1/w и depth/w.
        const invW = b0 * iw0 + b1 * iw1 + b2 * iw2;
        const z = (b0 * dw0 + b1 * dw1 + b2 * dw2) / invW;
        if (z > far || z < 0) continue;
        const i = row + px;
        if (z < depth[i]) depth[i] = z;
      }
    }
  };

  const toScreen = (v, k) => {
    const w = v[3];
    sx[k] = (v[0] / w * 0.5 + 0.5) * width;
    sy[k] = (v[1] / w * 0.5 + 0.5) * height;
    iw[k] = 1 / w;
    dw[k] = v[4] / w;
  };

  const lerpInto = (out, p, q, t) => { for (let j = 0; j < 5; j++) out[j] = p[j] + (q[j] - p[j]) * t; };

  root.traverseVisible((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geo = node.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const index = geo.index;
    const triCount = Math.floor((index ? index.count : pos.count) / 3);
    if (!triCount) return;

    mv.multiplyMatrices(camera.matrixWorldInverse, node.matrixWorld);
    mvp.multiplyMatrices(camera.projectionMatrix, mv);
    const e = mvp.elements, m = mv.elements;
    const flip = node.matrixWorld.determinant() < 0;

    const n = pos.count;
    const verts = new Float64Array(n * 5);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const o = i * 5;
      verts[o]     = e[0] * x + e[4] * y + e[8]  * z + e[12];
      verts[o + 1] = e[1] * x + e[5] * y + e[9]  * z + e[13];
      verts[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      verts[o + 3] = e[3] * x + e[7] * y + e[11] * z + e[15];
      verts[o + 4] = -(m[2] * x + m[6] * y + m[10] * z + m[14]);   // линейная глубина
    }

    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
        tmp[k].set(verts.subarray(vi * 5, vi * 5 + 5));
      }
      // Отсечение ближней плоскостью в clip space: z + w >= 0.
      poly.length = 0;
      let inside = 0;
      for (let k = 0; k < 3; k++) if (tmp[k][2] + tmp[k][3] >= 0) inside++;
      if (inside === 0) continue;
      if (inside === 3) {
        poly.push(tmp[0], tmp[1], tmp[2]);
      } else {
        let used = 0;
        for (let k = 0; k < 3; k++) {
          const p = tmp[k], q = tmp[(k + 1) % 3];
          const dp = p[2] + p[3], dq = q[2] + q[3];
          if (dp >= 0) poly.push(p);
          if ((dp >= 0) !== (dq >= 0)) {
            const out = clipped[used++];
            lerpInto(out, p, q, dp / (dp - dq));
            poly.push(out);
          }
        }
      }
      for (let k = 0; k < poly.length; k++) {
        if (!(poly[k][3] > 0)) { poly.length = 0; break; }
        toScreen(poly[k], k);
      }
      for (let k = 1; k + 1 < poly.length; k++) rasterTri(0, k, k + 1, flip);
    }
  });
  return depth;
}

/**
 * Тест видимости мировой точки по программному буферу глубины.
 * Камера должна иметь УЖЕ суженный near/far (так её готовит renderFrame).
 */
function buildCpuDepthSampler(root, camera, width, height, bias) {
  const buf = rasterizeDepth(root, camera, width, height);
  const far = camera.far;
  const sampleLinear = (px, py) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return far;
    return buf[py * width + px];
  };
  const storedAt = (px, py) => Math.max(
    sampleLinear(px, py),
    sampleLinear(px - 1, py), sampleLinear(px + 1, py),
    sampleLinear(px, py - 1), sampleLinear(px, py + 1)
  );

  const proj = new THREE.Vector3();
  const view = new THREE.Vector3();
  return (world) => {
    proj.copy(world).project(camera);
    const px = Math.round((proj.x * 0.5 + 0.5) * width);
    const py = Math.round((proj.y * 0.5 + 0.5) * height);
    const pointDist = -view.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
    return pointDist <= storedAt(px, py) + bias;
  };
}

/**
 * Провайдер окклюзии без GPU. Используется ядром по умолчанию.
 * @returns {import('../contracts.js').OcclusionProvider}
 */
function createCpuOcclusion() {
  return {
    kind: 'cpu',
    createSampler({ model, camera, width, height, bias }) {
      return buildCpuDepthSampler(model.root, camera, width, height, bias);
    },
  };
}

export { createCpuOcclusion, buildCpuDepthSampler, rasterizeDepth };
