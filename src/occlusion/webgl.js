import * as THREE from 'three';

// ─── Удаление скрытых линий по буферу глубины ───────────────────────────────
// Рендерит модель MeshDepthMaterial в offscreen-буфер, считывает упакованную
// глубину и возвращает тест isVisible(worldPoint). Сравнение в ЛИНЕЙНОЙ
// (view-space) глубине, bias в мировых единицах → порог одинаков на любом
// расстоянии. Камера должна иметь УЖЕ суженный near/far. Сэмплируем «крест»
// 5 пикселей и берём максимум глубины — убирает ложные перекрытия ровно на
// линии силуэта (пиксель попадает на собственную/чужую переднюю грань).
function buildDepthSampler(renderer, scene, camera, width, height, bias, overlays) {
  const prevTarget = renderer.getRenderTarget();
  const prevOverride = scene.overrideMaterial;
  const prevBg = scene.background;
  let rt = null, depthMat = null, overlaysWere = null, buf = null;
  try {
    rt = new THREE.WebGLRenderTarget(width, height);
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    rt.depthBuffer = true;
    depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    buf = new Uint8Array(width * height * 4);
    overlaysWere = setOverlaysVisible(false, overlays);   // линии подсветки не должны писать глубину
    scene.overrideMaterial = depthMat;
    scene.background = null;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    camera.updateMatrixWorld();   // гарантируем актуальный matrixWorldInverse
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf);
  } finally {
    // Рендер одного кадра используется и статически, и в цикле SVG-анимации.
    // Любая ошибка WebGL не должна оставлять сцену в depth-режиме.
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    if (overlaysWere) setOverlaysVisible(overlaysWere, overlays);
    renderer.setRenderTarget(prevTarget);
    rt?.dispose();
    depthMat?.dispose();
  }

  const near = camera.near, far = camera.far;
  const F = 255 / 256;   // как в three.js unpackRGBAToDepth → оконная глубина [0,1]
  const winToLinear = (z01) => -(near * far) / ((far - near) * z01 - far);

  const sampleLinear = (px, py) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return far;
    const i = (py * width + px) * 4;
    const z01 = F * (buf[i] / 255 / 16777216 + buf[i + 1] / 255 / 65536 + buf[i + 2] / 255 / 256 + buf[i + 3] / 255);
    return winToLinear(z01);
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
    // ВАЖНО: readRenderTargetPixels отдаёт буфер с началом в ЛЕВОМ-НИЖНЕМ углу
    // (WebGL), поэтому по Y flip НЕ делаем. Flip нужен только для SVG-проекции.
    const px = Math.round((proj.x * 0.5 + 0.5) * width);
    const py = Math.round((proj.y * 0.5 + 0.5) * height);
    const pointDist  = -view.copy(world).applyMatrix4(camera.matrixWorldInverse).z; // > 0
    return pointDist <= storedAt(px, py) + bias;   // видимо, если не глубже ближайшей грани
  };
}

// Оверлеи временно гасятся на время рендера буфера глубины, иначе линии
// подсветки запишут глубину и «продырявят» удаление скрытых линий.
function setOverlaysVisible(v, overlays) {
  const prev = overlays.map(o => o.visible);
  if (v === false) overlays.forEach(o => { o.visible = false; });
  else if (Array.isArray(v)) overlays.forEach((o, i) => { o.visible = v[i]; });
  return prev;
}

export { buildDepthSampler };

/**
 * Провайдер окклюзии на WebGL: тот же depth pass, что и в плагине.
 * Нужен рендерер и сцена оболочки, в которой лежит модель. Объекты из
 * `exclude` (подсветка, хелперы) гасятся на время прохода и восстанавливаются.
 *
 * @param {{ renderer: import('three').WebGLRenderer, scene: import('three').Scene,
 *           exclude?: Array<{visible: boolean}> | (() => Array<{visible: boolean}>) }} options
 * @returns {import('../contracts.js').OcclusionProvider}
 */
function createWebGLOcclusion({ renderer, scene, exclude = [] }) {
  if (!renderer || !scene) throw new TypeError('createWebGLOcclusion: нужны renderer и scene');
  return {
    kind: 'webgl',
    createSampler({ camera, width, height, bias }) {
      const overlays = typeof exclude === 'function' ? exclude() : exclude;
      return buildDepthSampler(renderer, scene, camera, width, height, bias, overlays || []);
    },
  };
}

export { createWebGLOcclusion };
