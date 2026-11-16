/**
 * Публичные контракты outline-core (JSDoc). Всё, что пересекает границу
 * «ядро ↔ оболочка», — простые данные: массивы чисел, строки, Set ключей.
 *
 * @typedef {{ position: number[], target: number[], fov: number }} CameraPose
 *   Ракурс в координатах нормализованной модели (габарит ~100 единиц).
 *
 * @typedef {{ preset?: string, values: number[] }} Ease
 *   Временная cubic-bezier [x1, y1, x2, y2] от ключа к следующему.
 *
 * @typedef {{ id: number, time: number, pose: CameraPose, ease: Ease }} CameraKey
 *
 * @typedef {{ x1: number, y1: number, x2: number, y2: number }} Segment
 *
 * @typedef {{
 *   W: number, H: number, aspect: number,
 *   bgChoice: string, edgeColor: string, strokeW: number,
 *   edgeMode: 'baked' | 'material' | 'normals', angleDeg: number,
 *   wantSilhouette: boolean, wantEdges: boolean,
 *   doStitch: boolean, stitchEps: number,
 *   simplifyTol: number, cornerAngle: number, minLen: number,
 *   occlPct: number, clipStepPx: number,
 *   forced: Set<string>, removed: Set<string>
 * }} RenderOptions
 *   W×H — размер SVG в px; aspect — для камеры кадра (по умолчанию W/H);
 *   bgChoice — 'white' | 'black' | 'transparent' | любой цвет SVG;
 *   simplifyTol = 0 — полилинии; occlPct = 0 — без удаления скрытых линий;
 *   forced / removed — ключи рёбер ручной правки (принимаются и массивы).
 *
 * @typedef {{
 *   kind?: string,
 *   createSampler(args: { model: OutlineModel, camera: import('three').PerspectiveCamera,
 *                         width: number, height: number, bias: number }): (world: import('three').Vector3) => boolean
 * }} OcclusionProvider
 *   Источник теста видимости точки. Встроены: createCpuOcclusion() (по
 *   умолчанию, без GPU) и createWebGLOcclusion() из 'outline-core/webgl'.
 *
 * @typedef {{
 *   occlusion?: OcclusionProvider,
 *   onStage?: (progress: number, label: string, stage: string) => (void | Promise<void>),
 *   signal?: AbortSignal
 * }} RenderContext
 *
 * @typedef {{
 *   occlusion?: OcclusionProvider,
 *   onFrame?: (info: { index: number, count: number, time: number, pose: CameraPose, pathCount: number }) => (void | Promise<void>),
 *   signal?: AbortSignal,
 *   limits?: { maxFrames: number, maxPixelFrames: number }
 * }} AnimationContext
 *
 * @typedef {{
 *   width: number, height: number, pathCount: number, segmentCount: number,
 *   paths: Array<{ type: 'path', d: string } | { type: 'polyline', points: string }>,
 *   svg: string, previewSvg: string, outlineGroup: string,
 *   warnings: Array<{ code: string, message: string }>, note: string,
 *   camera: { pose: CameraPose, near: number, far: number, aspect: number },
 *   occlusion: string
 * }} FrameResult
 *   svg — готовый файл (XML-декларация + фон); previewSvg — тот же SVG без
 *   фона и декларации, для показа в интерфейсе; paths — данные путей для
 *   оболочек, которые строят векторы сами (canvas, нативные узлы и т.п.).
 *
 * @typedef {{
 *   width: number, height: number, frameCount: number, times: number[],
 *   duration: number, loop: boolean, seamless: boolean,
 *   svg: string, previewSvg: string
 * }} AnimationResult
 *
 * @typedef {{
 *   root: import('three').Object3D, fileName: string,
 *   warnings: Array<{ code: string, message: string }>,
 *   readonly topology: object | null,
 *   ensureTopology(): object,
 *   invalidateTopology(): void,
 *   getBounds(): { min: number[], max: number[], center: number[], size: number[], maxDim: number, radius: number },
 *   defaultCameraPose(options?: { fov?: number }): CameraPose,
 *   dispose(): void
 * }} OutlineModel
 */
export {};
