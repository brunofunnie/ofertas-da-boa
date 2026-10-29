export function groupListItems(items, stores) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.store)) groups.set(item.store, { id: item.store, name: stores[item.store]?.[0] || item.store, total: 0, items: [] });
    const group = groups.get(item.store);
    group.items.push(item);
    group.total += item.price * (item.quantity ?? 1);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
