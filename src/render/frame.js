import * as THREE from 'three';
import { extractOutlineSegments } from '../geometry/outlines.js';
import { buildOutlineSvg, serializeStaticSvg } from '../svg/outline-svg.js';
import { cameraFromPose, clonePose } from '../camera/pose.js';
import { createCpuOcclusion } from '../occlusion/cpu.js';
import { normalizeRenderOptions } from '../options.js';
import { OutlineError, throwIfAborted } from '../errors.js';

const defaultOcclusion = createCpuOcclusion();

/** Подсказки о данных модели для выбранного режима рёбер. */
function topologyWarnings(topo, options) {
  if (options.wantEdges && options.edgeMode === 'material' && topo.materialCount < 2) {
    return [{ code: 'SINGLE_MATERIAL', message: 'в модели 1 материал — границ материалов нет' }];
  }
  if (options.wantEdges && options.edgeMode === 'baked') {
    const { hasNormals, bakedHardCount, manifoldCount } = topo;
    if (!hasNormals) return [{ code: 'NO_NORMALS', message: 'в файле нет нормалей — вшитых hard edges нет' }];
    if (bakedHardCount === 0) return [{ code: 'NO_BAKED_EDGES', message: 'модель целиком гладкая — вшитых hard edges нет' }];
    if (manifoldCount && bakedHardCount / manifoldCount > 0.8) {
      return [{ code: 'FLAT_SHADED', message: 'модель flat-shaded: жёсткими помечены почти все рёбра' }];
    }
  }
  return [];
}

function assertModel(model) {
  if (!model || !model.root || typeof model.ensureTopology !== 'function') {
    throw new OutlineError('BAD_MODEL', 'Ожидается модель ядра: результат loadModel() или createOutlineModel()');
  }
}

/**
 * Внутренний конвейер одного кадра. Опции уже нормализованы.
 * Ничего не знает об интерфейсе: не трогает превью, кнопки и вьюпорт.
 */
async function renderOutlineFrame(model, pose, options, context = {}, { serialize = true } = {}) {
  const { occlusion = defaultOcclusion, onStage, signal, fallbackDirection = null } = context;
  const stage = async (progress, label, id) => {
    throwIfAborted(signal);
    if (onStage) await onStage(progress, label, id);
    throwIfAborted(signal);
  };

  await stage(5, 'Подготовка топологии...', 'topology');
  const topo = model.ensureTopology();

  // Отдельная камера кадра: near/far сужаются по модели, aspect — по размеру
  // экспорта. Камера вьюпорта оболочки не участвует.
  const frameCamera = cameraFromPose(pose, { aspect: options.aspect, fallbackDirection });
  const bbox = new THREE.Box3().setFromObject(model.root);
  const bs = bbox.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(bs.radius) || bs.radius <= 0) throw new OutlineError('EMPTY_MODEL', 'У модели нет объёмной геометрии');
  const dist = frameCamera.position.distanceTo(bs.center);
  frameCamera.aspect = options.aspect;
  frameCamera.near = Math.max(dist - bs.radius * 1.2, bs.radius * 1e-3, 1e-3);
  frameCamera.far = Math.max(frameCamera.near * 1.01, dist + bs.radius * 1.2);
  frameCamera.updateProjectionMatrix();
  frameCamera.updateMatrixWorld(true);

  await stage(25, 'Буфер глубины...', 'occlusion');
  const isVisible = options.occlPct === 0 ? null
    : occlusion.createSampler({
      model, camera: frameCamera, width: options.W, height: options.H,
      bias: bs.radius * options.occlPct / 100,
    });

  await stage(45, 'Извлечение контуров...', 'extract');
  const segs = extractOutlineSegments(topo, frameCamera, options.W, options.H, {
    wantSilhouette: options.wantSilhouette,
    wantEdges: options.wantEdges,
    mode: options.edgeMode,
    angleDeg: options.angleDeg,
    forced: options.forced,
    removed: options.removed,
    clipStepPx: options.clipStepPx,
  }, isVisible);

  await stage(75, 'Векторизация...', 'vectorize');
  const outline = buildOutlineSvg(segs, {
    W: options.W, H: options.H, edgeColor: options.edgeColor, strokeW: options.strokeW,
    doStitch: options.doStitch, stitchEps: options.stitchEps,
    simplifyTol: options.simplifyTol, minLen: options.minLen,
    cornerAngle: options.cornerAngle,
    cornerWindow: Math.max(2, options.W / 250),
  });
  const warnings = topologyWarnings(topo, options);

  const result = {
    width: options.W,
    height: options.H,
    pathCount: outline.paths.length,
    segmentCount: segs.length,
    paths: outline.paths,
    outlineGroup: outline.group,
    previewSvg: outline.markup,
    warnings,
    note: warnings.map(w => ` · ${w.message}`).join(''),
    camera: { pose: clonePose(pose), near: frameCamera.near, far: frameCamera.far, aspect: frameCamera.aspect },
    occlusion: isVisible ? occlusion.kind ?? 'custom' : 'none',
  };
  if (serialize) result.svg = serializeStaticSvg(outline.markup, options.bgChoice).svgString;
  return result;
}

/**
 * Рендер одного outline-кадра.
 *
 * @param {import('../contracts.js').OutlineModel} model
 * @param {import('../contracts.js').CameraPose} pose
 * @param {Partial<import('../contracts.js').RenderOptions>} [options]
 * @param {import('../contracts.js').RenderContext} [context]
 * @returns {Promise<import('../contracts.js').FrameResult>}
 */
export async function renderFrame(model, pose, options = {}, context = {}) {
  assertModel(model);
  return renderOutlineFrame(model, pose, normalizeRenderOptions(options), context, { serialize: true });
}

export { renderOutlineFrame, topologyWarnings, assertModel };
