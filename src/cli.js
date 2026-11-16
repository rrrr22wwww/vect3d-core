// CLI outline-core (только Node): ядро как самостоятельная программа.
// Любая оболочка (скрипт, сервер, плагин другого редактора, программа на
// другом языке) может вызвать его процессом: флагами или JSON-заданием через
// stdin/stdout. Окклюзия — программный z-buffer, GPU не нужен.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  loadModel, renderFrame, renderAnimation, describeModel, OutlineError, EDGE_MODES,
} from './index.js';

const HELP = `outline-core — 3D-модель (GLB / GLTF / OBJ) → векторный SVG-outline

Использование:
  outline-core render <модель> [-o out.svg] [параметры]   статический кадр
  outline-core info   <модель>                            топология, габариты, ракурс по умолчанию (JSON)
  outline-core job    <job.json | ->                      JSON-задание (кадр или анимация), ответ — JSON
  outline-core help

Камера (координаты нормализованной модели, габарит ~100):
  --view iso|front|back|left|right|top|bottom   готовый ракурс (по умолчанию iso, как в плагине)
  --position x,y,z  --target x,y,z  --fov <°>   точный ракурс

Рёбра:
  --edges baked|material|normals   источник рёбер (по умолчанию baked)
  --angle <°>                      порог излома (20)
  --no-silhouette  --no-edges      отключить силуэт / рёбра
  --add-edge <ключ>  --remove-edge <ключ>   ручная правка (можно повторять)

Векторизация и вывод:
  -s, --size <px>        ширина SVG (1000);   --height <px> высота (= ширине)
  --occlusion <%>        удаление скрытых линий, bias в % радиуса (1); 0 — выкл.
  --clip-step <px>       шаг проверки видимости (3)
  --no-stitch  --stitch <px>        сшивка сегментов (1.2)
  --tolerance <px>       точность кривых Безье (0.5); 0 — полилинии
  --corners <°>          порог острых углов (25)
  --min-length <px>      отбросить короткие обрывки (0)
  --stroke <px>          толщина линии (1.5)
  --background white|black|transparent|<цвет>   фон (white)
  --color <цвет>         цвет линий (по фону: чёрный / белый)
  -o, --output <файл>    записать SVG в файл (иначе — в stdout)
  --json                 вывести JSON с метаданными и SVG вместо голого SVG
  --progress             печатать стадии в stderr

Код выхода: 0 — успех, 1 — ошибка (в режиме job/--json ошибка тоже приходит JSON).`;

const vec3 = (value, name) => {
  if (value == null) return undefined;
  const parts = String(value).split(',').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) {
    throw new OutlineError('BAD_INPUT', `${name}: ожидается «x,y,z», получено «${value}»`);
  }
  return parts;
};
const num = (value) => (value == null ? undefined : Number(value));

async function readModel(file, baseDir = process.cwd()) {
  const fullPath = path.resolve(baseDir, file);
  let data;
  try { data = await readFile(fullPath); }
  catch (err) {
    if (err.code === 'ENOENT') throw new OutlineError('FILE_NOT_FOUND', `Файл не найден: ${fullPath}`);
    throw err;
  }
  return loadModel(data, { fileName: path.basename(fullPath) });
}

/** Готовые ракурсы относительно габарита модели. */
export function viewPose(model, view = 'iso', fov = 50) {
  const { center: c, maxDim } = model.getBounds();
  if (view === 'iso') return model.defaultCameraPose({ fov });
  const d = Math.hypot(1.4, 0.7, 1.4) * maxDim;
  const offsets = {
    front: [0, 0, d], back: [0, 0, -d], right: [d, 0, 0], left: [-d, 0, 0],
    top: [0, d, d * 1e-3], bottom: [0, -d, d * 1e-3],
  };
  const o = offsets[view];
  if (!o) throw new OutlineError('BAD_INPUT', `--view: ожидается iso|${Object.keys(offsets).join('|')}`);
  return { position: c.map((v, i) => v + o[i]), target: [...c], fov };
}

function optionsFromFlags(v) {
  return {
    W: num(v.size),
    H: num(v.height) ?? num(v.size),
    edgeMode: v.edges,
    angleDeg: num(v.angle),
    wantSilhouette: v['no-silhouette'] ? false : undefined,
    wantEdges: v['no-edges'] ? false : undefined,
    doStitch: v['no-stitch'] ? false : undefined,
    stitchEps: num(v.stitch),
    simplifyTol: num(v.tolerance),
    cornerAngle: num(v.corners),
    minLen: num(v['min-length']),
    occlPct: num(v.occlusion),
    clipStepPx: num(v['clip-step']),
    strokeW: num(v.stroke),
    bgChoice: v.background,
    edgeColor: v.color,
    forced: v['add-edge'] ?? [],
    removed: v['remove-edge'] ?? [],
  };
}

const frameSummary = r => ({
  type: 'frame', width: r.width, height: r.height, pathCount: r.pathCount,
  warnings: r.warnings, camera: r.camera.pose,
});

const progressReporter = enabled => enabled
  ? (progress, label) => { process.stderr.write(`[${String(progress).padStart(3)}%] ${label}\n`); }
  : undefined;

async function commandRender(argv) {
  const { values: v, positionals } = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      output: { type: 'string', short: 'o' }, size: { type: 'string', short: 's' }, height: { type: 'string' },
      view: { type: 'string' }, position: { type: 'string' }, target: { type: 'string' }, fov: { type: 'string' },
      edges: { type: 'string' }, angle: { type: 'string' },
      'no-silhouette': { type: 'boolean' }, 'no-edges': { type: 'boolean' }, 'no-stitch': { type: 'boolean' },
      stitch: { type: 'string' }, tolerance: { type: 'string' }, corners: { type: 'string' }, 'min-length': { type: 'string' },
      occlusion: { type: 'string' }, 'clip-step': { type: 'string' }, stroke: { type: 'string' },
      background: { type: 'string' }, color: { type: 'string' },
      'add-edge': { type: 'string', multiple: true }, 'remove-edge': { type: 'string', multiple: true },
      json: { type: 'boolean' }, progress: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) throw new OutlineError('BAD_INPUT', 'render: укажите один файл модели');
  if (v.edges && !EDGE_MODES.includes(v.edges)) throw new OutlineError('BAD_INPUT', `--edges: ожидается ${EDGE_MODES.join('|')}`);
  const model = await readModel(positionals[0]);
  const fov = num(v.fov) ?? 50;
  const base = viewPose(model, v.view ?? 'iso', fov);
  const pose = { position: vec3(v.position, '--position') ?? base.position, target: vec3(v.target, '--target') ?? base.target, fov };
  const result = await renderFrame(model, pose, optionsFromFlags(v), { onStage: progressReporter(v.progress) });
  if (v.output) await writeFile(v.output, result.svg);
  if (v.json) {
    process.stdout.write(JSON.stringify({ ok: true, ...frameSummary(result), ...(v.output ? { output: v.output } : { svg: result.svg }) }) + '\n');
  } else if (!v.output) {
    process.stdout.write(result.svg + '\n');
  }
  for (const w of result.warnings) process.stderr.write(`внимание: ${w.message}\n`);
  if (v.output && !v.json) process.stderr.write(`${v.output}: ${result.width}×${result.height}, путей: ${result.pathCount}\n`);
}

async function commandInfo(argv) {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {} });
  if (positionals.length !== 1) throw new OutlineError('BAD_INPUT', 'info: укажите один файл модели');
  const model = await readModel(positionals[0]);
  process.stdout.write(JSON.stringify(describeModel(model), null, 2) + '\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * JSON-задание:
 * {
 *   "model": "path/model.glb" | { "base64": "...", "fileName": "model.glb" },
 *   "camera": { "position": [x,y,z], "target": [x,y,z], "fov": 50 } | { "view": "front" },
 *   "options": { "W": 1000, "edgeMode": "baked", ... },          // RenderOptions
 *   "animation": { "keys": [...], "duration": 3, "fps": 12, "loop": true },   // необязательно
 *   "output": "out.svg"                                          // необязательно
 * }
 */
export async function runJob(job, baseDir = process.cwd()) {
  if (!job || typeof job !== 'object') throw new OutlineError('BAD_INPUT', 'Задание должно быть JSON-объектом');
  let model;
  if (typeof job.model === 'string') model = await readModel(job.model, baseDir);
  else if (job.model && typeof job.model.base64 === 'string') {
    model = await loadModel(Buffer.from(job.model.base64, 'base64'), { fileName: job.model.fileName ?? '', format: job.model.format });
  } else throw new OutlineError('BAD_INPUT', 'model: путь к файлу или { base64, fileName }');

  const options = job.options ?? {};
  let response;
  let svg;
  if (job.animation) {
    const result = await renderAnimation(model, job.animation, options);
    svg = result.svg;
    response = {
      type: 'animation', width: result.width, height: result.height, frameCount: result.frameCount,
      duration: result.duration, loop: result.loop, seamless: result.seamless,
    };
  } else {
    const camera = job.camera ?? {};
    const pose = Array.isArray(camera.position)
      ? { position: camera.position, target: camera.target ?? model.getBounds().center, fov: camera.fov ?? 50 }
      : viewPose(model, camera.view ?? 'iso', camera.fov ?? 50);
    const result = await renderFrame(model, pose, options);
    svg = result.svg;
    response = frameSummary(result);
  }
  if (job.output) {
    const output = path.resolve(baseDir, job.output);
    await writeFile(output, svg);
    return { ok: true, ...response, output };
  }
  return { ok: true, ...response, svg };
}

async function commandJob(argv) {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {} });
  const source = positionals[0] ?? '-';
  const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');
  let job;
  try { job = JSON.parse(text); } catch { throw new OutlineError('BAD_INPUT', 'Задание: некорректный JSON'); }
  const baseDir = source === '-' ? process.cwd() : path.dirname(path.resolve(source));
  process.stdout.write(JSON.stringify(await runJob(job, baseDir)) + '\n');
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const wantsJson = command === 'job' || rest.includes('--json');
  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(HELP + '\n');
    } else if (command === 'render') await commandRender(rest);
    else if (command === 'info') await commandInfo(rest);
    else if (command === 'job') await commandJob(rest);
    else throw new OutlineError('BAD_INPUT', `Неизвестная команда «${command}». См. outline-core help`);
  } catch (err) {
    const error = { code: err.code ?? (err.name === 'TypeError' ? 'BAD_INPUT' : 'ERROR'), message: err.message };
    if (wantsJson) process.stdout.write(JSON.stringify({ ok: false, error }) + '\n');
    else process.stderr.write(`Ошибка: ${err.message}\n`);
    process.exitCode = 1;
  }
}
