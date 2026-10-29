export function parsePriceBound(value) {
  const input = value.trim();
  if (!input) return null;
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(input);
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : undefined;
}
export function matchesPriceRange(offer, min, max) {
  return [offer.price, offer.club_price].some(price => Number.isSafeInteger(price) && price > 0 && (min === null || price >= min) && (max === null || price <= max));
}
