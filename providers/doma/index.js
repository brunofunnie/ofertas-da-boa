import { fetchConfiguredInstagramOffers } from '../instagram/index.js';

export const id = 'doma';
export const name = 'Doma Supermercado';
export const url = 'https://www.instagram.com/domasupermercado/';
export async function fetchOffers(_fetchPage, instagram = fetchConfiguredInstagramOffers) {
  const offers = await instagram('domasupermercado', {posts:7, stories:true});
  if (offers === null) throw Error('Configure os cookies do Instagram.');
  return offers;
}
