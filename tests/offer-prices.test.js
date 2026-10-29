import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEqualPrices } from '../src/offer-prices.js';
import { Database } from '../server.js';

test('reúne preços iguais de lojas diferentes e preserva condições e unidades', () => {
 const rows=[{id:1,store:'a',price:500,condition:'',price_unit:'un',updated:'2026-01-01',club_price:450},{id:2,store:'a',price:500,condition:'',price_unit:'un',updated:'2026-01-02',club_price:450},{id:3,store:'a',price:400,condition:'Atacado',price_unit:'un',updated:'2026-01-02'},{id:4,store:'b',price:500,condition:'',price_unit:'un',updated:'2026-01-02'},{id:5,store:'a',price:500,condition:'',price_unit:'kg',updated:'2026-01-02'}];
 const groups=groupEqualPrices(rows);
 assert.equal(groups.length,3);assert.deepEqual(groups[0].offers.map(o=>o.id),[2,4]);assert.equal(groups[0].offers[0].club_price,450);
 assert.equal(groups[1].offers[0].condition,'Atacado');assert.equal(groups[2].unit,'kg');
});

test('lista mantém a condição de clube ao adicionar e usa o preço atualizado', () => {
 const db=new Database(':memory:');try {db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1000,club_price:800}]);const offer=db.offers()[0],list=db.createList('Semana');db.addItem(list,offer.id,'club');assert.equal(db.lists()[0].items[0].price,800);db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1100,club_price:850}]);assert.equal(db.lists()[0].items[0].price,850);assert.equal(db.lists()[0].items[0].condition,'Clube');db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1100}]);assert.equal(db.lists()[0].items[0].price,1100);assert.match(db.lists()[0].items[0].condition,/indisponível/);}finally{db.close();}
});
