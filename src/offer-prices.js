export function groupEqualPrices(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const unit = offer.price_unit || 'un', condition = (offer.condition || '').trim();
    const key = JSON.stringify([offer.price, unit, condition.toLocaleLowerCase('pt-BR')]);
    if (!groups.has(key)) groups.set(key, {key, price:offer.price, unit, condition, offers:[]});
    const group = groups.get(key), index = group.offers.findIndex(item => item.store === offer.store);
    if (index < 0) group.offers.push(offer);
    else if (offer.updated > group.offers[index].updated || (offer.updated === group.offers[index].updated && offer.id > group.offers[index].id)) group.offers[index] = offer;
  }
  return [...groups.values()];
}
