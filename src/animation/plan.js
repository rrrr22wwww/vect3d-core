import { OutlineError } from '../errors.js';

// Один экспорт ограничен числом кадров и бюджетом pixel-frames (W·H·кадры):
// каждый кадр — полный проход outline-конвейера.
export const ANIMATION_LIMITS = Object.freeze({ maxFrames: 120, maxPixelFrames: 240000000 });

/**
 * Раскладка покадрового рендера. Ничего не рендерит — только считает кадры,
 * их время и проверяет ограничения.
 *
 * @param {{ duration: number, fps: number, loop?: boolean }} settings
 * @param {{ W: number, H: number }} size
 * @returns {{ ok: true, frameCount: number, times: number[], pixelWork: number }
 *         | { ok: false, frameCount: number, error: OutlineError }}
 */
export function planAnimation({ duration, fps, loop = false }, { W, H }, limits = ANIMATION_LIMITS) {
  if (!(Number.isFinite(duration) && duration > 0) || !(Number.isFinite(fps) && fps > 0)) {
    return { ok: false, frameCount: 0, error: new OutlineError('BAD_INPUT', 'Длительность и FPS должны быть положительными числами') };
  }
  const frameCount = loop ? Math.max(2, Math.ceil(duration * fps)) : Math.max(2, Math.ceil(duration * fps) + 1);
  const pixelWork = W * H * frameCount;
  if (frameCount > limits.maxFrames) {
    return {
      ok: false, frameCount,
      error: new OutlineError('TOO_MANY_FRAMES', `Слишком много кадров: ${frameCount}. Снизьте FPS или длительность (максимум ${limits.maxFrames})`),
    };
  }
  if (!Number.isSafeInteger(pixelWork) || pixelWork > limits.maxPixelFrames) {
    return {
      ok: false, frameCount,
      error: new OutlineError('TOO_HEAVY', 'Слишком тяжёлый рендер. Уменьшите «Размер», FPS или длительность'),
    };
  }
  const times = [];
  for (let i = 0; i < frameCount; i++) {
    times.push(loop ? duration * i / frameCount : duration * i / (frameCount - 1));
  }
  return { ok: true, frameCount, times, pixelWork };
}
