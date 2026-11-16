import * as THREE from 'three';
import { OutlineError } from '../errors.js';

export const DEFAULT_FOV = 50;

/** @param {import('../contracts.js').CameraPose} pose */
export function clonePose(pose) {
  return { position: [...pose.position], target: [...pose.target], fov: pose.fov };
}

/**
 * Ракурс из любой камеры Three.js и точки цели (например, OrbitControls.target).
 * @returns {import('../contracts.js').CameraPose}
 */
export function poseFromCamera(camera, target) {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    fov: camera.fov,
  };
}

/**
 * Строит отдельную камеру кадра по ракурсу. Камера вьюпорта оболочки не
 * затрагивается — ядро вообще о ней не знает.
 *
 * Правила те же, что у applyCameraPose в плагине: FOV ограничивается 1…170°,
 * а если позиция совпала с целью, камера отступает на 1e-3 против прежнего
 * направления взгляда (`fallbackDirection`).
 */
export function cameraFromPose(pose, { aspect = 1, near = 0.01, far = 100000, fallbackDirection = null } = {}) {
  if (!pose || !Array.isArray(pose.position) || !Array.isArray(pose.target)
      || pose.position.length !== 3 || pose.target.length !== 3) {
    throw new OutlineError('BAD_CAMERA', 'Камера: ожидаются position [x,y,z], target [x,y,z] и fov');
  }
  let [px, py, pz] = pose.position.map(Number);
  const [tx, ty, tz] = pose.target.map(Number);
  const fov = Number(pose.fov ?? DEFAULT_FOV);
  if (![px, py, pz, tx, ty, tz, fov].every(Number.isFinite)) {
    throw new OutlineError('BAD_CAMERA', 'Заполните все координаты камеры числами');
  }
  if (Math.hypot(px - tx, py - ty, pz - tz) < 1e-6) {
    const dir = fallbackDirection
      ? new THREE.Vector3().fromArray(Array.isArray(fallbackDirection) ? fallbackDirection : [fallbackDirection.x, fallbackDirection.y, fallbackDirection.z])
      : new THREE.Vector3(0, 0, -1);
    px = tx - dir.x * 1e-3;
    py = ty - dir.y * 1e-3;
    pz = tz - dir.z * 1e-3;
  }
  const camera = new THREE.PerspectiveCamera(Math.min(170, Math.max(1, fov)), aspect, near, far);
  camera.position.set(px, py, pz);
  camera.updateProjectionMatrix();
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Направление взгляда ракурса или null, если позиция совпала с целью. */
export function poseDirection(pose) {
  const d = pose.target.map((v, i) => Number(v) - Number(pose.position[i]));
  const len = Math.hypot(...d);
  return len >= 1e-6 ? d.map(v => v / len) : null;
}
