// Минимальный строковый построитель SVG. Повторяет то, как браузер сериализует
// элементы, созданные через createElementNS (outerHTML): атрибуты в порядке
// добавления, явные закрывающие теги, экранирование & " < > в атрибутах и
// & < > в тексте. Благодаря этому строки ядра совпадают с прежним DOM-выводом,
// но DOM больше не нужен.

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export const escapeAttr = v => String(v)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeText = v => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {Array<[string, unknown]>} attrs */
export function openTag(tag, attrs = []) {
  let s = '<' + tag;
  for (const [name, value] of attrs) s += ` ${name}="${escapeAttr(value)}"`;
  return s + '>';
}

export function element(tag, attrs = [], inner = '') {
  return `${openTag(tag, attrs)}${inner}</${tag}>`;
}
