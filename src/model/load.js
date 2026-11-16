import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OutlineError } from '../errors.js';
import { createOutlineModel } from './model.js';

export const MODEL_FORMATS = Object.freeze(['glb', 'gltf', 'obj']);

const hasDom = () => typeof document !== 'undefined' && typeof document.createElementNS === 'function';

/**
 * Формат по расширению, а без расширения — по содержимому.
 * Как и в плагине, любое неизвестное расширение читается GLTF-парсером
 * (он сам различает бинарный GLB и JSON).
 */
export function detectModelFormat(fileName, data) {
  const name = String(fileName || '');
  if (name.includes('.')) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'obj') return 'obj';
    if (ext === 'gltf') return 'gltf';
    return 'glb';
  }
  if (typeof data === 'string') return /^\s*\{/.test(data) ? 'gltf' : 'obj';
  const bytes = toBytes(data);
  if (bytes && bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) return 'glb';
  if (bytes) {
    const head = new TextDecoder().decode(bytes.subarray(0, 64));
    return /^\s*\{/.test(head) ? 'gltf' : 'obj';
  }
  return 'glb';
}

function toBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (typeof data === 'string') return new TextEncoder().encode(data).buffer;
  throw new OutlineError('BAD_INPUT', 'Модель: ожидается ArrayBuffer, Uint8Array, строка или File/Blob');
}

// .gltf может ссылаться на внешний .bin — без него геометрии просто нет, а
// подтянуть файл рядом ядро не может. Говорим об этом сразу и понятно.
export function checkGltfSelfContained(buf) {
  let json;
  try { json = JSON.parse(new TextDecoder().decode(buf)); }
  catch { throw new OutlineError('GLTF_INVALID_JSON', '.gltf повреждён или это не JSON'); }
  const external = (json.buffers || []).some(b => b.uri && !/^data:/i.test(b.uri));
  if (external) {
    throw new OutlineError('GLTF_EXTERNAL_BUFFER', '.gltf ссылается на внешний .bin — экспортируйте .glb (или .gltf Embedded)');
  }
}

// Разбор ТОЛЬКО из памяти, без blob:-URL и loadAsync: в Figma connect-src
// ограничен списком доменов, а parse() по ArrayBuffer в сеть не ходит вовсе.
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function parseWith(loader, buf) {
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}

// Встроенные буферы (`data:`-URI в .gltf Embedded) декодируются здесь же, без
// FileLoader/fetch: так разбор не зависит ни от сети, ни от CSP, ни от
// браузерных классов вроде ProgressEvent, которых нет в Node.
function decodeDataUri(uri) {
  const comma = uri.indexOf(',');
  const meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
}

function inlineDataBuffersPlugin(parser) {
  const loadBuffer = parser.loadBuffer.bind(parser);
  parser.loadBuffer = (bufferIndex) => {
    const def = parser.json.buffers && parser.json.buffers[bufferIndex];
    if (def && (!def.type || def.type === 'arraybuffer') && typeof def.uri === 'string' && /^data:/i.test(def.uri)) {
      return Promise.resolve(decodeDataUri(def.uri));
    }
    return loadBuffer(bufferIndex);
  };
  return { name: 'OUTLINE_core_data_buffers' };
}

// Текстуры для построения контура не нужны. Без DOM их и не загрузить, поэтому
// вне браузера все зависимости типа 'texture' сразу разрешаются в null —
// GLTFLoader в этом случае просто не назначает карту материалу.
function skipTexturesPlugin(parser) {
  const getDependency = parser.getDependency.bind(parser);
  parser.getDependency = (type, index) => (type === 'texture' ? Promise.resolve(null) : getDependency(type, index));
  return { name: 'OUTLINE_core_skip_textures' };
}

function createGLTFLoader({ manager, skipTextures = false } = {}) {
  const loader = new GLTFLoader(manager);
  loader.register(inlineDataBuffersPlugin);
  if (skipTextures) loader.register(skipTexturesPlugin);
  return loader;
}

async function parseGLTF(buf, textures, logger) {
  if (!textures) {
    return { gltf: await parseWith(createGLTFLoader({ skipTextures: true }), buf), warnings: [] };
  }
  try {
    return { gltf: await parseWith(createGLTFLoader(), buf), warnings: [] };
  } catch (err) {
    // Второй заход — с заглушкой картинок: их загрузка (blob:-URL внутри GLB)
    // ещё одна точка отказа под CSP. Геометрия читается из ArrayBuffer напрямую.
    logger?.warn?.('GLTF: первый разбор не удался, повтор без текстур —', err);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => /^blob:/i.test(url) ? BLANK_PNG : url);
    const gltf = await parseWith(createGLTFLoader({ manager }), buf);
    return {
      gltf,
      warnings: [{ code: 'TEXTURES_SKIPPED', message: 'Модель открыта без текстур (для контура они не нужны)' }],
    };
  }
}

/**
 * Загружает GLB / GLTF (embedded) / OBJ из памяти и возвращает модель ядра.
 *
 * @param {ArrayBuffer | ArrayBufferView | string | Blob} input
 * @param {{ fileName?: string, format?: 'glb'|'gltf'|'obj', textures?: boolean|'auto', normalize?: boolean, logger?: Console }} [options]
 *   textures: 'auto' — грузить текстуры, только если есть DOM (браузер); false — никогда.
 * @returns {Promise<import('../contracts.js').OutlineModel>}
 */
export async function loadModel(input, { fileName = '', format, textures = 'auto', normalize = true, logger = console } = {}) {
  if (input == null) throw new OutlineError('BAD_INPUT', 'Модель не передана');
  const isBlob = typeof input === 'object' && typeof input.arrayBuffer === 'function' && !ArrayBuffer.isView(input);
  if (isBlob && !fileName && typeof input.name === 'string') fileName = input.name;

  const fmt = format ?? detectModelFormat(fileName, isBlob ? undefined : input);
  if (!MODEL_FORMATS.includes(fmt)) {
    throw new OutlineError('BAD_INPUT', `Неизвестный формат модели «${fmt}». Поддерживаются: ${MODEL_FORMATS.join(', ')}`);
  }
  const useTextures = textures === 'auto' ? hasDom() : Boolean(textures);

  let root;
  let warnings = [];
  if (fmt === 'obj') {
    // OBJLoader отдаёт non-indexed геометрию: каждая грань со своими
    // вершинами. Топология всё равно сваривается по мировым позициям, а
    // расщеплённые нормали (smoothing groups) при этом сохраняются.
    const text = typeof input === 'string' ? input
      : isBlob ? await input.text()
      : new TextDecoder().decode(toArrayBuffer(input));
    root = new OBJLoader().parse(text);
  } else {
    const buf = isBlob ? await input.arrayBuffer() : toArrayBuffer(input);
    if (fmt === 'gltf') checkGltfSelfContained(buf);
    const parsed = await parseGLTF(buf, useTextures, logger);
    root = parsed.gltf.scene;
    warnings = parsed.warnings;
  }
  return createOutlineModel(root, { fileName, normalize, warnings });
}
