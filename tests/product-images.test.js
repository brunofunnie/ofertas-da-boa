import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../server.js';

test('ignora imagens antigas do Open Food Facts e compartilha imagens de supermercados', () => {
  const db = new Database(':memory:');
  try {
    db.saveOffers('mercado-a', [{name:'Arroz Camil 5kg',price:1000}]);
    const key = db.offers()[0].product_key;
    db.db.prepare('UPDATE products SET image_url=?,image_source=? WHERE product_key=?').run('https://images.openfoodfacts.org/a.jpg','https://world.openfoodfacts.org/product/123',key);
    assert.equal(db.offers()[0].image_url,null);
    assert.equal(db.db.prepare('SELECT image_url FROM products WHERE product_key=?').get(key).image_url,'https://images.openfoodfacts.org/a.jpg');
    db.saveOffers('mercado-b', [{name:'Arroz Camil 5kg',price:1100,image_url:'https://mercado.example/arroz.jpg'}]);
    assert.ok(db.offers().every(offer=>offer.image_url==='https://mercado.example/arroz.jpg'));
    db.db.prepare('UPDATE products SET image_url=?,image_source=? WHERE product_key=?').run('https://images.openfoodfacts.org/a.jpg','https://world.openfoodfacts.org/product/123',key);
    assert.ok(db.offers().every(offer=>offer.image_url==='https://mercado.example/arroz.jpg'));
  } finally { db.close(); }
});
