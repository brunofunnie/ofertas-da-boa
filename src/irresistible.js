export function isIrresistible(offer, threshold) {
  const price = offer.price;
  if (!Number.isSafeInteger(price) || price <= 0) return false;
  const reference = Number.isSafeInteger(offer.regular_price) && offer.regular_price > price ? offer.regular_price : price;
  const best = Number.isSafeInteger(offer.club_price) && offer.club_price > 0 && offer.club_price < price ? offer.club_price : price;
  return best < reference && (reference - best) * 100 >= reference * threshold;
}
