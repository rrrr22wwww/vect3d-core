# 3d2vec-core

Ядро для построения двумерной векторной проекции по трёхмерным пространственным данным. Цель, получить оптимизированные кривые, которые описывают входную геометрию с заданной точностью в кривых(сплайнах).


## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [CLI](#cli)
- [API](#api)
  - [Model](#model)
  - [Camera](#camera)
  - [Frame rendering](#frame-rendering)
  - [Render options](#render-options)
  - [Camera animation](#camera-animation)
  - [Hidden-line removal](#hidden-line-removal)
  - [Manual edge editing](#manual-edge-editing)
  - [Pipeline stages](#pipeline-stages)
  - [Errors](#errors)
- [Development](#development)
- [License](#license)

## Installation

```sh
bun add outline-core three
```

| Требование | Версия | Назначение |
| --- | --- | --- |
| [Bun](https://bun.sh) | — | рекомендуемая среда для запуска и CLI |
| [three](https://www.npmjs.com/package/three) | ^0.160.0 | peer-зависимость: геометрия, загрузчики GLTF и OBJ |

## Quick start

```js
import { readFile, writeFile } from 'node:fs/promises';
import { loadModel, renderFrame } from 'outline-core';

const buffer = await readFile('chair.glb');
const model = await loadModel(buffer, { fileName: 'chair.glb' });

const pose = model.defaultCameraPose();
const result = await renderFrame(model, pose, { W: 1200, H: 900 });

await writeFile('chair.svg', result.svg); // готовый SVG-файл
```

То же самое из командной строки:

```sh
outline-core render chair.glb -o chair.svg --size 1200
```

## CLI

```sh
outline-core render model.glb -o out.svg --size 1200 --view front   # модель → SVG
outline-core info model.glb                                         # сведения о модели
outline-core job job.json                                           # JSON-задание из файла
outline-core job - < job.json                                       # ...или из stdin
outline-core help                                                   # справка
```

Команда `job` принимает JSON-задание и возвращает JSON, поэтому ядро можно вызывать из программ на любом языке:

```json
{
  "model": "chair.glb",
  "camera": { "position": [140, 70, 140], "target": [0, 0, 0], "fov": 50 },
  "options": { "W": 1200, "bgChoice": "transparent" },
  "output": "chair.svg"
}
```

## API

### Model

#### `loadModel(input, options?)` → `Promise<OutlineModel>`

Загружает модель из `ArrayBuffer`, `Uint8Array`, `Buffer`, строки или `File`/`Blob`.

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `fileName` | — | имя файла, по расширению определяется формат |
| `format` | — | `'glb'`, `'gltf'` или `'obj'`, если имени нет |
| `textures` | `'auto'` | `'auto'` — грузить только при наличии DOM; `true` / `false` |
| `normalize` | `true` | привести модель к габариту ~100 единиц |

#### `createOutlineModel(object3D, options?)`

Создаёт модель из готового объекта three.js.

#### `OutlineModel`

| Поле / метод | Описание |
| --- | --- |
| `root` | объект three.js |
| `fileName`, `warnings` | имя файла и предупреждения загрузки |
| `topology` | топология или `null`, если ещё не построена |
| `ensureTopology()` | построить топологию (кэшируется) |
| `invalidateTopology()` | сбросить кэш после изменения геометрии |
| `getBounds()` | `{ min, max, center, size, maxDim, radius }` |
| `defaultCameraPose({ fov? })` | ракурс по умолчанию |
| `dispose()` | освободить геометрию и материалы |

#### `describeModel(model)`

Сводка по модели: число граней, рёбер, материалов, габариты.

### Camera

Ракурс задаётся объектом. Координаты указываются в пространстве нормализованной модели.

```js
{ position: [140, 70, 140], target: [0, 0, 0], fov: 50 }
```

| Функция | Описание |
| --- | --- |
| `cameraFromPose(pose, { aspect, near, far })` | камера three.js по ракурсу |
| `poseFromCamera(camera, target)` | ракурс из камеры three.js |

### Frame rendering

#### `renderFrame(model, pose, options?, context?)` → `Promise<FrameResult>`

`options` — [параметры рендера](#render-options).

`context`:

| Поле | Описание |
| --- | --- |
| `occlusion` | способ [удаления скрытых линий](#hidden-line-removal) (по умолчанию программный) |
| `onStage(progress, label, stage)` | вызывается перед каждой стадией; может вернуть Promise |
| `signal` | `AbortSignal` для отмены |

`FrameResult`:

| Поле | Описание |
| --- | --- |
| `svg` | SVG-файл с XML-декларацией и фоном |
| `previewSvg` | SVG без фона и декларации, для показа на странице |
| `paths` | пути: `{ type: 'path', d }` или `{ type: 'polyline', points }` |
| `pathCount`, `segmentCount` | число путей и исходных сегментов |
| `warnings` | предупреждения о данных модели |
| `width`, `height`, `camera` | размер и параметры камеры кадра |

### Render options

`normalizeRenderOptions(options)` возвращает полный набор параметров с проверкой значений, `DEFAULT_RENDER_OPTIONS` — значения по умолчанию.

**Size and appearance**

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `W`, `H` | 1000, `W / aspect` | размер SVG в пикселях |
| `aspect` | `W / H` | соотношение сторон камеры |
| `bgChoice` | `'white'` | `'white'`, `'black'`, `'transparent'` или любой цвет |
| `edgeColor` | по фону | цвет линий |
| `strokeW` | 1.5 | толщина линии |

**Line selection**

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `wantSilhouette` | `true` | рисовать силуэт |
| `wantEdges` | `true` | рисовать рёбра |
| `edgeMode` | `'baked'` | `'baked'`, `'material'` или `'normals'` |
| `angleDeg` | 20 | порог излома для `material` и `normals`, градусы |
| `forced` | — | ключи рёбер, которые нужно нарисовать всегда |
| `removed` | — | ключи рёбер, которые нужно убрать |

**Hidden lines**

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `occlPct` | 1 | допуск окклюзии в % радиуса модели; `0` — без удаления скрытых линий |
| `clipStepPx` | 3 | шаг проверки видимости вдоль ребра, px |

**Path assembly**

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `doStitch` | `true` | сшивать сегменты в линии |
| `stitchEps` | 1.2 | допуск сшивки, px |
| `simplifyTol` | 0.5 | точность кривых Безье, px; `0` — полилинии |
| `cornerAngle` | 25 | порог острого угла, градусы |
| `minLen` | 0 | отбрасывать линии короче, px |

### Camera animation

#### `renderAnimation(model, animation, options?, context?)` → `Promise<AnimationResult>`

```js
const result = await renderAnimation(model, {
  keys: [
    { time: 0, pose: poseA, ease: { preset: 'ease-in-out' } },
    { time: 3, pose: poseB },
  ],
  duration: 3,
  fps: 12,
  loop: true,
}, { W: 800 });
```

- `context`: `occlusion`, `signal`, `onFrame({ index, count, time, pose })`
- `AnimationResult`: `svg`, `previewSvg`, `frameCount`, `times`, `seamless`

> **Ограничения:** до 120 кадров и до 240 млн пиксель-кадров (`W × H × кадры`).

Вспомогательные функции:

| Функция | Описание |
| --- | --- |
| `planAnimation({ duration, fps, loop }, { W, H })` | число кадров и проверка лимитов без рендера |
| `evaluateCameraTrack(keys, time)` | ракурс в заданный момент времени |
| `isLoopSeamless(keys, duration)` | замыкается ли петля без шва |
| `sortCameraKeys(keys)` | ключи, упорядоченные по времени |
| `snapTrackTime(time, { duration, fps })` | время, привязанное к сетке кадров |
| `EASE_PRESETS`, `evaluateCubicEase(t, ease)` | пресеты и расчёт кривой плавности |

### Hidden-line removal

| Способ | Импорт | Описание |
| --- | --- | --- |
| `createCpuOcclusion()` | `outline-core` | программный буфер глубины, работает везде (по умолчанию) |
| `createWebGLOcclusion({ renderer, scene, exclude })` | `outline-core/webgl` | расчёт на видеокарте через существующий `WebGLRenderer` |

```js
import { createWebGLOcclusion } from 'outline-core/webgl';

const occlusion = createWebGLOcclusion({ renderer, scene, exclude: () => helpers });
await renderFrame(model, pose, options, { occlusion });
```

Можно передать свой объект с методом `createSampler({ model, camera, width, height, bias })`, который возвращает функцию `(point) => boolean`.

### Manual edge editing

```js
const selection = createEdgeSelection();
selection.toggle(edgeKey, 'add');      // или 'remove'
selection.undo();
selection.reset();

await renderFrame(model, pose, { ...options, ...selection.snapshot() });
```

Для выбора ребра курсором:

| Функция | Описание |
| --- | --- |
| `projectEdgesForPicking(topology, camera, width, height)` | экранная проекция рёбер |
| `pickEdge(topology, cache, x, y, radius?)` | ключ ближайшего ребра или `null` |

### Pipeline stages

Этапы конвейера доступны по отдельности, в порядке выполнения:

| Функция | Что делает |
| --- | --- |
| `buildTopology` | строит топологию модели |
| `extractOutlineSegments` | находит сегменты силуэта и рёбер |
| `clipEdgeToSegments` | оставляет видимые части ребра |
| `dedupeSegments` | убирает повторяющиеся сегменты |
| `stitchSegments` | сшивает сегменты в линии |
| `bezierPathData` | превращает линию в кривые Безье |
| `buildOutlinePaths` | собирает пути кадра |
| `buildOutlineSvg` | собирает SVG кадра |
| `serializeStaticSvg` | записывает SVG одного кадра |
| `createAnimatedSvg` | собирает кадры в SVG-анимацию |

### Errors

Ошибки имеют тип `OutlineError` и поле `code`. Отмена через `signal` завершается ошибкой с `name === 'AbortError'`.

| Код | Когда |
| --- | --- |
| `BAD_INPUT` | неверные входные данные |
| `BAD_OPTION` | неверный параметр рендера |
| `BAD_CAMERA` | неверный ракурс |
| `BAD_MODEL` | передан не объект модели |
| `EMPTY_MODEL` | у модели нет геометрии |
| `FILE_NOT_FOUND` | файл не найден (CLI) |
| `GLTF_INVALID_JSON` | повреждённый `.gltf` |
| `GLTF_EXTERNAL_BUFFER` | `.gltf` ссылается на внешний `.bin` |
| `NOT_ENOUGH_KEYS` | в анимации меньше двух ключей |
| `TOO_MANY_FRAMES`, `TOO_HEAVY` | превышены лимиты анимации |

## License

MIT
