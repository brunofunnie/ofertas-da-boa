import * as cheerio from 'cheerio';

export const id = 'tauste';
export const name = 'Tauste';
export const url = 'https://tauste.com.br/sorocaba2';
const parsePrice = value => { const m = String(value).match(/(\d[\d.]*)\s*,\s*(\d{2})/); return m ? Number(m[1].replaceAll('.', '')) * 100 + Number(m[2]) : null; };
export function parseTauste(html) {
  const $ = cheerio.load(html);
  return $('.product-item-info').map((_, el) => {
    const item = $(el), link = item.find('.product-item-name .product-item-link').first().length ? item.find('.product-item-name .product-item-link').first() : item.find('.product-item-link').last();
    const final = item.find('.price-wrapper[data-price-type="finalPrice"]').first();
    const current = final.length ? final : item.find('.price-wrapper[data-price-amount]').last();
    const amount = current.attr('data-price-amount');
    const price = amount ? Math.round(Number(amount) * 100) : parsePrice(current.text() || item.find('.price').last().text());
    const oldAmount = item.find('.price-wrapper[data-price-type="oldPrice"]').first().attr('data-price-amount');
    const regularPrice = oldAmount ? Math.round(Number(oldAmount) * 100) : null;
    const club = item.find('img[src*="amlabel"]').toArray().some(img => /clube/i.test($(img).attr('src') || ''));
    const href = link.attr('href');
    const image = item.find('.product-image-photo').first();
    let imageUrl = '';
    const imageSrc = image.attr('data-src') || image.attr('src');
    try { if (imageSrc) { const candidate = new URL(imageSrc, url); if (candidate.protocol === 'https:' && candidate.hostname === 'tauste.com.br') imageUrl = candidate.href; } } catch {}
    return { name: link.text().replace(/\s+/g, ' ').trim(), price, url: href ? new URL(href, url).href : '', image_url: imageUrl, regular_price: regularPrice > price ? regularPrice : null, condition: club ? 'Clube' : '' };
  }).get().filter(item => item.name && item.url && Number.isSafeInteger(item.price) && item.price > 0);
}

export async function fetchOffers(fetchPage) { return parseTauste(await fetchPage(url)); }
