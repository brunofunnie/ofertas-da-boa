const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const collator = new Intl.Collator('pt-BR', {sensitivity:'base', numeric:true});

export function filterReviewOffers(offers, stores, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return offers.filter(offer => {
    const text = normalize(`${offer.name} ${stores[offer.store]?.[0] || offer.store}`);
    return terms.every(term => text.includes(term));
  });
}
export function sortReviewOffers(offers, stores, column, direction) {
  const value = offer => column === 'store' ? (stores[offer.store]?.[0] || offer.store) : offer[column];
  const factor = direction === 'desc' ? -1 : 1;
  return [...offers].sort((a,b) => {
    const left=value(a), right=value(b);
    if (left == null || left === '') return right == null || right === '' ? 0 : 1;
    if (right == null || right === '') return -1;
    return (column === 'price' ? left-right : collator.compare(String(left),String(right))) * factor;
  });
}
