import { productKey } from '../matcher.js';

export function matchImage(name, products) {
  const key = productKey(name);
  if (!key || !Array.isArray(products)) return null;
  for (const product of products) {
    if (!product.product_name || !product.brands || !product.quantity || !/^\d{8,14}$/.test(String(product.code || ''))) continue;
    const keyTokens = key.split(' ');
    const brandTokens = product.brands.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];
    const quantityKey = productKey(`produto marca ${product.quantity}`);
    const amounts = quantityKey?.split(' ').filter(token => /^\d+(?:\.\d+)?(?:g|ml|un)$/.test(token)) || [];
    if (!brandTokens.length || !brandTokens.every(token => keyTokens.includes(token)) || !amounts.length || amounts.some(token => !keyTokens.includes(token))) continue;
    const names = [product.product_name, `${product.product_name} ${product.quantity}`, `${product.product_name} ${product.brands}`, `${product.product_name} ${product.brands} ${product.quantity}`];
    if (!names.some(candidate => productKey(candidate) === key)) continue;
    try {
      const image = new URL(product.image_front_url);
      if (image.protocol !== 'https:' || image.hostname !== 'images.openfoodfacts.org') continue;
      return { image_url: image.href, source_url: `https://world.openfoodfacts.org/product/${product.code}` };
    } catch { continue; }
  }
  return null;
}

export async function searchImage(name, fetcher = fetch) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  const searchTerms = name.replace(/\b(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|unidades|unidade|un)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  url.search = new URLSearchParams({ search_terms: searchTerms, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: 'code,product_name,brands,quantity,image_front_url' });
  const response = await fetcher(url, { headers: { 'User-Agent': process.env.OFF_USER_AGENT || 'OfertasDaBoa/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Open Food Facts HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.products)) throw Error('Resposta inválida do Open Food Facts');
  return matchImage(name, data.products);
}

export async function processNextImage(db, search = searchImage, isStopped = () => false) {
  const item = db.db.prepare(`SELECT o.product_key,o.name FROM offers o
    WHERE o.product_key IS NOT NULL
    AND (o.valid_until IS NULL OR o.valid_until >= date('now','-3 hours'))
    AND NOT EXISTS (SELECT 1 FROM offers i WHERE i.product_key=o.product_key AND i.image_url IS NOT NULL AND i.image_url != '')
    AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_key=o.product_key)
    AND NOT EXISTS (SELECT 1 FROM image_search_attempts a WHERE a.product_key=o.product_key AND a.retry_after > datetime('now'))
    ORDER BY o.id LIMIT 1`).get();
  if (!item) return false;
  try {
    const result = await search(item.name);
    if (isStopped()) return false;
    if (result) {
      db.db.prepare('INSERT OR IGNORE INTO product_images(product_key,image_url,source_url) VALUES(?,?,?)').run(item.product_key, result.image_url, result.source_url);
      db.db.prepare('UPDATE products SET image_url=?,image_source=? WHERE product_key=? AND image_url IS NULL').run(result.image_url, result.source_url, item.product_key);
    }
    db.db.prepare("INSERT OR REPLACE INTO image_search_attempts(product_key,retry_after,outcome) VALUES(?,datetime('now','+7 days'),'miss')").run(item.product_key);
  } catch (error) {
    if (isStopped()) return false;
    db.db.prepare("INSERT OR REPLACE INTO image_search_attempts(product_key,retry_after,outcome) VALUES(?,datetime('now','+1 hour'),'error')").run(item.product_key);
    throw error;
  }
  return true;
}

export function startImageSearch(db) {
  let active = false, stopped = false, timer;
  async function tick() {
    if (stopped || active) return;
    active = true;
    try { await processNextImage(db, searchImage, () => stopped); } catch (error) { console.warn(`Busca de imagem: ${error.message}`); }
    finally { active = false; if (!stopped) { timer = setTimeout(tick, 12000); timer.unref(); } }
  }
  timer = setTimeout(tick, 1000); timer.unref();
  return () => { stopped = true; clearTimeout(timer); };
}
