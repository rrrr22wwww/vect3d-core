import { dedupeSegments } from '../vector/segments.js';
import { stitchSegments } from '../vector/stitching.js';
import { pt, polylineLength, fmt } from '../vector/math2d.js';
import { bezierPathData } from '../vector/curves.js';
import { SVG_NS, XML_DECLARATION, openTag, element } from './markup.js';

// ═══════════════════════════════════════════════════════════════════════════
//  SVG BUILD & POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════
// Строит SVG напрямую из плоских сегментов: дедупликация (в т.ч. частично
// перекрывающихся коллинеарных дублей силуэт/hard-edge), сшивка в непрерывные
// цепочки и адаптивная аппроксимация Безье.
//
// Логика та же, что у прежнего buildSvgFromSegments; отличается только вывод:
// вместо DOM-элементов — данные путей и строки разметки.

/**
 * @returns {Array<{ type: 'path', d: string } | { type: 'polyline', points: string }>}
 */
function buildOutlinePaths(segs, opts) {
  const { doStitch, stitchEps, simplifyTol, minLen, cornerAngle = 25, cornerWindow = 4 } = opts;
  const unique = dedupeSegments(segs, Math.max(0.05, Math.min(0.5, stitchEps * 0.25)));
  const chains = doStitch
    ? stitchSegments(unique, stitchEps)
    : unique.map(sg => [pt(sg.x1, sg.y1), pt(sg.x2, sg.y2)]);

  const paths = [];
  for (const pts of chains) {
    if (pts.length < 2 || (minLen > 0 && polylineLength(pts) < minLen)) continue;
    if (simplifyTol > 0) {
      const d = bezierPathData(pts, simplifyTol, cornerAngle, cornerWindow);
      if (!d) continue;
      paths.push({ type: 'path', d });
    } else {
      paths.push({ type: 'polyline', points: pts.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(' ') });
    }
  }
  return paths;
}

/** Группа <g class="processed-outlines"> со всеми путями кадра. */
function outlineGroupMarkup(paths, { edgeColor, strokeW }) {
  let inner = '';
  for (const p of paths) {
    inner += element(p.type, [
      p.type === 'path' ? ['d', p.d] : ['points', p.points],
      ['fill', 'none'],
      ['stroke', edgeColor],
      ['stroke-width', `${strokeW}px`],
      ['stroke-linecap', 'round'],
      ['stroke-linejoin', 'round'],
    ]);
  }
  return element('g', [['class', 'processed-outlines']], inner);
}

function svgOpenTag(W, H, extra = []) {
  return openTag('svg', [
    ['xmlns', SVG_NS],
    ['width', String(W)],
    ['height', String(H)],
    ['viewBox', `0 0 ${W} ${H}`],
    ...extra,
  ]);
}

/**
 * Сегменты → SVG без фона (то, что раньше было DOM-элементом `processed`).
 * @returns {{ paths: ReturnType<typeof buildOutlinePaths>, group: string, markup: string }}
 */
function buildOutlineSvg(segs, opts) {
  const { W, H } = opts;
  const paths = buildOutlinePaths(segs, opts);
  const group = outlineGroupMarkup(paths, opts);
  return { paths, group, markup: `${svgOpenTag(W, H)}${group}</svg>` };
}

/** Добавляет фон и XML-декларацию: готовое содержимое .svg-файла. */
function serializeStaticSvg(markup, bgChoice) {
  const bgRect = bgChoice === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${bgChoice}"/>`;
  const exportStr = markup.replace(/(<svg[^>]*>)/, `$1${bgRect}`);
  return { exportStr, svgString: `${XML_DECLARATION}\n${exportStr}` };
}

export { buildOutlinePaths, outlineGroupMarkup, buildOutlineSvg, serializeStaticSvg, svgOpenTag };
