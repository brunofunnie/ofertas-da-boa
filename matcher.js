const packaging = new Set(['pacote','pct','embalagem','pote','frasco','garrafa','sache','bandeja','unidade','unidades','peca','de','do','da','com','em','e']);

export function productKey(name) {
  let text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  text = text.replace(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/g, (_, count, amount, unit) => `${count} un ${amount} ${unit}`);
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|unidades|unidade|un)\b/g, (_, raw, unit) => {
    const amount = Number(raw.replace(',', '.'));
    if (unit === 'kg') return ` ${amount * 1000}g `;
    if (unit === 'l') return ` ${amount * 1000}ml `;
    if (['unidade','unidades','un'].includes(unit)) return ` ${amount}un `;
    return ` ${amount}${unit} `;
  });
  const tokens = (text.match(/\d+(?:\.\d+)?(?:g|ml|un)\b|[a-z]+|\d+/g) || []).filter(t => !packaging.has(t));
  const quantities = tokens.filter(t => /^\d+(?:\.\d+)?(?:g|ml|un)$/.test(t));
  const names = tokens.filter(t => !quantities.includes(t));
  // shortcut: only explicit quantities and identical meaningful words match; use verified catalog identifiers for broader matching.
  if (!quantities.length || names.length < 2) return null;
  return [...names.sort(), ...quantities.sort()].join(' ');
}
