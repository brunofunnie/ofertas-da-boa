import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { productKey } from './matcher.js';
import {createImageStore, downloadImage} from './image-store.js';
import {startRefreshScheduler} from './scheduler.js';
import { providers } from './providers/index.js';
import { cookiesPath, normalizeCookies } from './providers/instagram/index.js';
import {publicConfig, saveConfig, modelConfig, listModels} from './ai/index.js';
import {createGoogleAuth, getSession, destroySession} from './auth/index.js';
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
const categoryNames = ['Carnes','Hortifruti','Mercearia','Limpeza','Higiene','Frios e laticínios','Padaria','Bebidas'];
const todayInBrazil = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
function validImportedOffer(offer,today=todayInBrazil()) {
  if (!offer || typeof offer.name !== 'string' || !offer.name.trim() || offer.name.trim().length > 200 || !Number.isSafeInteger(offer.price) || offer.price <= 0) return null;
  if (offer.extracted && (!validDate(offer.valid_until) || offer.valid_until < today || offer.price > 10000000)) return null;
  if (offer.valid_until && (!validDate(offer.valid_until) || offer.valid_until < today)) return null;
  const club = Number.isSafeInteger(offer.club_price) && offer.club_price > 0 && offer.club_price < offer.price ? offer.club_price : null;
  return {...offer,name:offer.name.trim(),club_price:club};
}
export class Database {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS offers(id INTEGER PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, previous_price INTEGER, url TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(store,name));
      CREATE TABLE IF NOT EXISTS lists(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS items(list_id INTEGER NOT NULL, offer_id INTEGER NOT NULL, checked INTEGER DEFAULT 0, PRIMARY KEY(list_id,offer_id), FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE, FOREIGN KEY(offer_id) REFERENCES offers(id));
      CREATE TABLE IF NOT EXISTS sources(store TEXT PRIMARY KEY, status TEXT, updated TEXT);
      CREATE TABLE IF NOT EXISTS store_source_status(store TEXT NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL, status TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, last_success TEXT, total INTEGER, PRIMARY KEY(store,source));
      CREATE TABLE IF NOT EXISTS pending_offers(id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, store TEXT NOT NULL, offer_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT);
      CREATE TABLE IF NOT EXISTS offer_terms(offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE, term TEXT NOT NULL, PRIMARY KEY(offer_id,term));
      CREATE INDEX IF NOT EXISTS offer_terms_term ON offer_terms(term, offer_id);`);
    const sessionColumns = new Set(this.db.prepare('PRAGMA table_info(auth_sessions)').all().map(c => c.name));
    if (!sessionColumns.has('scope')) this.db.exec("ALTER TABLE auth_sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'app'");
    const userColumns = new Set(this.db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
    if (!userColumns.has('picture')) this.db.exec('ALTER TABLE users ADD COLUMN picture TEXT');
    const sourceColumns = new Set(this.db.prepare('PRAGMA table_info(sources)').all().map(c => c.name));
    for (const [column, type] of [['state','TEXT'],['last_success','TEXT'],['total','INTEGER'],['new_count','INTEGER'],['changed_count','INTEGER']]) {
      if (!sourceColumns.has(column)) this.db.exec(`ALTER TABLE sources ADD COLUMN ${column} ${type}`);
    }
    if (!sourceColumns.has('state')) this.db.exec("UPDATE sources SET state = CASE WHEN status LIKE 'Não atualizado:%' THEN 'error' WHEN status LIKE '%produtos atualizados' THEN 'ok' ELSE NULL END, last_success = CASE WHEN status LIKE '%produtos atualizados' THEN updated ELSE NULL END");
    const itemColumns = new Set(this.db.prepare('PRAGMA table_info(items)').all().map(c => c.name));
    const listColumns = new Set(this.db.prepare('PRAGMA table_info(lists)').all().map(c => c.name));
    if (!listColumns.has('owner_id')) this.db.exec("ALTER TABLE lists ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy-admin'");
    if (!itemColumns.has('quantity')) this.db.exec('ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1');
    if (!itemColumns.has('price_type')) this.db.exec("ALTER TABLE items ADD COLUMN price_type TEXT NOT NULL DEFAULT 'regular'");
    const columns = new Set(this.db.prepare('PRAGMA table_info(offers)').all().map(c => c.name));
    if (!columns.has('price_unit')) this.db.exec("ALTER TABLE offers ADD COLUMN price_unit TEXT NOT NULL DEFAULT 'un'");
    if (!columns.has('image_url')) this.db.exec('ALTER TABLE offers ADD COLUMN image_url TEXT');
    if (!columns.has('product_key')) this.db.exec('ALTER TABLE offers ADD COLUMN product_key TEXT');
    this.db.exec("CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY, product_key TEXT NOT NULL, store TEXT NOT NULL, condition TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS price_history_product ON price_history(product_key,store,condition,id)");
    this.db.exec('CREATE TABLE IF NOT EXISTS product_images(product_key TEXT PRIMARY KEY, image_url TEXT NOT NULL, source_url TEXT NOT NULL)');
    if (!columns.has('regular_price')) this.db.exec('ALTER TABLE offers ADD COLUMN regular_price INTEGER');
    if (!columns.has('extracted')) this.db.exec('ALTER TABLE offers ADD COLUMN extracted INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('valid_until')) this.db.exec('ALTER TABLE offers ADD COLUMN valid_until TEXT');
    if (!columns.has('club_price')) this.db.exec('ALTER TABLE offers ADD COLUMN club_price INTEGER');
    if (!columns.has('condition')) this.db.exec("ALTER TABLE offers ADD COLUMN condition TEXT NOT NULL DEFAULT ''");
    this.db.exec('CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, product_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, image_url TEXT, image_source TEXT)');
    const productColumns = new Set(this.db.prepare('PRAGMA table_info(products)').all().map(c=>c.name));
    if (!productColumns.has('image_r2_key')) this.db.exec('ALTER TABLE products ADD COLUMN image_r2_key TEXT');
    if (!productColumns.has('image_manual')) this.db.exec('ALTER TABLE products ADD COLUMN image_manual INTEGER NOT NULL DEFAULT 0');
    if (!this.db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'customized')) this.db.exec('ALTER TABLE products ADD COLUMN customized INTEGER NOT NULL DEFAULT 0');
    this.db.exec('CREATE TABLE IF NOT EXISTS product_aliases(alias TEXT PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE)');
    this.db.exec('CREATE TABLE IF NOT EXISTS image_deletion_queue(image_key TEXT PRIMARY KEY)');
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
    this.importPendingOffers();
  }
  saveOffers(store, offers, {transaction = true} = {}) {
    const q = this.db.prepare(`INSERT INTO offers(store,name,category,price,url,regular_price,condition,club_price,valid_until,extracted,image_url,price_unit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(store,name) DO UPDATE SET previous_price=CASE WHEN offers.price != excluded.price THEN offers.price ELSE offers.previous_price END, price=excluded.price,category=excluded.category,url=excluded.url,regular_price=excluded.regular_price,condition=excluded.condition,club_price=excluded.club_price,valid_until=excluded.valid_until,extracted=excluded.extracted,image_url=COALESCE(NULLIF(excluded.image_url,''),offers.image_url),price_unit=excluded.price_unit,updated=CURRENT_TIMESTAMP`);
    const unique = [...new Map(offers.map(o => [o.name, o])).values()];
    const stats = {total:unique.length, new_count:0, changed_count:0};
    if (transaction) this.db.exec('BEGIN');
    try {
      for (const o of unique) {
        const old = this.db.prepare('SELECT * FROM offers WHERE store=? AND name=?').get(store, o.name);
        if (!old) stats.new_count++;
        else if (old.price !== o.price || old.category !== (o.category || categorize(o.name)) || old.url !== (o.url || '') || old.regular_price !== (o.regular_price || null) || old.condition !== (o.condition || '') || old.club_price !== (o.club_price || null) || old.valid_until !== (o.valid_until || null) || old.price_unit !== (o.price_unit === 'kg' ? 'kg' : 'un') || (o.image_url && old.image_url !== o.image_url)) stats.changed_count++;
        q.run(store, o.name, o.category || categorize(o.name), o.price, o.url || '', o.regular_price || null, o.condition || '', o.club_price || null, o.valid_until || null, o.extracted ? 1 : 0, o.image_url || null, o.price_unit === 'kg' ? 'kg' : 'un');
        const offer = this.db.prepare('SELECT * FROM offers WHERE store=? AND name=?').get(store, o.name);
        const derivedKey=productKey(o.name) || `offer:${offer.id}`;
        let target=this.db.prepare('SELECT id,product_key FROM products WHERE product_key=?').get(derivedKey) || this.db.prepare('SELECT products.id,products.product_key FROM product_aliases JOIN products ON products.id=product_aliases.product_id WHERE product_aliases.alias=?').get(derivedKey);
        if (!target) {this.db.prepare('INSERT INTO products(product_key,name,category) VALUES(?,?,?)').run(derivedKey,o.name,o.category || categorize(o.name));target=this.db.prepare('SELECT id,product_key FROM products WHERE product_key=?').get(derivedKey);}
        const key=target.product_key, productId=target.id;
        this.db.prepare('UPDATE offers SET product_key=?,product_id=? WHERE id=?').run(key, productId, offer.id);
        if (o.image_url) this.db.prepare('UPDATE products SET image_url=?,image_source=NULL WHERE id=? AND image_manual=0 AND image_r2_key IS NULL').run(o.image_url, productId);
        this.indexOffer({...offer,product_id:productId});
        const previous = this.db.prepare('SELECT price FROM price_history WHERE product_key=? AND store=? AND condition=? ORDER BY id DESC LIMIT 1').get(key, store, o.condition || '');
        if (!previous || previous.price !== o.price) this.db.prepare('INSERT INTO price_history(product_key,product_id,store,condition,price) VALUES(?,?,?,?,?)').run(key, productId, store, o.condition || '', o.price);
      }
      if (transaction) this.db.exec('COMMIT');
      return stats;
    } catch (e) { if (transaction) this.db.exec('ROLLBACK'); throw e; }
  }
  importPendingOffers() {
    if (this.db.prepare("SELECT 1 FROM app_settings WHERE key='automatic_import_migrated'").get()) return;
    const rows=this.db.prepare("SELECT * FROM pending_offers WHERE state='pending' ORDER BY created_at DESC,id DESC").all();
    const seen=new Set(), today=todayInBrazil();
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        let offer; try { offer=validImportedOffer(JSON.parse(row.offer_json),today); } catch { offer=null; }
        let state='invalid';
        if (offer) {
          const key=JSON.stringify([row.store,offer.name]), existing=this.db.prepare('SELECT updated FROM offers WHERE store=? AND name=?').get(row.store,offer.name);
          if (seen.has(key) || (existing?.updated && existing.updated >= row.created_at)) state='superseded';
          else { this.saveOffers(row.store,[offer],{transaction:false});state='imported'; }
          seen.add(key);
        }
        this.db.prepare("UPDATE pending_offers SET state=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(state,row.id);
      }
      this.db.prepare("INSERT INTO app_settings(key,value) VALUES('automatic_import_migrated',1)").run();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK');throw error; }
  }
  catalog(query = '') {
    const products=this.db.prepare('SELECT id,product_key,name,category,image_url,image_r2_key FROM products ORDER BY name COLLATE NOCASE,id').all().map(p=>({...p,image_url:p.image_r2_key ? `/api/product-image/${p.id}/${p.image_r2_key}` : p.image_url}));
    const byId=new Map(products.map(product=>[product.id,{...product,offers:[],list_count:0,history_count:0}]));
    for (const offer of this.db.prepare('SELECT * FROM offers ORDER BY updated DESC,id DESC').all()) byId.get(offer.product_id)?.offers.push(offer);
    for (const row of this.db.prepare('SELECT offers.product_id,COUNT(*) count FROM items JOIN offers ON offers.id=items.offer_id GROUP BY offers.product_id').all()) {const product=byId.get(row.product_id);if(product)product.list_count=row.count;}
    for (const row of this.db.prepare('SELECT product_id,COUNT(*) count FROM price_history GROUP BY product_id').all()) {const product=byId.get(row.product_id);if(product)product.history_count=row.count;}
    const tokens=[...new Set(words(String(query).slice(0,100)))].slice(0,10);
    return [...byId.values()].filter(product=>{
      if (!tokens.length) return true;
      const terms=[...new Set(words([product.name,product.category,...product.offers.map(offer=>offer.name)].join(' ')))];
      return tokens.every(token=>terms.some(term=>term===token || term.startsWith(token) || (token.length>=4 && Math.abs(term.length-token.length)<=1 && distance(token,term)<=1)));
    });
  }
  updateProduct(id,input) {
    const product=this.db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!product) return false;
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length>200 || (!categoryNames.includes(input.category) && input.category !== product.category) || !Array.isArray(input.offers) || input.offers.length>200) throw Error('Dados inválidos.');
    const ids=new Set();
    for (const item of input.offers) {
      if (!item || !Number.isSafeInteger(item.id) || ids.has(item.id) || !this.db.prepare('SELECT 1 FROM offers WHERE id=? AND product_id=?').get(item.id,id)) throw Error('Oferta inválida.');
      ids.add(item.id);
      const current=this.db.prepare('SELECT updated,price,club_price,regular_price,valid_until,condition,price_unit FROM offers WHERE id=? AND product_id=?').get(item.id,id);
      if (!item.expected || ['updated','price','club_price','regular_price','valid_until','condition','price_unit'].some(key => item.expected[key] !== current[key])) {const error=Error('Oferta alterada.');error.code='OFFER_CHANGED';throw error;}
      if (!Number.isSafeInteger(item.price) || item.price<=0 || item.price>10000000 || (item.club_price != null && (!Number.isSafeInteger(item.club_price) || item.club_price<=0 || item.club_price>=item.price)) || (item.regular_price != null && (!Number.isSafeInteger(item.regular_price) || item.regular_price<=item.price || item.regular_price>10000000)) || (item.valid_until != null && item.valid_until !== '' && !validDate(item.valid_until)) || typeof item.condition !== 'string' || item.condition.length>120 || !['un','kg'].includes(item.price_unit)) throw Error('Dados inválidos.');
    }
    this.db.exec('BEGIN');
    try {
      const alias=productKey(input.name.trim());
      if (alias) {
        const owner=this.db.prepare('SELECT id FROM products WHERE product_key=? UNION ALL SELECT product_id AS id FROM product_aliases WHERE alias=? LIMIT 1').get(alias,alias);
        if (owner && owner.id!==id) {const error=Error('Produto equivalente já existe.');error.code='PRODUCT_CONFLICT';throw error;}
      }
      this.db.prepare('UPDATE products SET name=?,category=?,customized=1 WHERE id=?').run(input.name.trim(),input.category,id);
      this.db.prepare('DELETE FROM product_aliases WHERE product_id=?').run(id);
      if (alias && alias!==product.product_key) this.db.prepare('INSERT INTO product_aliases(alias,product_id) VALUES(?,?)').run(alias,id);
      for (const item of input.offers) {
        this.db.prepare('UPDATE offers SET previous_price=CASE WHEN price!=? THEN price ELSE previous_price END,price=?,club_price=?,regular_price=?,valid_until=?,condition=?,price_unit=?,updated=CURRENT_TIMESTAMP WHERE id=? AND product_id=?').run(item.price,item.price,item.club_price ?? null,item.regular_price ?? null,item.valid_until || null,item.condition.trim(),item.price_unit,item.id,id);
        const latest=this.db.prepare('SELECT price FROM price_history WHERE product_id=? AND store=(SELECT store FROM offers WHERE id=?) AND condition=? ORDER BY id DESC LIMIT 1').get(id,item.id,item.condition.trim());
        if (!latest || latest.price!==item.price) this.db.prepare('INSERT INTO price_history(product_key,product_id,store,condition,price) SELECT product_key,product_id,store,condition,price FROM offers WHERE id=?').run(item.id);
      }
      for (const offer of this.db.prepare('SELECT * FROM offers WHERE product_id=?').all(id)) this.indexOffer(offer);
      this.db.exec('COMMIT');return true;
    } catch (error) {this.db.exec('ROLLBACK');throw error;}
  }
  deleteProduct(id,expected=null) {
    const product=this.db.prepare('SELECT product_key,image_r2_key FROM products WHERE id=?').get(id);if(!product)return false;
    this.db.exec('BEGIN');
    try {
      if (expected) {
        const offers=this.db.prepare('SELECT id FROM offers WHERE product_id=? ORDER BY id').all(id).map(row=>row.id);
        const listCount=this.db.prepare('SELECT COUNT(*) count FROM items WHERE offer_id IN (SELECT id FROM offers WHERE product_id=?)').get(id).count;
        const historyCount=this.db.prepare('SELECT COUNT(*) count FROM price_history WHERE product_id=? OR product_key=?').get(id,product.product_key).count;
        if (!Array.isArray(expected.offer_ids) || !Number.isSafeInteger(expected.list_count) || !Number.isSafeInteger(expected.history_count) || JSON.stringify(offers)!==JSON.stringify([...expected.offer_ids].sort((a,b)=>a-b)) || listCount!==expected.list_count || historyCount!==expected.history_count) {const error=Error('Produto alterado.');error.code='PRODUCT_CHANGED';throw error;}
      }
      this.db.prepare('DELETE FROM items WHERE offer_id IN (SELECT id FROM offers WHERE product_id=?)').run(id);
      this.db.prepare('DELETE FROM price_history WHERE product_id=? OR product_key=?').run(id,product.product_key);
      this.db.prepare('DELETE FROM offers WHERE product_id=?').run(id);
      this.db.prepare('DELETE FROM product_images WHERE product_key=?').run(product.product_key);
      this.db.prepare('DELETE FROM products WHERE id=?').run(id);
      if (product.image_r2_key) this.db.prepare('INSERT OR IGNORE INTO image_deletion_queue(image_key) VALUES(?)').run(product.image_r2_key);
      this.db.exec('COMMIT');return true;
    } catch (error) {this.db.exec('ROLLBACK');throw error;}
  }
  customizedProducts() { return new Map(this.db.prepare('SELECT id,name,category FROM products WHERE customized=1').all().map(row=>[row.id,row])); }
  productImages() {
    const images = new Map();
    const usable = value => {
      try { const host = new URL(value).hostname.toLowerCase(); return host !== 'openfoodfacts.org' && !host.endsWith('.openfoodfacts.org'); }
      catch { return false; }
    };
    for (const row of this.db.prepare("SELECT id,product_key,image_url,image_source,image_r2_key FROM products WHERE image_r2_key IS NOT NULL OR (image_url IS NOT NULL AND image_url != '')").all()) {
      if (row.image_r2_key) images.set(row.product_key, {image_url:`/api/product-image/${row.id}/${row.image_r2_key}`,image_source:row.image_source});
      else if (usable(row.image_url) && (!row.image_source || usable(row.image_source))) images.set(row.product_key, {image_url:row.image_url,image_source:row.image_source});
    }
    for (const row of this.db.prepare("SELECT product_key,image_url FROM offers WHERE image_url IS NOT NULL AND image_url != '' ORDER BY updated DESC,id DESC").all()) {
      if (!images.has(row.product_key) && usable(row.image_url)) images.set(row.product_key, {image_url:row.image_url,image_source:null});
    }
    return images;
  }
  offers() {
    const images = this.productImages(), customized=this.customizedProducts();
    const history = this.db.prepare('SELECT price,observed_at FROM (SELECT id,price,observed_at FROM price_history WHERE product_key=? AND store=? AND condition=? ORDER BY id DESC LIMIT 20) ORDER BY id');
    return this.db.prepare("SELECT * FROM offers WHERE valid_until IS NULL OR valid_until >= date('now', '-3 hours') ORDER BY updated DESC, name").all().map(o => ({ ...o, ...(customized.has(o.product_id) ? {name:customized.get(o.product_id).name,category:customized.get(o.product_id).category} : {}), ...(images.get(o.product_key) || { image_url: null, image_source: null }), history: history.all(o.product_key, o.store, o.condition || '') }));
  }
  indexOffer(offer) {
    this.db.prepare('DELETE FROM offer_terms WHERE offer_id=?').run(offer.id);
    const insert = this.db.prepare('INSERT OR IGNORE INTO offer_terms(offer_id,term) VALUES(?,?)');
    const product=offer.product_id ? this.db.prepare('SELECT name,category FROM products WHERE id=? AND customized=1').get(offer.product_id) : null;
    for (const term of new Set(words(`${offer.name} ${offer.category} ${product?.name || ''} ${product?.category || ''}`))) insert.run(offer.id, term);
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
  createList(name, owner = 'legacy-admin') { return Number(this.db.prepare('INSERT INTO lists(name,owner_id) VALUES(?,?)').run(name, owner).lastInsertRowid); }
  addItem(list, offer, priceType = 'regular') { this.db.prepare('INSERT INTO items(list_id,offer_id,price_type) VALUES(?,?,?) ON CONFLICT(list_id,offer_id) DO UPDATE SET price_type=excluded.price_type').run(list, offer, priceType); }
  lists(owner = 'legacy-admin') { const images = this.productImages(), customized=this.customizedProducts(); return this.db.prepare('SELECT id,name FROM lists WHERE owner_id=? ORDER BY id DESC').all(owner).map(l => ({ ...l, items: this.db.prepare('SELECT offers.*,items.checked,items.quantity,items.price_type FROM items JOIN offers ON offers.id=items.offer_id WHERE list_id=? ORDER BY checked,name').all(l.id).map(item => ({ ...item, ...(customized.has(item.product_id) ? {name:customized.get(item.product_id).name,category:customized.get(item.product_id).category} : {}), ...(item.price_type === 'club' ? {price:item.club_price || item.price,condition:item.club_price ? 'Clube' : 'Clube indisponível · preço normal'} : {}), ...(images.get(item.product_key) || { image_url: null, image_source: null }) })) })); }
  status(store, result) {
    this.db.prepare(`INSERT INTO sources(store,status,updated,state,last_success,total,new_count,changed_count) VALUES(?,?,CURRENT_TIMESTAMP,?,CASE WHEN ?='ok' THEN CURRENT_TIMESTAMP ELSE NULL END,?,?,?)
      ON CONFLICT(store) DO UPDATE SET status=excluded.status,updated=excluded.updated,state=excluded.state,last_success=COALESCE(excluded.last_success,sources.last_success),total=COALESCE(excluded.total,sources.total),new_count=COALESCE(excluded.new_count,sources.new_count),changed_count=COALESCE(excluded.changed_count,sources.changed_count)`)
      .run(store,result.status,result.state,result.state,result.total ?? null,result.new_count ?? null,result.changed_count ?? null);
    return this.db.prepare('SELECT * FROM sources WHERE store=?').get(store);
  }
  close() { this.db.close(); }
}
async function fetchPage(url) { const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 OfertasDaBoa/1.0' }, signal: AbortSignal.timeout(20000) }); if (!res.ok) throw Error(`HTTP ${res.status}`); return res.text(); }
const auditPaths = new Set(['/api/refresh-store','/api/refresh','/api/offer','/api/list','/api/rename-list','/api/quantity','/api/item','/api/check','/api/remove','/api/delete-list','/api/admin/product/update','/api/admin/product/delete','/api/admin/product/image','/api/ai-config','/api/ai-models','/api/instagram-cookies','/api/offer-settings','/api/logout','/api/admin/logout']);
const adminPaths = new Set(['/api/refresh-store','/api/refresh','/api/offer','/api/admin/product/update','/api/admin/product/delete','/api/admin/product/image','/api/ai-config','/api/ai-models','/api/instagram-cookies','/api/offer-settings']);
const listPaths = new Set(['/api/list','/api/rename-list','/api/quantity','/api/item','/api/check','/api/remove','/api/delete-list']);
function logError(scope, error) {
  const detail = String(error?.stack || error?.message || error).slice(0,4000).replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi,'$1?[redacted]').replace(/\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{12,}/g,'[redacted]').replace(/(Bearer\s+)[^\s]+/gi,'$1[redacted]');
  console.error(JSON.stringify({type:'error',at:new Date().toISOString(),scope,detail,...(error?.cause?.name && /^[A-Za-z]+$/.test(error.cause.name) ? {cause:error.cause.name} : {}),...(error?.cause?.cause?.code && /^[A-Z0-9_]+$/.test(error.cause.cause.code) ? {cause_code:error.cause.cause.code} : {})}));
}
function sourceError(message) {
  const safe = ['Limite de requisições do Gemini atingido. Tente novamente mais tarde.','Limite de requisições do provedor de IA atingido. Tente novamente mais tarde.','Sessão do Instagram expirada ou requer verificação.','Instagram demorou para abrir a publicação. Tente atualizar novamente.'];
  return safe.includes(message) ? message : 'Não foi possível atualizar a fonte.';
}
function safeStoredStatus(source) {
  if (source.state !== 'error') return source;
  if (source.status?.startsWith('Atualização parcial:')) return {...source,status:'Atualização parcial: verifique as fontes.'};
  return {...source,status:`Não atualizado: ${sourceError(source.status?.replace(/^Não atualizado:\s*/, ''))}`};
}

export function createApp(db, storeProviders = providers, options = {}) {
  const imageStore = options.imageStore ?? createImageStore(process.env.R2_IMAGES_CREDENTIALS);
  let imageSyncRunning = false, imageSyncAgain = false, imageLock=Promise.resolve();
  const withImageLock = fn => {const work=imageLock.then(fn);imageLock=work.catch(()=>{});return work;};
  const queueImageDeletion = key => {if (key) db.db.prepare('INSERT OR IGNORE INTO image_deletion_queue(image_key) VALUES(?)').run(key);};
  const deleteQueuedImages = () => {
    if (!imageStore) return Promise.resolve();
    return withImageLock(async()=>{
      for (const {image_key:key} of db.db.prepare('SELECT image_key FROM image_deletion_queue').all()) {
        try {
          if (!db.db.prepare('SELECT 1 FROM products WHERE image_r2_key=? LIMIT 1').get(key)) await imageStore.delete(key);
          db.db.prepare('DELETE FROM image_deletion_queue WHERE image_key=?').run(key);
        } catch (error) {logError('image-delete',error);}
      }
    });
  };
  const syncImages = async () => {
    if (!imageStore) return;
    if (imageSyncRunning) { imageSyncAgain=true; return; }
    imageSyncRunning = true;
    try {
      const products = db.db.prepare("SELECT id,image_url FROM products WHERE image_r2_key IS NULL AND image_manual=0 AND image_url LIKE 'https://%'").all().filter(product=>{try {const host=new URL(product.image_url).hostname.toLowerCase();return host!=='openfoodfacts.org' && !host.endsWith('.openfoodfacts.org');} catch {return false;}});
      let saved=0, failed=0;
      let index=0;
      await Promise.all(Array.from({length:4},async()=>{
        while (index<products.length) {
          const product=products[index++];
          try { const {bytes}=await downloadImage(product.image_url); await withImageLock(async()=>{const key=await imageStore.put(bytes); const changed=Number(db.db.prepare('UPDATE products SET image_r2_key=? WHERE id=? AND image_url=? AND image_r2_key IS NULL AND image_manual=0').run(key,product.id,product.image_url).changes); saved+=changed; if (!changed) queueImageDeletion(key);}); }
          catch { failed++; }
        }
      }));
      console.log(JSON.stringify({type:'image-sync',saved,failed}));
      void deleteQueuedImages();
    } catch (error) { logError('image-sync',error); } finally { imageSyncRunning=false; if (imageSyncAgain) {imageSyncAgain=false; void syncImages();} }
  };
  let imageTimer, imageStartupTimer;
  if (imageStore) { imageStartupTimer=setTimeout(()=>{void deleteQueuedImages();void syncImages();},1000); imageStartupTimer.unref(); imageTimer=setInterval(()=>{void deleteQueuedImages();},60000); imageTimer.unref(); }
  const inFlight = new Map();
  const inFlightSources = new Map();
  const google = createGoogleAuth(options.googleAuth);
  const refreshOne = provider => {
    if (inFlight.has(provider.id)) return inFlight.get(provider.id);
    if (provider.sourceDefinitions) inFlightSources.set(provider.id, new Set(provider.sourceDefinitions.map(source => source.id)));
    const work = (async () => {
      try {
        const report = result => {
          if (result.state === 'error') { logError(`source:${provider.id}:${result.id}`,result.status); result = {...result,status:sourceError(result.status)}; }
          db.db.prepare(`INSERT INTO store_source_status(store,source,state,status,updated,last_success,total) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='ok' THEN CURRENT_TIMESTAMP ELSE NULL END,?) ON CONFLICT(store,source) DO UPDATE SET state=excluded.state,status=excluded.status,updated=excluded.updated,last_success=COALESCE(excluded.last_success,store_source_status.last_success),total=excluded.total`).run(provider.id,result.id,result.state,result.status || '',result.state,result.total ?? null);
          inFlightSources.get(provider.id)?.delete(result.id);
        };
        const offers = provider.fetchWithStatus ? await provider.fetchWithStatus(fetchPage, report) : await provider.fetchOffers(fetchPage);
        if (!offers.length) throw Error('Nenhum produto encontrado.');
        const valid=offers.map(offer=>validImportedOffer(offer)).filter(Boolean);
        if (!valid.length) throw Error('Nenhum produto válido encontrado.');
        const stats=db.saveOffers(provider.id,valid);
        void syncImages();
        const warnings = offers.warnings || [];
        if (warnings.length) for (const warning of warnings) logError(`source:${provider.id}`,warning);
        const warningNames = [...new Set(warnings.map(w => /^Instagram:/i.test(w) ? 'Instagram' : /^Site:/i.test(w) ? 'Site' : 'fonte'))].join(', ');
        return db.status(provider.id, {state:warnings.length ? 'error' : 'ok',status:warnings.length ? `Atualização parcial: ${warningNames} indisponível` : `${stats.total} produtos consultados`,...stats});
      } catch (error) {
        logError(`refresh:${provider.id}`,error);
        return db.status(provider.id, {state:'error',status:`Não atualizado: ${sourceError(error.message)}`});
      }
    })();
    inFlight.set(provider.id, work);
    work.finally(() => { inFlight.delete(provider.id); inFlightSources.delete(provider.id); });
    return work;
  };
  const server = createServer(async (req, res) => {
    let auditDetails = {}, auditOutcome;
    const json = (data, status = 200) => { if (data?.state) auditOutcome = data.state; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const path = requestUrl.pathname;
      const appUser = options.resolveUser ? options.resolveUser(req) : getSession(db.db,req);
      const adminRequest = adminPaths.has(path) || path === '/api/admin/products' || path === '/api/admin/data' || path === '/api/admin/logout';
      const adminUser = adminRequest ? (options.resolveUser ? options.resolveUser(req) : getSession(db.db,req,'admin')) : null;
      const user = adminRequest ? adminUser : appUser;
      if (req.method === 'GET' && path === '/auth/google') return google.begin(req,res);
      if (req.method === 'GET' && path === '/auth/google/admin') return google.begin(req,res,'admin');
      if (req.method === 'GET' && path === '/auth/google/callback') return await google.callback(req,res,db.db,requestUrl);
      if (req.method === 'POST' && auditPaths.has(path)) {
        const client = req.headers['cf-connecting-ip'];
        res.once('finish', () => console.log(JSON.stringify({type:'audit',at:new Date().toISOString(),action:path.slice(5),status:res.statusCode,outcome:auditOutcome || (res.statusCode < 400 ? 'ok' : 'error'),actor:user?.sub || appUser?.sub || 'sem-autenticacao',client_ip:typeof client === 'string' && isIP(client) ? client : req.socket.remoteAddress || null,...auditDetails})));
      }
      if (adminRequest && !adminUser?.admin) return json({error:'Acesso restrito.'}, appUser ? 403 : 401);
      if (req.method === 'GET' && path === '/api/ai-config') { if (!user?.admin) return json({error:'Acesso restrito.'},user ? 403 : 401); res.setHeader('Cache-Control','no-store'); return json(await publicConfig(options.aiConfigPath)); }
      if (req.method === 'GET' && path === '/api/admin/products') { res.setHeader('Cache-Control','no-store');return json({products:db.catalog(requestUrl.searchParams.get('q') || '')}); }
      if (req.method === 'GET' && /^\/api\/product-image\/\d+\/[a-f0-9]{64}$/.test(path)) {
        const [, , , id, key]=path.split('/');
        if (!imageStore || !db.db.prepare('SELECT 1 FROM products WHERE id=? AND image_r2_key=?').get(Number(id),key)) return json({error:'Imagem não encontrada.'},404);
        try { const image=await imageStore.get(key); res.writeHead(200,{'Content-Type':image.type,'Content-Length':image.bytes.length,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}); return res.end(image.bytes); } catch(error) {logError('image-read',error);return json({error:'Imagem indisponível.'},502);}
      }
      if (req.method === 'GET' && path === '/api/search') return json(db.search(requestUrl.searchParams.get('q') || ''));
      if (req.method === 'GET' && (path === '/api/data' || path === '/api/admin/data')) { res.setHeader('Cache-Control','no-store'); res.setHeader('Vary','Cookie'); const sources = db.db.prepare('SELECT * FROM sources').all().map(safeStoredStatus); for (const id of inFlight.keys()) { const existing = sources.find(s => s.store === id); if (existing) existing.state = 'running'; else sources.push({store:id,state:'running'}); } const sourceRows = db.db.prepare('SELECT * FROM store_source_status').all().map(row => row.state === 'error' ? {...row,status:sourceError(row.status)} : row); const store_sources = storeProviders.flatMap(p => (p.sourceDefinitions || []).map(def => ({store:p.id,source:def.id,name:def.name,...(sourceRows.find(row => row.store === p.id && row.source === def.id) || {state:'unknown'}),...(inFlightSources.get(p.id)?.has(def.id) ? {state:'running'} : {})}))); return json({ total_products:db.db.prepare('SELECT COUNT(*) AS count FROM products').get().count, irresistible_percent:db.db.prepare("SELECT value FROM app_settings WHERE key='irresistible_percent'").get()?.value ?? 20, offers: db.offers(), lists:user ? db.lists(user.sub) : [], user:user ? {name:user.name,email:user.email,picture:user.picture,admin:!!user.admin} : null, login_available:google.available, sources, store_sources, stores: Object.fromEntries(storeProviders.map(p => [p.id,[p.name,p.url]])) }); }
      if (req.method === 'POST' && path.startsWith('/api/')) {
        const origin = req.headers.origin, site = req.headers['sec-fetch-site'];
        if ((origin && (() => { try { const url = new URL(origin); return !['http:','https:'].includes(url.protocol) || url.host !== req.headers.host; } catch { return true; } })()) || site === 'cross-site' || site === 'same-site') return json({error:'Origem não permitida.'},403);
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return json({error:'Use application/json.'},415);
        if (adminPaths.has(path) && !user?.admin) return json({error:'Acesso restrito.'},user ? 403 : 401);
        if (listPaths.has(path) && !user) return json({error:'Entre com o Google para usar listas.'},401);
        if (path === '/api/logout') {destroySession(db.db,req);res.setHeader('Set-Cookie',google.clearCookie());return json({ok:true});}
        if (path === '/api/admin/logout') {destroySession(db.db,req,'admin');res.setHeader('Set-Cookie',google.clearCookie('admin'));return json({ok:true});}
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > (path === '/api/admin/product/image' ? 7100000 : 100000)) throw Error('Pedido muito grande'); }
        let data; try { data = JSON.parse(body || '{}'); } catch { throw Error('JSON inválido.'); }
        if (storeProviders.some(provider => provider.id === data.store)) auditDetails.store = data.store;
        for (const key of ['id','list_id','offer_id']) if (Number.isSafeInteger(data[key]) && data[key] > 0) auditDetails[key] = data[key];
        if (path === '/api/ai-config' || path === '/api/ai-models') {
          res.setHeader('Cache-Control','no-store');
          if (path === '/api/ai-config') return json(await saveConfig(data, options.aiConfigPath));
          return json({models:await listModels(await modelConfig(data, options.aiConfigPath))});
        }
        if (path === '/api/offer-settings') {
          if (!Number.isInteger(data.irresistible_percent) || data.irresistible_percent < 1 || data.irresistible_percent > 100) return json({error:'Informe um percentual inteiro entre 1 e 100.'},400);
          db.db.prepare("INSERT INTO app_settings(key,value) VALUES('irresistible_percent',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(data.irresistible_percent);
          return json({ok:true});
        }
        if (path === '/api/instagram-cookies') {
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
        if (path === '/api/admin/product/image') {
          if (!imageStore) return json({error:'Armazenamento de imagens não configurado.'},503);
          if (!Number.isSafeInteger(data.id) || data.id<1 || typeof data.image!=='string' || data.image.length>7000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)) return json({error:'Imagem inválida.'},400);
          if (!db.db.prepare('SELECT 1 FROM products WHERE id=?').get(data.id)) return json({error:'Produto não encontrado.'},404);
          try {
            const changed=await withImageLock(async()=>{const original=db.db.prepare('SELECT product_key,image_r2_key FROM products WHERE id=?').get(data.id); if (!original) return 0; const key=await imageStore.put(Buffer.from(data.image,'base64')); const result=db.db.prepare('UPDATE products SET image_r2_key=?,image_manual=1,image_source=NULL WHERE id=? AND product_key=?').run(key,data.id,original.product_key); if (!result.changes) queueImageDeletion(key); else if (original.image_r2_key && original.image_r2_key!==key) queueImageDeletion(original.image_r2_key); return result.changes;});
            void deleteQueuedImages();
            return changed ? json({ok:true}) : json({error:'Produto não encontrado.'},404);
          }
          catch(error) {logError('image-upload',error);return json({error:'Não foi possível salvar a imagem. Use JPEG, PNG ou WebP de até 5 MB.'},400);}
        }
        if (path === '/api/admin/product/update') {
          if (!Number.isSafeInteger(data.id) || data.id<1) return json({error:'Produto inválido.'},400);
          try {if (!db.updateProduct(data.id,data)) return json({error:'Produto não encontrado.'},404);} catch (error) {if (error.code === 'OFFER_CHANGED') return json({error:'A oferta foi atualizada. Reabra o produto e tente novamente.'},409);if (error.code === 'PRODUCT_CONFLICT') return json({error:'Já existe outro produto equivalente a esse nome.'},409);logError('admin:product-update',error);return json({error:'Verifique os dados do produto e dos preços.'},400);}
          return json({ok:true});
        }
        if (path === '/api/admin/product/delete') {
          if (!Number.isSafeInteger(data.id) || data.id<1 || !data.expected || typeof data.expected!=='object') return json({error:'Produto inválido.'},400);
          try {if (!db.deleteProduct(data.id,data.expected)) return json({error:'Produto não encontrado.'},404);} catch(error) {if(error.code==='PRODUCT_CHANGED') return json({error:'O produto foi alterado. Feche e abra a exclusão novamente.'},409);throw error;}
          await deleteQueuedImages();
          return json({ok:true});
        }
        if (path === '/api/offer') { const name = String(data.name || '').trim(), price = parsePrice(data.price); if (!name || !STORES[data.store] || !price) throw Error('Informe produto, supermercado e preço válido.'); db.saveOffers(data.store, [{ name, price, category: data.category, url: STORES[data.store][1] }]); return json({ ok: true }); }
        if (path === '/api/list') { const name = String(data.name || '').trim(); if (!name || name.length > 100) throw Error('Informe o nome da lista.'); return json({ id: db.createList(name,user.sub) }); }
        if (listPaths.has(path) && path !== '/api/list') {
          const listId = Number(path === '/api/rename-list' || path === '/api/delete-list' ? data.id : data.list_id);
          if (!Number.isSafeInteger(listId) || listId < 1 || !db.db.prepare('SELECT 1 FROM lists WHERE id=? AND owner_id=?').get(listId,user.sub)) return json({error:'Lista não encontrada.'},404);
        }
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
        if (path === '/api/item') { const priceType = data.price_type ?? 'regular'; if (!['regular','club'].includes(priceType)) return json({error:'Condição de preço inválida.'},400); if (priceType === 'club' && !db.db.prepare('SELECT 1 FROM offers WHERE id=? AND club_price > 0').get(Number(data.offer_id))) return json({error:'Preço de clube indisponível.'},400); db.addItem(Number(data.list_id), Number(data.offer_id), priceType); return json({ ok: true }); }
        if (path === '/api/check') { db.db.prepare('UPDATE items SET checked=? WHERE list_id=? AND offer_id=?').run(data.checked ? 1 : 0, Number(data.list_id), Number(data.offer_id)); return json({ ok: true }); }
        if (path === '/api/remove') { db.db.prepare('DELETE FROM items WHERE list_id=? AND offer_id=?').run(Number(data.list_id), Number(data.offer_id)); return json({ ok: true }); }
        if (path === '/api/delete-list') { db.db.prepare('DELETE FROM lists WHERE id=?').run(Number(data.id)); return json({ ok: true }); }
        return json({ error: 'Não encontrado' }, 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Não encontrado' }, 404);
      if (path === '/admin') { res.writeHead(308, {'Location':`/admin/${requestUrl.search}`}); return res.end(); }
      const name = path === '/' ? 'index.html' : path === '/admin/' ? 'admin/index.html' : path.slice(1);
      const root = resolve('dist'), file = resolve(root, name);
      if (!file.startsWith(root + '/')) return json({ error: 'Não encontrado' }, 404);
      try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[extname(file)] || 'application/octet-stream' }); res.end(content); } catch { json({ error: 'Arquivo não encontrado. Execute npm run build.' }, 404); }
    } catch (e) { logError('request',e); json({ error:'Não foi possível concluir a solicitação. Verifique os dados e tente novamente.' }, 400); }
  });
  let stopScheduler;
  if (options.schedule) server.once('listening',()=>{stopScheduler=startRefreshScheduler(storeProviders,refreshOne);});
  server.once('close',()=>{clearInterval(imageTimer);clearTimeout(imageStartupTimer);stopScheduler?.();});
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000); createApp(new Database(process.env.DATABASE_PATH || 'ofertas.sqlite3'),providers,{schedule:true}).listen(port, '0.0.0.0', () => console.log(`http://localhost:${port}`));
}
