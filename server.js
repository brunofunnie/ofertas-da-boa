import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { productKey } from './matcher.js';
import { startImageSearch } from './image-search/index.js';
import { providers } from './providers/index.js';
import { cookiesPath, normalizeCookies } from './providers/instagram/index.js';
import {publicConfig, saveConfig, modelConfig, listModels} from './ai/index.js';
export { parseTauste } from './providers/tauste/index.js';

export const STORES = Object.fromEntries(providers.map(provider => [provider.id, [provider.name, provider.url]]));
const categories = { Carnes: /carne|frango|bovina|suína|suino|coxa|asa |tilápia|tilapia|linguiça/i, Hortifruti: /mamão|mamao|melão|melao|abóbora|abobora|banana|tomate|fruta|legume|verdura/i, Limpeza: /detergente|sabão|sabao|amaciante|desinfetante|limpeza|sanitária/i, Higiene: /sabonete|shampoo|dental|fralda|desodorante/i, Bebidas: /vinho|cerveja|refrigerante|suco|água mineral/i, 'Frios e laticínios': /leite|queijo|iogurte|manteiga|requeijão/i, Padaria: /pão|pao|bolo|panettone/i };
export const categorize = name => Object.entries(categories).find(([, pattern]) => pattern.test(name))?.[0] || 'Mercearia';
export function parsePrice(value) { const m = String(value).match(/(\d[\d.]*)\s*,\s*(\d{2})/); return m ? Number(m[1].replaceAll('.', '')) * 100 + Number(m[2]) : null; }
const words = text => (text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || []);
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length];
}
export class Database {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS offers(id INTEGER PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, previous_price INTEGER, url TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(store,name));
      CREATE TABLE IF NOT EXISTS lists(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items(list_id INTEGER NOT NULL, offer_id INTEGER NOT NULL, checked INTEGER DEFAULT 0, PRIMARY KEY(list_id,offer_id), FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE, FOREIGN KEY(offer_id) REFERENCES offers(id));
      CREATE TABLE IF NOT EXISTS sources(store TEXT PRIMARY KEY, status TEXT, updated TEXT);
      CREATE TABLE IF NOT EXISTS store_source_status(store TEXT NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL, status TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, last_success TEXT, total INTEGER, PRIMARY KEY(store,source));
      CREATE TABLE IF NOT EXISTS offer_terms(offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE, term TEXT NOT NULL, PRIMARY KEY(offer_id,term));
      CREATE INDEX IF NOT EXISTS offer_terms_term ON offer_terms(term, offer_id);`);
    const sourceColumns = new Set(this.db.prepare('PRAGMA table_info(sources)').all().map(c => c.name));
    for (const [column, type] of [['state','TEXT'],['last_success','TEXT'],['total','INTEGER'],['new_count','INTEGER'],['changed_count','INTEGER']]) {
      if (!sourceColumns.has(column)) this.db.exec(`ALTER TABLE sources ADD COLUMN ${column} ${type}`);
    }
    if (!sourceColumns.has('state')) this.db.exec("UPDATE sources SET state = CASE WHEN status LIKE 'Não atualizado:%' THEN 'error' WHEN status LIKE '%produtos atualizados' THEN 'ok' ELSE NULL END, last_success = CASE WHEN status LIKE '%produtos atualizados' THEN updated ELSE NULL END");
    const itemColumns = new Set(this.db.prepare('PRAGMA table_info(items)').all().map(c => c.name));
    if (!itemColumns.has('quantity')) this.db.exec('ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1');
    const columns = new Set(this.db.prepare('PRAGMA table_info(offers)').all().map(c => c.name));
    if (!columns.has('price_unit')) this.db.exec("ALTER TABLE offers ADD COLUMN price_unit TEXT NOT NULL DEFAULT 'un'");
    if (!columns.has('image_url')) this.db.exec('ALTER TABLE offers ADD COLUMN image_url TEXT');
    if (!columns.has('product_key')) this.db.exec('ALTER TABLE offers ADD COLUMN product_key TEXT');
    this.db.exec("CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY, product_key TEXT NOT NULL, store TEXT NOT NULL, condition TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS price_history_product ON price_history(product_key,store,condition,id)");
    this.db.exec('CREATE TABLE IF NOT EXISTS product_images(product_key TEXT PRIMARY KEY, image_url TEXT NOT NULL, source_url TEXT NOT NULL); CREATE TABLE IF NOT EXISTS image_search_attempts(product_key TEXT PRIMARY KEY, retry_after TEXT NOT NULL)');
    const attemptColumns = new Set(this.db.prepare('PRAGMA table_info(image_search_attempts)').all().map(c => c.name));
    if (!attemptColumns.has('outcome')) {
      this.db.exec("ALTER TABLE image_search_attempts ADD COLUMN outcome TEXT; UPDATE image_search_attempts SET outcome=CASE WHEN retry_after > datetime('now','+1 hour') THEN 'miss' ELSE 'error' END");
    }
    if (!columns.has('regular_price')) this.db.exec('ALTER TABLE offers ADD COLUMN regular_price INTEGER');
    if (!columns.has('extracted')) this.db.exec('ALTER TABLE offers ADD COLUMN extracted INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('valid_until')) this.db.exec('ALTER TABLE offers ADD COLUMN valid_until TEXT');
    if (!columns.has('club_price')) this.db.exec('ALTER TABLE offers ADD COLUMN club_price INTEGER');
    if (!columns.has('condition')) this.db.exec("ALTER TABLE offers ADD COLUMN condition TEXT NOT NULL DEFAULT ''");
    this.db.exec('CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, product_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, image_url TEXT, image_source TEXT)');
    if (!columns.has('product_id')) this.db.exec('ALTER TABLE offers ADD COLUMN product_id INTEGER REFERENCES products(id)');
    const historyColumns = new Set(this.db.prepare('PRAGMA table_info(price_history)').all().map(c => c.name));
    if (!historyColumns.has('product_id')) this.db.exec('ALTER TABLE price_history ADD COLUMN product_id INTEGER REFERENCES products(id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS offers_product_id ON offers(product_id); CREATE INDEX IF NOT EXISTS price_history_product_id ON price_history(product_id,store,condition,id)');
    const all = this.db.prepare('SELECT * FROM offers').all();
    const setKey = this.db.prepare('UPDATE offers SET product_key=?, product_id=? WHERE id=?');
    const addProduct = this.db.prepare('INSERT OR IGNORE INTO products(product_key,name,category) VALUES(?,?,?)');
    const getProduct = this.db.prepare('SELECT id FROM products WHERE product_key=?');
    this.db.exec('BEGIN');
    try {
      for (const offer of all) {
        if (!offer.product_key) offer.product_key = productKey(offer.name) || `offer:${offer.id}`;
        addProduct.run(offer.product_key, offer.name, offer.category);
        offer.product_id = getProduct.get(offer.product_key).id;
        setKey.run(offer.product_key, offer.product_id, offer.id);
        this.indexOffer(offer);
        const exists = this.db.prepare('SELECT 1 FROM price_history WHERE product_key=? AND store=? AND condition=? LIMIT 1').get(offer.product_key, offer.store, offer.condition || '');
        if (!exists) this.db.prepare('INSERT INTO price_history(product_key,product_id,store,condition,price,observed_at) VALUES(?,?,?,?,?,?)').run(offer.product_key, offer.product_id, offer.store, offer.condition || '', offer.price, offer.updated);
      }
      this.db.exec(`UPDATE price_history SET product_id=(SELECT id FROM products WHERE products.product_key=price_history.product_key) WHERE product_id IS NULL;
        UPDATE products SET image_url=COALESCE((SELECT image_url FROM offers WHERE offers.product_id=products.id AND image_url IS NOT NULL AND image_url != '' ORDER BY updated DESC,id DESC LIMIT 1),(SELECT image_url FROM product_images WHERE product_images.product_key=products.product_key)), image_source=CASE WHEN EXISTS(SELECT 1 FROM offers WHERE offers.product_id=products.id AND image_url IS NOT NULL AND image_url != '') THEN NULL ELSE (SELECT source_url FROM product_images WHERE product_images.product_key=products.product_key) END WHERE image_url IS NULL`);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveOffers(store, offers) {
    const q = this.db.prepare(`INSERT INTO offers(store,name,category,price,url,regular_price,condition,club_price,valid_until,extracted,image_url,price_unit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(store,name) DO UPDATE SET previous_price=CASE WHEN offers.price != excluded.price THEN offers.price ELSE offers.previous_price END, price=excluded.price,category=excluded.category,url=excluded.url,regular_price=excluded.regular_price,condition=excluded.condition,club_price=excluded.club_price,valid_until=excluded.valid_until,extracted=excluded.extracted,image_url=COALESCE(NULLIF(excluded.image_url,''),offers.image_url),price_unit=excluded.price_unit,updated=CURRENT_TIMESTAMP`);
    const unique = [...new Map(offers.map(o => [o.name, o])).values()];
    const stats = {total:unique.length, new_count:0, changed_count:0};
    this.db.exec('BEGIN');
    try {
      for (const o of unique) {
        const old = this.db.prepare('SELECT * FROM offers WHERE store=? AND name=?').get(store, o.name);
        if (!old) stats.new_count++;
        else if (old.price !== o.price || old.category !== (o.category || categorize(o.name)) || old.url !== (o.url || '') || old.regular_price !== (o.regular_price || null) || old.condition !== (o.condition || '') || old.club_price !== (o.club_price || null) || old.valid_until !== (o.valid_until || null) || old.price_unit !== (o.price_unit === 'kg' ? 'kg' : 'un') || (o.image_url && old.image_url !== o.image_url)) stats.changed_count++;
        q.run(store, o.name, o.category || categorize(o.name), o.price, o.url || '', o.regular_price || null, o.condition || '', o.club_price || null, o.valid_until || null, o.extracted ? 1 : 0, o.image_url || null, o.price_unit === 'kg' ? 'kg' : 'un');
        const offer = this.db.prepare('SELECT * FROM offers WHERE store=? AND name=?').get(store, o.name);
        const key = productKey(o.name) || `offer:${offer.id}`;
        this.db.prepare('INSERT OR IGNORE INTO products(product_key,name,category) VALUES(?,?,?)').run(key, o.name, o.category || categorize(o.name));
        const productId = this.db.prepare('SELECT id FROM products WHERE product_key=?').get(key).id;
        this.db.prepare('UPDATE offers SET product_key=?,product_id=? WHERE id=?').run(key, productId, offer.id);
        if (o.image_url) this.db.prepare('UPDATE products SET image_url=?,image_source=NULL WHERE id=?').run(o.image_url, productId);
        this.db.prepare("DELETE FROM image_search_attempts WHERE product_key=? AND outcome='miss'").run(key);
        this.indexOffer(offer);
        const previous = this.db.prepare('SELECT price FROM price_history WHERE product_key=? AND store=? AND condition=? ORDER BY id DESC LIMIT 1').get(key, store, o.condition || '');
        if (!previous || previous.price !== o.price) this.db.prepare('INSERT INTO price_history(product_key,product_id,store,condition,price) VALUES(?,?,?,?,?)').run(key, productId, store, o.condition || '', o.price);
      }
      this.db.exec('COMMIT');
      return stats;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  productImages() {
    const images = new Map();
    for (const row of this.db.prepare("SELECT product_key,image_url,image_source FROM products WHERE image_url IS NOT NULL AND image_url != ''").all()) images.set(row.product_key, {image_url:row.image_url,image_source:row.image_source});
    return images;
  }
  offers() {
    const images = this.productImages();
    const history = this.db.prepare('SELECT price,observed_at FROM (SELECT id,price,observed_at FROM price_history WHERE product_key=? AND store=? AND condition=? ORDER BY id DESC LIMIT 20) ORDER BY id');
    return this.db.prepare("SELECT * FROM offers WHERE valid_until IS NULL OR valid_until >= date('now', '-3 hours') ORDER BY updated DESC, name").all().map(o => ({ ...o, ...(images.get(o.product_key) || { image_url: null, image_source: null }), history: history.all(o.product_key, o.store, o.condition || '') }));
  }
  indexOffer(offer) {
    this.db.prepare('DELETE FROM offer_terms WHERE offer_id=?').run(offer.id);
    const insert = this.db.prepare('INSERT OR IGNORE INTO offer_terms(offer_id,term) VALUES(?,?)');
    for (const term of new Set(words(`${offer.name} ${offer.category}`))) insert.run(offer.id, term);
  }
  search(query) {
    const tokens = [...new Set(words(query.slice(0, 100)))].slice(0, 10);
    if (!tokens.length) return this.offers();
    const terms = this.db.prepare('SELECT DISTINCT term FROM offer_terms').all().map(row => row.term);
    const lookup = this.db.prepare('SELECT offer_id FROM offer_terms WHERE term=?');
    let scores;
    for (const token of tokens) {
      const matches = new Map();
      for (const term of terms) {
        const score = term === token ? 0 : term.startsWith(token) ? 1 : token.length >= 4 && Math.abs(term.length - token.length) <= 1 && distance(token, term) <= 1 ? 2 : Infinity;
        if (!Number.isFinite(score)) continue;
        for (const row of lookup.all(term)) matches.set(row.offer_id, Math.min(matches.get(row.offer_id) ?? Infinity, score));
      }
      scores = scores ? new Map([...scores].filter(([id]) => matches.has(id)).map(([id, score]) => [id, score + matches.get(id)])) : matches;
    }
    return this.offers().filter(offer => scores.has(offer.id)).sort((a, b) => scores.get(a.id) - scores.get(b.id));
  }
  createList(name) { return Number(this.db.prepare('INSERT INTO lists(name) VALUES(?)').run(name).lastInsertRowid); }
  addItem(list, offer) { this.db.prepare('INSERT OR IGNORE INTO items(list_id,offer_id) VALUES(?,?)').run(list, offer); }
  lists() { const images = this.productImages(); return this.db.prepare('SELECT * FROM lists ORDER BY id DESC').all().map(l => ({ ...l, items: this.db.prepare('SELECT offers.*,items.checked,items.quantity FROM items JOIN offers ON offers.id=items.offer_id WHERE list_id=? ORDER BY checked,name').all(l.id).map(item => ({ ...item, ...(images.get(item.product_key) || { image_url: null, image_source: null }) })) })); }
  status(store, result) {
    this.db.prepare(`INSERT INTO sources(store,status,updated,state,last_success,total,new_count,changed_count) VALUES(?,?,CURRENT_TIMESTAMP,?,CASE WHEN ?='ok' THEN CURRENT_TIMESTAMP ELSE NULL END,?,?,?)
      ON CONFLICT(store) DO UPDATE SET status=excluded.status,updated=excluded.updated,state=excluded.state,last_success=COALESCE(excluded.last_success,sources.last_success),total=COALESCE(excluded.total,sources.total),new_count=COALESCE(excluded.new_count,sources.new_count),changed_count=COALESCE(excluded.changed_count,sources.changed_count)`)
      .run(store,result.status,result.state,result.state,result.total ?? null,result.new_count ?? null,result.changed_count ?? null);
    return this.db.prepare('SELECT * FROM sources WHERE store=?').get(store);
  }
  close() { this.db.close(); }
}
async function fetchPage(url) { const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 OfertasDaBoa/1.0' }, signal: AbortSignal.timeout(20000) }); if (!res.ok) throw Error(`HTTP ${res.status}`); return res.text(); }

export function createApp(db, storeProviders = providers, options = {}) {
  const inFlight = new Map();
  const inFlightSources = new Map();
  const refreshOne = provider => {
    if (inFlight.has(provider.id)) return inFlight.get(provider.id);
    if (provider.sourceDefinitions) inFlightSources.set(provider.id, new Set(provider.sourceDefinitions.map(source => source.id)));
    const work = (async () => {
      try {
        const report = result => {
          db.db.prepare(`INSERT INTO store_source_status(store,source,state,status,updated,last_success,total) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='ok' THEN CURRENT_TIMESTAMP ELSE NULL END,?) ON CONFLICT(store,source) DO UPDATE SET state=excluded.state,status=excluded.status,updated=excluded.updated,last_success=COALESCE(excluded.last_success,store_source_status.last_success),total=excluded.total`).run(provider.id,result.id,result.state,result.status || '',result.state,result.total ?? null);
          inFlightSources.get(provider.id)?.delete(result.id);
        };
        const offers = provider.fetchWithStatus ? await provider.fetchWithStatus(fetchPage, report) : await provider.fetchOffers(fetchPage);
        if (!offers.length) throw Error('Nenhum produto encontrado.');
        const stats = db.saveOffers(provider.id, offers);
        const warnings = offers.warnings || [];
        return db.status(provider.id, {state:warnings.length ? 'error' : 'ok',status:warnings.length ? `Atualização parcial: ${warnings.join('; ')}` : `${stats.total} produtos atualizados`,...stats});
      } catch (error) {
        return db.status(provider.id, {state:'error',status:`Não atualizado: ${error.message}`});
      }
    })();
    inFlight.set(provider.id, work);
    work.finally(() => { inFlight.delete(provider.id); inFlightSources.delete(provider.id); });
    return work;
  };
  const stopImageSearch = startImageSearch(db);
  const server = createServer(async (req, res) => {
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const path = requestUrl.pathname;
      if (req.method === 'GET' && path === '/api/ai-config') { res.setHeader('Cache-Control','no-store'); return json(await publicConfig(options.aiConfigPath)); }
      if (req.method === 'GET' && path === '/api/search') return json(db.search(requestUrl.searchParams.get('q') || ''));
      if (req.method === 'GET' && path === '/api/data') { const sources = db.db.prepare('SELECT * FROM sources').all(); for (const id of inFlight.keys()) { const existing = sources.find(s => s.store === id); if (existing) existing.state = 'running'; else sources.push({store:id,state:'running'}); } const sourceRows = db.db.prepare('SELECT * FROM store_source_status').all(); const store_sources = storeProviders.flatMap(p => (p.sourceDefinitions || []).map(def => ({store:p.id,source:def.id,name:def.name,...(sourceRows.find(row => row.store === p.id && row.source === def.id) || {state:'unknown'}),...(inFlightSources.get(p.id)?.has(def.id) ? {state:'running'} : {})}))); return json({ offers: db.offers(), lists: db.lists(), sources, store_sources, stores: Object.fromEntries(storeProviders.map(p => [p.id,[p.name,p.url]])) }); }
      if (req.method === 'POST' && path.startsWith('/api/')) {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw Error('Pedido muito grande'); }
        let data; try { data = JSON.parse(body || '{}'); } catch { throw Error('JSON inválido.'); }
        if (path === '/api/ai-config' || path === '/api/ai-models') {
          if ((req.headers.origin && (() => { try { return new URL(req.headers.origin).host !== req.headers.host; } catch { return true; } })()) || req.headers['sec-fetch-site'] === 'cross-site') return json({error:'Origem não permitida.'},403);
          res.setHeader('Cache-Control','no-store');
          if (path === '/api/ai-config') return json(await saveConfig(data, options.aiConfigPath));
          return json({models:await listModels(await modelConfig(data, options.aiConfigPath))});
        }
        if (path === '/api/instagram-cookies') {
          if ((req.headers.origin && (() => { try { return new URL(req.headers.origin).host !== req.headers.host; } catch { return true; } })()) || req.headers['sec-fetch-site'] === 'cross-site') return json({error:'Origem não permitida.'},403);
          if (typeof data.cookies !== 'string') throw Error('Informe o JSON dos cookies.');
          let cookies;
          try { cookies = normalizeCookies(JSON.parse(data.cookies)); } catch { throw Error('JSON inválido ou sem cookie de sessão do Instagram.'); }
          const file = options.instagramCookiesPath || cookiesPath, temp = `${file}.${randomUUID()}.tmp`;
          try {
            await mkdir(dirname(file), {recursive:true, mode:0o700});
            await writeFile(temp, JSON.stringify(cookies, null, 2), {mode:0o600, flag:'wx'});
            await rename(temp, file);
          } catch { await unlink(temp).catch(() => {}); throw Error('Não foi possível salvar os cookies.'); }
          return json({ok:true});
        }
        if (path === '/api/refresh-store') {
          const provider = storeProviders.find(p => p.id === data.store);
          if (!provider) return json({error:'Supermercado não encontrado'},404);
          return json(await refreshOne(provider));
        }
        if (path === '/api/refresh') {
          const results = {};
          for (const provider of storeProviders) results[provider.id] = (await refreshOne(provider)).status;
          return json(results);
        }
        if (path === '/api/offer') { const name = String(data.name || '').trim(), price = parsePrice(data.price); if (!name || !STORES[data.store] || !price) throw Error('Informe produto, supermercado e preço válido.'); db.saveOffers(data.store, [{ name, price, category: data.category, url: STORES[data.store][1] }]); return json({ ok: true }); }
        if (path === '/api/list') { const name = String(data.name || '').trim(); if (!name) throw Error('Informe o nome da lista.'); return json({ id: db.createList(name) }); }
        if (path === '/api/rename-list') {
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          if (!name || name.length > 100 || !Number.isSafeInteger(data.id) || data.id < 1) throw Error('Informe um nome válido para a lista.');
          const result = db.db.prepare('UPDATE lists SET name=? WHERE id=?').run(name, data.id);
          return result.changes ? json({ok:true}) : json({error:'Lista não encontrada'},404);
        }
        if (path === '/api/quantity') {
          if (!Number.isSafeInteger(data.list_id) || !Number.isSafeInteger(data.offer_id) || !Number.isSafeInteger(data.quantity) || data.quantity < 1 || data.quantity > 999) throw Error('Informe uma quantidade inteira entre 1 e 999.');
          const result = db.db.prepare('UPDATE items SET quantity=? WHERE list_id=? AND offer_id=?').run(data.quantity, data.list_id, data.offer_id);
          return result.changes ? json({ok:true}) : json({error:'Item não encontrado'},404);
        }
        if (path === '/api/item') { db.addItem(Number(data.list_id), Number(data.offer_id)); return json({ ok: true }); }
        if (path === '/api/check') { db.db.prepare('UPDATE items SET checked=? WHERE list_id=? AND offer_id=?').run(data.checked ? 1 : 0, Number(data.list_id), Number(data.offer_id)); return json({ ok: true }); }
        if (path === '/api/remove') { db.db.prepare('DELETE FROM items WHERE list_id=? AND offer_id=?').run(Number(data.list_id), Number(data.offer_id)); return json({ ok: true }); }
        if (path === '/api/delete-list') { db.db.prepare('DELETE FROM lists WHERE id=?').run(Number(data.id)); return json({ ok: true }); }
        return json({ error: 'Não encontrado' }, 404);
      }
      if (req.method !== 'GET') return json({ error: 'Não encontrado' }, 404);
      const name = path === '/' ? 'index.html' : path.slice(1);
      const root = resolve('dist'), file = resolve(root, name);
      if (!file.startsWith(root + '/')) return json({ error: 'Não encontrado' }, 404);
      try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream' }); res.end(content); } catch { json({ error: 'Arquivo não encontrado. Execute npm run build.' }, 404); }
    } catch (e) { json({ error: e.message }, 400); }
  });
  server.stopImageSearch = stopImageSearch;
  server.once('close', stopImageSearch);
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000); createApp(new Database(process.env.DATABASE_PATH || 'ofertas.sqlite3')).listen(port, '0.0.0.0', () => console.log(`http://localhost:${port}`));
}
