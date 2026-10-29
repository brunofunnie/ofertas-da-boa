import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database, createApp } from '../server.js';

test('API informa o total de produtos cadastrados, incluindo ofertas vencidas', async () => {
 const db = new Database(':memory:');
 db.saveOffers('a', [{name:'Arroz Camil 5kg',price:1000}, {name:'Feijão Azul 1kg',price:500,valid_until:'2000-01-01'}]);
 db.saveOffers('b', [{name:'Arroz Camil 5kg',price:1100}]);
 const server = createApp(db, []);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const data=await (await fetch(`http://127.0.0.1:${server.address().port}/api/data`)).json();assert.equal(data.total_products,2);assert.equal(data.offers.length,2);}
 finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
