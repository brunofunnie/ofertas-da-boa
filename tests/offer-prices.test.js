import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupStorePrices } from '../src/offer-prices.js';
import { Database } from '../server.js';

test('agrupa loja, elimina duplicatas e preserva condições e unidades', () => {
 const rows=[{id:1,store:'a',price:500,condition:'',price_unit:'un',updated:'2026-01-01',club_price:450},{id:2,store:'a',price:500,condition:'',price_unit:'un',updated:'2026-01-02'},{id:3,store:'a',price:400,condition:'Atacado',price_unit:'un',updated:'2026-01-02'},{id:4,store:'b',price:500,condition:'',price_unit:'un',updated:'2026-01-02'},{id:5,store:'a',price:500,condition:'',price_unit:'kg',updated:'2026-01-02'}];
 const groups=groupStorePrices(rows);
 assert.equal(groups.length,3);assert.deepEqual(groups[0].prices.map(v=>[v.price,v.label,v.priceType]),[[500,'', 'regular'],[450,'Clube','club'],[400,'Atacado','regular']]);
 const equal=groupStorePrices([{...rows[0],condition:'Clube',club_price:null},{...rows[1],condition:''}]);assert.equal(equal[0].prices.length,1);assert.equal(equal[0].prices[0].label,'');
});

test('lista mantém a condição de clube ao adicionar e usa o preço atualizado', () => {
 const db=new Database(':memory:');try {db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1000,club_price:800}]);const offer=db.offers()[0],list=db.createList('Semana');db.addItem(list,offer.id,'club');assert.equal(db.lists()[0].items[0].price,800);db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1100,club_price:850}]);assert.equal(db.lists()[0].items[0].price,850);assert.equal(db.lists()[0].items[0].condition,'Clube');db.saveOffers('a',[{name:'Arroz Camil 5kg',price:1100}]);assert.equal(db.lists()[0].items[0].price,1100);assert.match(db.lists()[0].items[0].condition,/indisponível/);}finally{db.close();}
});
