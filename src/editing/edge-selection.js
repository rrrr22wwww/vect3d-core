// ─── Ручной выбор рёбер ────────────────────────────────────────────────────
// Состояние без UI: какие рёбра принудительно рисовать, какие исключить, и
// история для Undo. Рёбра задаются ключом топологии (округлённые мировые
// позиции концов), поэтому выбор переживает пересборку топологии.
//
// Добавленное ребро рисуется всегда и целиком; исключённое — никогда;
// исключение приоритетнее добавления (это правило применяет
// extractOutlineSegments).

/**
 * @param {{ historyLimit?: number, onChange?: (event: object) => void }} [options]
 */
export function createEdgeSelection({ historyLimit = 200, onChange } = {}) {
  const added   = new Set();   // принудительно рисовать
  const removed = new Set();   // никогда не рисовать
  let history = [];

  const notify = event => { if (onChange) onChange(event); };

  /** Переключает ребро в наборе 'add' или 'remove'. Возвращает true, если ребро стало выбранным. */
  function toggle(key, which) {
    if (which !== 'add' && which !== 'remove') throw new TypeError("toggle: ожидается 'add' или 'remove'");
    const set = which === 'add' ? added : removed;
    const other = which === 'add' ? removed : added;
    other.delete(key);                       // ребро не может быть и добавлено, и снято
    const isAdded = !set.has(key);
    if (isAdded) set.add(key); else set.delete(key);
    history.push({ set: which, key, added: isAdded });
    if (history.length > historyLimit) history.shift();
    notify({ type: 'toggle', key, which, added: isAdded });
    return isAdded;
  }

  /** Отменяет последнее переключение. Возвращает запись истории или null. */
  function undo() {
    const h = history.pop();
    if (!h) return null;
    const set = h.set === 'add' ? added : removed;
    if (h.added) set.delete(h.key); else set.add(h.key);
    notify({ type: 'undo', entry: h });
    return h;
  }

  /** Сбрасывает выбор и историю (например, при загрузке новой модели). */
  function reset() {
    added.clear(); removed.clear(); history = [];
    notify({ type: 'reset' });
  }

  /** Копии наборов для render options: { forced, removed }. */
  function snapshot() {
    return { forced: new Set(added), removed: new Set(removed) };
  }

  return {
    added,
    removed,
    get history() { return history; },
    set history(value) { history = Array.isArray(value) ? value : []; },
    toggle,
    undo,
    reset,
    snapshot,
  };
}
