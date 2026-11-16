// outline-core — вычислительное ядро «3D-модель → SVG-outline».
//
// Публичный API. Оболочки (Figma-плагин, CLI, веб-страница, Worker, сервер)
// обращаются к ядру только через этот модуль и 'outline-core/webgl'.
// Ядро не использует DOM, window, requestAnimationFrame, canvas и Figma API.

// Модель
export { loadModel, detectModelFormat, checkGltfSelfContained, MODEL_FORMATS } from './model/load.js';
export { createOutlineModel, describeModel, NORMALIZED_SIZE } from './model/model.js';

// Камера
export { cameraFromPose, poseFromCamera, clonePose, poseDirection, DEFAULT_FOV } from './camera/pose.js';

// Рендер
export { renderFrame } from './render/frame.js';
export { renderAnimation } from './render/animation.js';
export { normalizeRenderOptions, DEFAULT_RENDER_OPTIONS, EDGE_MODES } from './options.js';

// Окклюзия (удаление скрытых линий)
export { createCpuOcclusion } from './occlusion/cpu.js';

// Анимация камеры
export { EASE_PRESETS, evaluateCubicEase } from './animation/easing.js';
export {
  evaluateCameraTrack, isLoopSeamless, sortCameraKeys, snapTrackTime, normalizeCameraKeys,
} from './animation/track.js';
export { planAnimation, ANIMATION_LIMITS } from './animation/plan.js';

// Ручная правка рёбер
export { createEdgeSelection } from './editing/edge-selection.js';
export { projectEdgesForPicking, pickEdge, PICK_RADIUS } from './geometry/picking.js';

// Ошибки
export { OutlineError, ERROR_CODES, abortError } from './errors.js';

// Низкоуровневые этапы конвейера — для собственных конвейеров оболочки.
export { buildTopology, isBakedHardEdge } from './geometry/topology.js';
export { extractOutlineSegments } from './geometry/outlines.js';
export { clipEdgeToSegments } from './geometry/projection.js';
export { dedupeSegments } from './vector/segments.js';
export { stitchSegments } from './vector/stitching.js';
export { bezierPathData } from './vector/curves.js';
export { buildOutlinePaths, buildOutlineSvg, serializeStaticSvg } from './svg/outline-svg.js';
export { createAnimatedSvg } from './svg/animated-svg.js';
