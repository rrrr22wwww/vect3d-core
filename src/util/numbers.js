// Числовые помощники ядра. Копия поведения app/numbers.js плагина: ядро не
// импортирует ничего из UI, поэтому держит собственную реализацию.

const clampNumber = (v, lo, hi, fallback) => {
  if (v == null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const displayNumber = n => String(Number(Number(n).toFixed(4)));

export { clampNumber, displayNumber };
