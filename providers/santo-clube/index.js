import { fetchConfiguredInstagramOffers } from '../instagram/index.js';

export const id = 'santo-clube';
export const name = 'Santo Supermercados';
export const url = 'https://santoclube.crescevendas.com/ecommerce';
export const sourceDefinitions = [{id:'site',name:'Site'}, {id:'instagram',name:'Instagram'}];
const api = 'https://www.crescevendas.com/ecommerce/graphql';
const fields = 'id name salePrice liquidPrice stock continuousStockProduct weighable discounts { type promotion limit }';
const homeQuery = `query { home { carousels { name type products { ${fields} imageUrl } } categories { name products { ${fields} imageUrl } } } }`;
const carouselQuery = `query($type:CarouselProductEnum!,$after:String) { carouselProducts(type:$type,after:$after) { pageInfo { endCursor hasNextPage } edges { node { ... on ProductHash { ${fields} images { imageUrl position } } } } } }`;
const categories = [['Carnes',/carnes|churrasco/i],['Hortifruti',/feira|hortifr/i],['Limpeza',/limpeza/i],['Higiene',/higiene/i],['Bebidas',/bebidas|adega/i],['Frios e laticínios',/frios|latic|leites|iogurtes/i],['Padaria',/padaria/i],['Mercearia',/mercearia|alimentos básicos/i]];
const cents = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
function promotionPrice(text) {
  const match = typeof text === 'string' && text.match(/R\$\s*(\d[\d.]*)\s*,\s*(\d{2})/i);
  return match ? Number(match[1].replaceAll('.','')) * 100 + Number(match[2]) : null;
}
export function parseProduct(product, category) {
  if (!product || !/^\d+$/.test(String(product.id || '')) || typeof product.name !== 'string' || !product.name.trim()) return null;
  if (product.continuousStockProduct === false && typeof product.stock === 'number' && product.stock <= 0) return null;
  const regular = cents(product.salePrice), final = cents(product.liquidPrice);
  if (!regular) return null;
  const discounts = Array.isArray(product.discounts) ? product.discounts : [];
  const discount = discounts.find(d => d.type === 'Aplicativo' && promotionPrice(d.promotion) === final) || discounts.find(d => d.type === 'Loja' && promotionPrice(d.promotion) === final);
  const price = final && final < regular && discount ? final : regular;
  const condition = price < regular && discount?.type === 'Aplicativo' ? 'Aplicativo' : '';
  let image = product.imageUrl || product.images?.find(i => i.imageUrl)?.imageUrl || '';
  try { const parsed = new URL(image); if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.crescevendas.com') image = ''; } catch { image = ''; }
  return { name:product.name.trim(), price, regular_price:price < regular ? regular : null, condition, price_unit:product.weighable ? 'kg' : 'un', image_url:image, url:`${url}/produto/${product.id}`, ...(category ? {category} : {}) };
}
async function request(query, variables = {}) {
  const response = await fetch(api, { method:'POST', headers:{'Content-Type':'application/json','app-version':'web','Origin':'https://santoclube.crescevendas.com','Referer':`${url}/`}, body:JSON.stringify({query,variables}), signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Santo Clube: HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw Error('Santo Clube: resposta inválida do catálogo.');
  return result.data;
}
async function fetchCatalog(query) {
  const data = await query(homeQuery, {});
  if (!data.home || !Array.isArray(data.home.categories) || !Array.isArray(data.home.carousels)) throw Error('Santo Clube: catálogo indisponível.');
  const products = new Map();
  const add = (raw, category) => { const offer = parseProduct(raw, category); if (offer) { const old = products.get(raw.id); products.set(raw.id, old ? {...old, ...offer, category:old.category || offer.category} : offer); } };
  for (const section of data.home.categories) {
    const category = categories.find(([,pattern]) => pattern.test(section.name))?.[0];
    for (const p of section.products || []) add(p, category);
  }
  for (const section of data.home.carousels) for (const p of section.products || []) add(p);
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const connection = (await query(carouselQuery, {type:'top_store',after:cursor})).carouselProducts;
    if (!connection?.pageInfo || !Array.isArray(connection.edges)) throw Error('Santo Clube: página de ofertas inválida.');
    for (const edge of connection.edges) add(edge.node);
    if (!connection.pageInfo.hasNextPage) {
      const counts = new Map();
      for (const offer of products.values()) counts.set(offer.name, (counts.get(offer.name) || 0) + 1);
      const catalog = [...products.values()].filter(offer => counts.get(offer.name) === 1);
      return catalog;
    }
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === cursor) throw Error('Santo Clube: paginação inválida.');
    cursor = connection.pageInfo.endCursor;
  }
  throw Error('Santo Clube: limite de páginas atingido.');
}

async function fetchBoth(query, instagram, report = () => {}) {
  const tasks = [() => fetchCatalog(query), () => instagram('santosupermercados')];
  const results = await Promise.allSettled(tasks.map(async (task, i) => {
    const id = sourceDefinitions[i].id;
    try {
      const offers = await task();
      report(offers === null ? {id,state:'unconfigured',status:'Não configurado'} : offers.length ? {id,state:'ok',status:`${offers.length} produtos encontrados`,total:offers.length} : {id,state:'warning',status:'Nenhuma oferta encontrada',total:0});
      return offers || [];
    } catch (error) { report({id,state:error.warning ? 'warning' : 'error',status:error.message || 'Fonte indisponível'}); throw error; }
  }));
  const warnings = results.flatMap((result, i) => result.status === 'rejected' ? [`${i ? 'Instagram' : 'Site'}: ${result.reason?.message || 'fonte indisponível'}`] : []);
  const offers = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!offers.length && warnings.length) throw Error(warnings.join('; '));
  if (warnings.length) Object.defineProperty(offers, 'warnings', {value:warnings});
  return offers;
}
export async function fetchOffers(_fetchPage, query = request, instagram = fetchConfiguredInstagramOffers) { return fetchBoth(query, instagram); }
export async function fetchWithStatus(_fetchPage, report) { return fetchBoth(request, fetchConfiguredInstagramOffers, report); }
