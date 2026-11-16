import { clampNumber } from '../util/numbers.js';
import { EASE_PRESETS, evaluateCubicEase } from './easing.js';
import { clonePose } from '../camera/pose.js';
import { OutlineError } from '../errors.js';

// Чистые функции трека камеры: ключи передаются аргументом, состояние
// (выбранный ключ, playhead, playback) остаётся у оболочки.

/** Сортировка ключей по времени (на месте), при равенстве — по id. */
function sortCameraKeys(keys) {
  return keys.sort((a, b) => a.time - b.time || a.id - b.id);
}

/**
 * Ракурс в момент `time`. Easing ключа действует от него к следующему.
 * Возвращает null для пустого трека.
 * @param {import('../contracts.js').CameraKey[]} keys отсортированные по времени
 */
function evaluateCameraTrack(keys, time) {
  if (!keys.length) return null;
  if (time <= keys[0].time) return clonePose(keys[0].pose);
  if (time >= keys[keys.length - 1].time) return clonePose(keys[keys.length - 1].pose);

  let i = 0;
  while (i + 1 < keys.length && time > keys[i + 1].time) i++;
  const a = keys[i], b = keys[i + 1];
  const raw = (time - a.time) / Math.max(1e-9, b.time - a.time);
  const q = evaluateCubicEase(raw, a.ease);
  const mix3 = (p, r) => p.map((v, j) => v + (r[j] - v) * q);
  return {
    position: mix3(a.pose.position, b.pose.position),
    target: mix3(a.pose.target, b.pose.target),
    fov: a.pose.fov + (b.pose.fov - a.pose.fov) * q,
  };
}

/** true, если конец трека совпадает с началом (бесшовный loop). */
function isLoopSeamless(keys, duration) {
  if (keys.length < 2) return true;
  const first = evaluateCameraTrack(keys, 0);
  const last = evaluateCameraTrack(keys, duration);
  const delta = Math.hypot(
    ...first.position.map((v, i) => v - last.position[i]),
    ...first.target.map((v, i) => v - last.target[i]),
    first.fov - last.fov
  );
  return delta < 1e-4;
}

/** Привязка времени к сетке кадров FPS внутри [0, duration]. */
function snapTrackTime(time, { duration, fps }, fallback = 0) {
  const t = clampNumber(time, 0, duration, fallback);
  return Math.min(duration, Math.round(t * fps) / fps);
}

/**
 * Проверяет ключи из внешнего источника (JSON, другая оболочка) и
 * возвращает отсортированные копии. Easing можно задать пресетом:
 * { preset: 'ease-in-out' } — значения подставятся из EASE_PRESETS.
 */
function normalizeCameraKeys(keys) {
  if (!Array.isArray(keys)) throw new OutlineError('BAD_INPUT', 'Ключи камеры: ожидается массив');
  const out = keys.map((key, index) => {
    const time = Number(key?.time);
    if (!Number.isFinite(time) || time < 0) {
      throw new OutlineError('BAD_INPUT', `Ключ ${index}: время должно быть неотрицательным числом`);
    }
    const pose = key.pose;
    if (!pose || !Array.isArray(pose.position) || !Array.isArray(pose.target)) {
      throw new OutlineError('BAD_INPUT', `Ключ ${index}: нужен pose { position, target, fov }`);
    }
    const preset = key.ease?.preset ?? 'ease-in-out';
    const values = Array.isArray(key.ease?.values) ? key.ease.values.map(Number)
      : EASE_PRESETS[preset] ? [...EASE_PRESETS[preset]] : null;
    if (!values || values.length !== 4 || !values.every(Number.isFinite)) {
      throw new OutlineError('BAD_INPUT', `Ключ ${index}: easing — пресет (${Object.keys(EASE_PRESETS).join(', ')}) или values [x1, y1, x2, y2]`);
    }
    return {
      id: Number.isFinite(key.id) ? key.id : index + 1,
      time,
      pose: { position: pose.position.map(Number), target: pose.target.map(Number), fov: Number(pose.fov ?? 50) },
      ease: { preset: EASE_PRESETS[preset] || preset === 'custom' ? preset : 'custom', values },
    };
  });
  return sortCameraKeys(out);
}

export { sortCameraKeys, evaluateCameraTrack, isLoopSeamless, snapTrackTime, normalizeCameraKeys };
