import { displayNumber } from '../util/numbers.js';
import { element, escapeText } from './markup.js';
import { svgOpenTag } from './outline-svg.js';

/**
 * Покадровый SMIL SVG: каждый кадр — своя группа, видимость переключается
 * дискретным <animate>. Морфинг `d` невозможен: число силуэтов и скрытых
 * отрезков между кадрами меняется.
 *
 * @param {string[]} frameGroups  разметка <g class="processed-outlines"> каждого кадра
 * @param {number[]} frameTimes   время кадров, с
 * @param {{ W: number, H: number, bgChoice: string }} options
 * @param {number} duration
 * @param {boolean} loop
 * @returns {string} разметка <svg> без XML-декларации
 */
function createAnimatedSvg(frameGroups, frameTimes, options, duration, loop) {
  let s = svgOpenTag(options.W, options.H, [['shape-rendering', 'geometricPrecision']]);
  s += `<title>${escapeText('Animated 3D outline camera')}</title>`;
  s += `<desc>${escapeText(`Discrete camera render: ${frameGroups.length} frames, ${duration} seconds`)}</desc>`;
  if (options.bgChoice !== 'transparent') {
    s += element('rect', [['width', '100%'], ['height', '100%'], ['fill', options.bgChoice]]);
  }

  const normalizedTimes = frameTimes.map(time => Math.min(1, Math.max(0, time / duration)));
  const keyTimes = loop ? [...normalizedTimes, 1] : normalizedTimes;
  frameGroups.forEach((outlines, frameIndex) => {
    const values = keyTimes.map((_, valueIndex) => {
      if (loop && valueIndex === keyTimes.length - 1) return frameIndex === 0 ? 'visible' : 'hidden';
      return valueIndex === frameIndex ? 'visible' : 'hidden';
    });
    const animate = element('animate', [
      ['attributeName', 'visibility'],
      ['calcMode', 'discrete'],
      ['begin', '0s'],
      ['dur', `${duration}s`],
      ['values', values.join(';')],
      ['keyTimes', keyTimes.map(displayNumber).join(';')],
      ['repeatCount', loop ? 'indefinite' : '1'],
      ['fill', 'freeze'],
    ]);
    s += element('g', [
      ['class', 'camera-frame'],
      ['data-time', displayNumber(frameTimes[frameIndex])],
      ['visibility', frameIndex === 0 ? 'visible' : 'hidden'],
    ], (outlines || '') + animate);
  });
  return s + '</svg>';
}

export { createAnimatedSvg };
