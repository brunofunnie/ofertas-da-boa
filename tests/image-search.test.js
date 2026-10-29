import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchImage, searchImage, processNextImage } from '../image-search/index.js';
import { Database } from '../server.js';

test('busca imagem apenas com produto, marca e quantidade compatíveis', () => {
  const products = [{product_name:'Arroz', brands:'Camil', quantity:'5 kg', code:'12345678', image_front_url:'https://images.openfoodfacts.org/images/123/front.jpg'}, {product_name:'Arroz', brands:'Tio João', quantity:'5 kg', code:'45678901', image_front_url:'https://images.openfoodfacts.org/images/456/front.jpg'}];
  assert.equal(matchImage('Arroz Tio João 5000g', products)?.image_url, products[1].image_front_url);
  assert.equal(matchImage('Arroz Tio João 1kg', products), null);
  assert.equal(matchImage('Arroz 5kg', products), null);
  assert.equal(matchImage('Arroz Tio João 5kg', [{...products[1], image_front_url:'https://evil.example/image.jpg'}]), null);
});
test('consulta falha com erro HTTP e não confunde erro com resultado vazio', async () => {
  await assert.rejects(searchImage('Arroz Tio João 5kg', async () => ({ok:false, status:503})), /503/);
});
test('busca pendente salva imagem compartilhada e preserva fotos do supermercado', async () => {
  const db = new Database(':memory:');
  db.saveOffers('bom-lugar', [{name:'Arroz Tio João 5kg', price:2000}]);
  db.saveOffers('tauste', [{name:'Arroz Tio Joao pacote 5000g', price:2100}]);
  let calls = 0;
  await processNextImage(db, async () => { calls++; return {image_url:'https://images.openfoodfacts.org/a.jpg', source_url:'https://world.openfoodfacts.org/product/123'}; });
  assert.equal(calls, 1);
  assert.ok(db.offers().every(o => o.image_url === 'https://images.openfoodfacts.org/a.jpg'));
  const list = db.createList('Semana'); db.addItem(list, db.offers()[0].id);
  assert.equal(db.lists()[0].items[0].image_source, 'https://world.openfoodfacts.org/product/123');
  db.saveOffers('tauste', [{name:'Arroz Tio Joao pacote 5000g', price:2100, image_url:'https://tauste.com.br/arroz.jpg'}]);
  assert.ok(db.offers().every(o => o.image_url === 'https://tauste.com.br/arroz.jpg'));
  await processNextImage(db, async () => { calls++; return null; });
  assert.equal(calls, 1);
  db.close();
});
test('não aceita marca ou quantidade incompatível mesmo se o nome estiver correto', () => {
  const entry = {product_name:'Arroz Tio João 5kg', brands:'Camil', quantity:'5 kg', code:'12345678', image_front_url:'https://images.openfoodfacts.org/a.jpg'};
  assert.equal(matchImage('Arroz Tio João 5kg', [entry]), null);
  assert.equal(matchImage('Arroz Tio João 5kg', [{...entry, brands:'Tio João', quantity:'1 kg'}]), null);
});
test('falhas de rede entram em espera, sem marcar produto como encontrado', async () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Arroz Tio João 5kg', price:2000}]);
  await assert.rejects(processNextImage(db, async () => { throw Error('HTTP 503'); }), /503/);
  assert.equal(db.db.prepare('SELECT count(*) AS n FROM product_images').get().n, 0);
  assert.equal(await processNextImage(db, async () => { throw Error('não deve executar'); }), false);
  db.close();
});
test('busca por nome sem peso, mas ainda confirma quantidade no resultado', async () => {
  let terms;
  const result = await searchImage('Feijão Preto Broto Legal 1kg', async url => {
    terms = url.searchParams.get('search_terms');
    return {ok:true, json: async () => ({products:[{product_name:'Feijão preto', brands:'Broto Legal', quantity:'1 kg', code:'7896200115360', image_front_url:'https://images.openfoodfacts.org/images/789/front.jpg'}]})};
  });
  assert.equal(terms, 'Feijão Preto Broto Legal');
  assert.equal(result.source_url, 'https://world.openfoodfacts.org/product/7896200115360');
});
test('busca produtos sem tamanho informado, sem escolher uma embalagem desconhecida', async () => {
  const db = new Database(':memory:');
  db.saveOffers('bom-lugar', [{name:'Banana Prata kg',price:500}]);
  let searched;
  await processNextImage(db, async name => { searched=name; return null; });
  assert.equal(searched, 'Banana Prata kg');
  assert.equal(matchImage('Banana Prata kg', [{product_name:'Banana Prata',brands:'Marca',quantity:'1kg',code:'7891234567890',image_front_url:'https://images.openfoodfacts.org/a.jpg'}]), null);
  db.close();
});
test('atualizar um produto sem imagem permite nova busca após resultado vazio', async () => {
  const db = new Database(':memory:'); const offer = {name:'Arroz Camil 5kg',price:2000};
  db.saveOffers('tauste',[offer]);
  await processNextImage(db, async () => null);
  assert.equal(await processNextImage(db, async () => null), false);
  db.saveOffers('tauste',[offer]);
  let searched=0; await processNextImage(db, async () => { searched++; return null; });
  assert.equal(searched,1);
  db.close();
});
test('atualizações não removem o prazo de espera após falha da fonte de imagens', async () => {
  const db = new Database(':memory:'); const offer = {name:'Arroz Camil 5kg',price:2000};
  db.saveOffers('tauste',[offer]); await assert.rejects(processNextImage(db, async () => {throw Error('503');}));
  db.saveOffers('tauste',[offer]); assert.equal(await processNextImage(db, async () => null),false);
  db.close();
});
test('migra tentativas antigas sem apagar o banco', async () => {
  const {DatabaseSync} = await import('node:sqlite');
  const {mkdtempSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'ofertas-imagem-')), path=join(dir,'dados.sqlite3');
  const legacy=new DatabaseSync(path);
  legacy.exec("CREATE TABLE image_search_attempts(product_key TEXT PRIMARY KEY,retry_after TEXT NOT NULL); INSERT INTO image_search_attempts VALUES('produto',datetime('now','+7 days'));"); legacy.close();
  const db=new Database(path);
  try { assert.equal(db.db.prepare('SELECT outcome FROM image_search_attempts WHERE product_key=?').get('produto').outcome, 'miss'); }
  finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});
