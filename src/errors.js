// Ошибка ядра со стабильным машинным кодом. Текст сообщения — для человека
// (на русском, как в плагине), а `code` позволяет любой оболочке показать свой
// текст или перевести его.
export class OutlineError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'OutlineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const ERROR_CODES = Object.freeze({
  BAD_MODEL: 'BAD_MODEL',
  BAD_INPUT: 'BAD_INPUT',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  BAD_OPTION: 'BAD_OPTION',
  BAD_CAMERA: 'BAD_CAMERA',
  EMPTY_MODEL: 'EMPTY_MODEL',
  GLTF_INVALID_JSON: 'GLTF_INVALID_JSON',
  GLTF_EXTERNAL_BUFFER: 'GLTF_EXTERNAL_BUFFER',
  NOT_ENOUGH_KEYS: 'NOT_ENOUGH_KEYS',
  TOO_MANY_FRAMES: 'TOO_MANY_FRAMES',
  TOO_HEAVY: 'TOO_HEAVY',
});

// Отмена задания: тот же вид ошибки, что у AbortController во всех средах.
export function abortError(message = 'Рендер остановлен') {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal) {
  if (!signal || !signal.aborted) return;
  throw signal.reason ?? abortError();
}
