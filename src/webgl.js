// outline-core/webgl — удаление скрытых линий на GPU для оболочек с WebGL
// (браузер, Electron, Figma-плагин). Подключается отдельно, чтобы основная
// точка входа ядра не требовала WebGL.
export { createWebGLOcclusion, buildDepthSampler } from './occlusion/webgl.js';
