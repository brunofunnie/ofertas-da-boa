export function sortOfferGroups(groups, order) {
  if (!order) return groups;
  const price = group => Math.min(...group.map(offer => offer.price));
  return [...groups].sort((a, b) => {
    if (order === 'price-asc') return price(a) - price(b);
    if (order === 'price-desc') return price(b) - price(a);
    const comparison = a[0].name.localeCompare(b[0].name, 'pt-BR', { sensitivity: 'base' });
    return order === 'name-desc' ? -comparison : comparison;
  });
}
