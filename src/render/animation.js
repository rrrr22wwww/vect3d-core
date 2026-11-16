import { renderOutlineFrame, assertModel } from './frame.js';
import { createAnimatedSvg } from '../svg/animated-svg.js';
import { XML_DECLARATION } from '../svg/markup.js';
import { normalizeRenderOptions } from '../options.js';
import { normalizeCameraKeys, evaluateCameraTrack, isLoopSeamless } from '../animation/track.js';
import { planAnimation, ANIMATION_LIMITS } from '../animation/plan.js';
import { poseDirection } from '../camera/pose.js';
import { OutlineError, throwIfAborted } from '../errors.js';

/**
 * Покадровый рендер анимации камеры в SMIL SVG.
 * Каждый момент честно проходит тот же outline-конвейер, что и статический кадр.
 *
 * @param {import('../contracts.js').OutlineModel} model
 * @param {{ keys: import('../contracts.js').CameraKey[], duration: number, fps: number, loop?: boolean }} animation
 * @param {Partial<import('../contracts.js').RenderOptions>} [options]
 * @param {import('../contracts.js').AnimationContext} [context]
 * @returns {Promise<import('../contracts.js').AnimationResult>}
 */
export async function renderAnimation(model, animation, options = {}, context = {}) {
  assertModel(model);
  const { occlusion, signal, onFrame, limits = ANIMATION_LIMITS, initialDirection = null } = context;
  const opts = normalizeRenderOptions(options);
  const keys = normalizeCameraKeys(animation?.keys ?? []);
  if (keys.length < 2) throw new OutlineError('NOT_ENOUGH_KEYS', 'нужно минимум 2 ключа');
  const duration = Number(animation.duration);
  const fps = Number(animation.fps);
  const loop = Boolean(animation.loop);
  const plan = planAnimation({ duration, fps, loop }, opts, limits);
  if (!plan.ok) throw plan.error;

  const groups = [];
  let direction = initialDirection;
  for (let i = 0; i < plan.frameCount; i++) {
    throwIfAborted(signal);
    const time = plan.times[i];
    const pose = evaluateCameraTrack(keys, time);
    const frame = await renderOutlineFrame(model, pose, opts,
      { occlusion, signal, fallbackDirection: direction }, { serialize: false });
    direction = poseDirection(pose) ?? direction;
    groups.push(frame.outlineGroup);
    if (onFrame) await onFrame({ index: i, count: plan.frameCount, time, pose, pathCount: frame.pathCount });
    throwIfAborted(signal);
  }
  throwIfAborted(signal);

  const previewSvg = createAnimatedSvg(groups, plan.times, opts, duration, loop);
  return {
    width: opts.W,
    height: opts.H,
    frameCount: plan.frameCount,
    times: plan.times,
    duration,
    loop,
    seamless: !loop || isLoopSeamless(keys, duration),
    previewSvg,
    svg: `${XML_DECLARATION}\n${previewSvg}`,
  };
}
