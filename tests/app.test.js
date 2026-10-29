import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database, categorize, parsePrice } from '../server.js';

test('preços e categorias', () => {
  assert.equal(parsePrice('R$ 1.234,56'), 123456);
  assert.equal(categorize('Coxa de frango'), 'Carnes');
  assert.equal(categorize('Detergente'), 'Limpeza');
});
test('histórico e listas sobrevivem à atualização', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name: 'Arroz 5kg', price: 2000}]);
  db.saveOffers('tauste', [{name: 'Arroz 5kg', price: 1800}]);
  const offer = db.offers()[0];
  assert.equal(offer.previous_price, 2000);
  const id = db.createList('Semana');
  db.addItem(id, offer.id);
  assert.equal(db.lists()[0].items.length, 1);
  db.close();
});
test('busca no grafo de termos tolera acentos, erros e ordem das palavras', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Sabão em pó Omo 1kg', price:2000}, {name:'Arroz branco 5kg', price:1800}, {name:'Sabonete líquido', price:900}]);
  assert.deepEqual(db.search('omo sabao').map(o => o.name), ['Sabão em pó Omo 1kg']);
  assert.deepEqual(db.search('sbao').map(o => o.name), ['Sabão em pó Omo 1kg']);
  assert.deepEqual(db.search('aroz').map(o => o.name), ['Arroz branco 5kg']);
  assert.equal(db.search('xyz').length, 0);
  db.close();
});
test('preço anunciado e condição são persistidos sem sobrescrever histórico', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Café', price:1500, regular_price:2000, condition:'Clube'}]);
  db.saveOffers('tauste', [{name:'Café', price:1400, regular_price:1900, condition:'Clube'}]);
  const offer = db.offers()[0];
  assert.equal(offer.previous_price, 1500);
  assert.equal(offer.regular_price, 1900);
  assert.equal(offer.condition, 'Clube');
  db.close();
});
test('folhetos vencidos não aparecem na busca, mas continuam nas listas', () => {
  const db = new Database(':memory:');
  db.saveOffers('bom-lugar', [{name:'Café', price:1500, valid_until:'2000-01-01', club_price:1300, extracted:true}]);
  const offer = db.db.prepare('SELECT * FROM offers WHERE name=?').get('Café');
  const list = db.createList('Semana'); db.addItem(list, offer.id);
  assert.equal(db.offers().length, 0);
  assert.equal(db.search('cafe').length, 0);
  assert.equal(db.lists()[0].items[0].valid_until, '2000-01-01');
  assert.equal(offer.club_price, 1300);
  assert.equal(offer.extracted, 1);
  db.close();
});
test('imagem do produto é preservada quando uma atualização não traz imagem', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Arroz 5kg', price:2000, image_url:'https://tauste.com.br/arroz.jpg'}]);
  db.saveOffers('tauste', [{name:'Arroz 5kg', price:1800}]);
  const offer = db.offers()[0];
  const id = db.createList('Semana'); db.addItem(id, offer.id);
  assert.equal(offer.image_url, 'https://tauste.com.br/arroz.jpg');
  assert.equal(db.lists()[0].items[0].image_url, offer.image_url);
  db.close();
});
test('imagem é compartilhada entre mercados do mesmo produto, inclusive na lista e busca', () => {
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Arroz Tio João 5kg', price:2000, image_url:'https://tauste.com.br/arroz.jpg', valid_until:'2000-01-01'}]);
  db.saveOffers('bom-lugar', [{name:'Arroz Tio Joao pacote 5000g', price:1800}, {name:'Arroz Camil 5kg', price:1700}]);
  const offers = db.offers();
  const match = offers.find(o => o.name.includes('Joao'));
  const other = offers.find(o => o.name.includes('Camil'));
  assert.equal(match.image_url, 'https://tauste.com.br/arroz.jpg');
  assert.equal(other.image_url, null);
  assert.equal(db.search('joao')[0].image_url, match.image_url);
  const id = db.createList('Semana'); db.addItem(id, match.id);
  assert.equal(db.lists()[0].items[0].image_url, match.image_url);
  db.close();
});
test('renomeia lista e atualiza quantidade preservando os itens', async () => {
  const {createApp} = await import('../server.js');
  const db = new Database(':memory:');
  db.saveOffers('tauste', [{name:'Arroz 5kg',price:2000}]);
  const list = db.createList('Semana'); const offer = db.offers()[0]; db.addItem(list, offer.id);
  const server = createApp(db,undefined,{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})}); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (path, data) => fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  try {
    assert.equal((await post('rename-list', {id:list, name:'Mês'})).status, 200);
    assert.equal((await post('quantity', {list_id:list, offer_id:offer.id, quantity:3})).status, 200);
    assert.equal(db.lists()[0].name, 'Mês'); assert.equal(db.lists()[0].items[0].quantity, 3);
    assert.equal((await post('quantity', {list_id:list, offer_id:offer.id, quantity:0})).status, 400);
    assert.equal((await post('rename-list', {id:list, name:'  '})).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
