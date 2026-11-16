import * as THREE from 'three';
import { buildTopology } from '../geometry/topology.js';
import { OutlineError } from '../errors.js';
import { DEFAULT_FOV } from '../camera/pose.js';

// Целевой габарит нормализованной модели. Рёбра свариваются по мировой позиции
// с округлением до 1e-3, поэтому приводим модель к ~100 единиц — округление
// становится 1e-5 относительной точности при любом исходном масштабе.
export const NORMALIZED_SIZE = 100;

/**
 * Оборачивает готовый объект Three.js в модель ядра: досчитывает нормали,
 * нормализует масштаб и лениво строит топологию.
 *
 * @param {THREE.Object3D} root
 * @param {{ fileName?: string, normalize?: boolean, warnings?: Array<{code: string, message: string}> }} [options]
 * @returns {import('../contracts.js').OutlineModel}
 */
export function createOutlineModel(root, { fileName = '', normalize = true, warnings = [] } = {}) {
  if (!root || !root.isObject3D) {
    throw new OutlineError('BAD_MODEL', 'Модель должна быть объектом THREE.Object3D');
  }

  // OBJ без `vn` не несёт информации о сглаживании. Считаем нормали по граням,
  // чтобы модель хотя бы корректно отображалась; режим «Вшитые hard edges»
  // при этом честно сообщит, что данных о жёсткости в файле нет.
  root.traverse((n) => {
    if (n.isMesh && n.geometry && !n.geometry.attributes.normal) n.geometry.computeVertexNormals();
  });

  if (normalize) {
    root.updateMatrixWorld(true);
    const preBox  = new THREE.Box3().setFromObject(root);
    const preSize = preBox.getSize(new THREE.Vector3());
    const preMax  = Math.max(preSize.x, preSize.y, preSize.z) || 1;
    if (Number.isFinite(preMax) && preMax > 0) root.scale.multiplyScalar(NORMALIZED_SIZE / preMax);
  }
  root.updateMatrixWorld(true);

  let topology = null;   // кэш топологии (строится при первом рендере)

  return {
    root,
    fileName,
    warnings: [...warnings],

    /** Топология, если уже построена, иначе null. */
    get topology() { return topology; },

    /** Строит топологию при первом обращении и возвращает кэш. */
    ensureTopology() {
      if (!topology) {
        root.updateMatrixWorld(true);
        topology = buildTopology(root);
      }
      return topology;
    },

    /** Сбросить кэш, если оболочка изменила геометрию или трансформации. */
    invalidateTopology() { topology = null; },

    /** Габариты модели в текущих мировых координатах. */
    getBounds() {
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      return {
        min: box.min.toArray(), max: box.max.toArray(),
        center: center.toArray(), size: size.toArray(),
        maxDim: Math.max(size.x, size.y, size.z) || 1,
        radius: sphere.radius,
      };
    },

    /** Ракурс, который плагин ставит сразу после загрузки модели. */
    defaultCameraPose({ fov = DEFAULT_FOV } = {}) {
      const { center, maxDim } = this.getBounds();
      return {
        position: [center[0] + maxDim * 1.4, center[1] + maxDim * 0.7, center[2] + maxDim * 1.4],
        target: [...center],
        fov,
      };
    },

    /** Освобождает геометрию и материалы. */
    dispose() {
      root.traverse((n) => {
        n.geometry?.dispose?.();
        const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
        mats.forEach(m => m.dispose?.());
      });
      topology = null;
    },
  };
}

/** Краткая сводка модели и её топологии — удобно для CLI и диагностики. */
export function describeModel(model) {
  const topo = model.ensureTopology();
  let meshes = 0;
  model.root.traverse(n => { if (n.isMesh) meshes++; });
  return {
    fileName: model.fileName,
    meshes,
    faces: topo.faceCount,
    edges: topo.edges.length,
    manifoldEdges: topo.manifoldCount,
    bakedHardEdges: topo.bakedHardCount,
    materials: topo.materialCount,
    hasNormals: topo.hasNormals,
    bounds: model.getBounds(),
    defaultCamera: model.defaultCameraPose(),
    warnings: model.warnings,
  };
}
