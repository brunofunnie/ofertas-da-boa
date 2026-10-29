const money = cents => (cents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

export function formatShoppingList(name, groups) {
  const lines = [name];
  let total = 0;
  for (const group of groups) {
    total += group.total;
    lines.push('', `${group.name} — ${money(group.total)}`);
    for (const item of group.items) {
      const quantity = item.quantity ?? 1;
      lines.push(`${item.checked ? '✓' : '•'} ${quantity}${item.price_unit === 'kg' ? ' kg' : ''} × ${item.name}${item.condition ? ` (${item.condition})` : ''} — ${money(item.price * quantity)}`);
    }
  }
  lines.push('', `Total: ${money(total)}`);
  return lines.join('\n');
}
