export function groupStorePrices(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const key = `${offer.store}:${offer.price_unit || 'un'}`;
    if (!groups.has(key)) groups.set(key, {store:offer.store, unit:offer.price_unit, prices:[]});
    const group = groups.get(key);
    const add = (price, label, priceType) => {
      if (!Number.isSafeInteger(price) || price <= 0) return;
      const candidate = {price, label, priceType, offer};
      const index = group.prices.findIndex(item => item.price === price);
      if (index < 0) group.prices.push(candidate);
      else if ((!label && group.prices[index].label) || (group.prices[index].label === label && (offer.updated > group.prices[index].offer.updated || (offer.updated === group.prices[index].offer.updated && offer.id > group.prices[index].offer.id)))) group.prices[index] = candidate;
    };
    add(offer.price, offer.condition || '', 'regular');
    add(offer.club_price, 'Clube', 'club');
  }
  return [...groups.values()];
}
