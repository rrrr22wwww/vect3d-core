import { clampNumber } from './util/numbers.js';
import { OutlineError } from './errors.js';

export const EDGE_MODES = Object.freeze(['baked', 'material', 'normals']);

// Значения по умолчанию совпадают с исходными значениями полей интерфейса.
export const DEFAULT_RENDER_OPTIONS = Object.freeze({
  W: 1000,
  bgChoice: 'white',
  strokeW: 1.5,
  edgeMode: 'baked',
  angleDeg: 20,
  wantSilhouette: true,
  wantEdges: true,
  doStitch: true,
  stitchEps: 1.2,
  simplifyTol: 0.5,
  cornerAngle: 25,
  minLen: 0,
  occlPct: 1,
  clipStepPx: 3,
});

const toBool = (v, fallback) => (v == null ? fallback : Boolean(v));

function toKeySet(value, name) {
  if (value == null) return new Set();
  if (typeof value === 'string' || typeof value[Symbol.iterator] !== 'function') {
    throw new OutlineError('BAD_OPTION', `${name}: ожидается список ключей рёбер`);
  }
  return new Set(value);
}

/**
 * Приводит параметры рендера к полному и проверенному виду.
 * Значения, уже лежащие в допустимых границах, не меняются — поэтому повторная
 * нормализация (например, значений из полей плагина) ничего не сдвигает.
 * @param {Partial<import('./contracts.js').RenderOptions>} [input]
 * @returns {Readonly<import('./contracts.js').RenderOptions>}
 */
export function normalizeRenderOptions(input = {}) {
  const d = DEFAULT_RENDER_OPTIONS;
  const W = Math.round(clampNumber(input.W, 1, 8192, d.W));
  let aspect = Number(input.aspect);
  let H;
  if (input.H != null && String(input.H).trim() !== '') {
    H = Math.round(clampNumber(input.H, 1, 8192, W));
    if (!(Number.isFinite(aspect) && aspect > 0)) aspect = W / H;
  } else {
    if (!(Number.isFinite(aspect) && aspect > 0)) aspect = 1;
    H = Math.min(8192, Math.max(1, Math.round(W / aspect)));
  }

  const edgeMode = input.edgeMode ?? d.edgeMode;
  if (!EDGE_MODES.includes(edgeMode)) {
    throw new OutlineError('BAD_OPTION', `edgeMode: ожидается ${EDGE_MODES.join(' | ')}, получено «${edgeMode}»`);
  }
  const bgChoice = String(input.bgChoice ?? d.bgChoice);

  return Object.freeze({
    W, H, aspect, bgChoice,
    edgeColor: String(input.edgeColor ?? (bgChoice === 'black' ? 'white' : 'black')),
    strokeW: clampNumber(input.strokeW, 0.01, 100, d.strokeW),
    edgeMode,
    angleDeg: clampNumber(input.angleDeg, 1, 170, d.angleDeg),
    wantSilhouette: toBool(input.wantSilhouette, d.wantSilhouette),
    wantEdges: toBool(input.wantEdges, d.wantEdges),
    doStitch: toBool(input.doStitch, d.doStitch),
    stitchEps: clampNumber(input.stitchEps, 0.01, 1000, d.stitchEps),
    simplifyTol: clampNumber(input.simplifyTol, 0, 1000, d.simplifyTol),
    cornerAngle: clampNumber(input.cornerAngle, 0.1, 180, d.cornerAngle),
    minLen: clampNumber(input.minLen, 0, 1e9, d.minLen),
    occlPct: clampNumber(input.occlPct, 0, 100, d.occlPct),
    clipStepPx: clampNumber(input.clipStepPx, 0.25, 20, d.clipStepPx),
    // Копии наборов: правки выбора во время задания не меняют уже начатый рендер.
    forced: toKeySet(input.forced, 'forced'),
    removed: toKeySet(input.removed, 'removed'),
  });
}
