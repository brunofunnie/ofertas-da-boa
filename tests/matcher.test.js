import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productKey} from '../matcher.js';
import {Database} from '../server.js';

test('agrupa formatos equivalentes sem confundir marcas, variedades e quantidades', () => {
  assert.equal(productKey('Arroz Tio João Tipo 1 pacote 5Kg'), productKey('TIO JOAO arroz 5000 g tipo 1'));
  assert.notEqual(productKey('Arroz Camil 5kg'), productKey('Arroz Tio João 5kg'));
  assert.notEqual(productKey('Arroz Tio João 1kg'), productKey('Arroz Tio João 5kg'));
  assert.notEqual(productKey('Arroz Tio João integral 5kg'), productKey('Arroz Tio João branco 5kg'));
  assert.notEqual(productKey('Leite Marca 1L'), productKey('Leite Marca 1L 12 unidades'));
});
test('histórico mantém os preços separados por mercado e acompanha nomes equivalentes', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Arroz Tio João 5kg',price:2000}]);
  db.saveOffers('bom-lugar', [{name:'Arroz Tio Joao pacote 5000g',price:1800}]);
  db.saveOffers('tauste', [{name:'Arroz Tio João 5kg',price:2200}]);
  const offers=db.offers();
  assert.equal(offers[0].product_key,offers[1].product_key);
  assert.deepEqual(offers.find(o=>o.store==='tauste').history.map(h=>h.price),[2000,2200]);
  assert.deepEqual(offers.find(o=>o.store==='bom-lugar').history.map(h=>h.price),[1800]);
  db.close();
});

test('ofertas e histórico reutilizam cadastro único para produtos equivalentes', () => {
  const db = new Database(':memory:');
  try {
    db.saveOffers('tauste',[{name:'Arroz Tio João 5kg',price:2000}]);
    db.saveOffers('bom-lugar',[{name:'Arroz Tio Joao pacote 5000g',price:1800}]);
    const offers=db.offers();
    assert.equal(db.db.prepare('SELECT count(*) AS n FROM products').get().n,1);
    assert.ok(offers[0].product_id); assert.equal(offers[0].product_id,offers[1].product_id);
    assert.ok(db.db.prepare('SELECT product_id FROM price_history').all().every(h=>h.product_id===offers[0].product_id));
    db.saveOffers('tauste',[{name:'Arroz Camil 5kg',price:2300}]);
    assert.equal(db.db.prepare('SELECT count(*) AS n FROM products').get().n,2);
  } finally { db.close(); }
});

test('migração preserva listas, histórico e identifica o produto ao reabrir banco antigo', async () => {
  const {DatabaseSync}=await import('node:sqlite'); const {mkdtempSync,rmSync}=await import('node:fs'); const {tmpdir}=await import('node:os'); const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'ofertas-produto-')), path=join(dir,'banco.sqlite3');
  const legacy=new DatabaseSync(path); legacy.exec(`CREATE TABLE offers(id INTEGER PRIMARY KEY,store TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL,previous_price INTEGER,url TEXT,updated TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(store,name)); INSERT INTO offers(id,store,name,category,price) VALUES(42,'tauste','Arroz Tio João 5kg','Mercearia',2000); CREATE TABLE lists(id INTEGER PRIMARY KEY,name TEXT NOT NULL); INSERT INTO lists VALUES(1,'Semana'); CREATE TABLE items(list_id INTEGER NOT NULL,offer_id INTEGER NOT NULL,checked INTEGER DEFAULT 0,PRIMARY KEY(list_id,offer_id)); INSERT INTO items VALUES(1,42,1);`); legacy.close();
  let db=new Database(path);
  try {
    const item=db.lists()[0].items[0]; assert.equal(item.id,42); assert.equal(item.checked,1); assert.ok(item.product_id);
    const productId=item.product_id; db.close(); db=new Database(path);
    assert.equal(db.lists()[0].items[0].product_id,productId); assert.equal(db.offers()[0].history[0].price,2000);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM products').get().n,1);
    assert.equal(db.db.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
