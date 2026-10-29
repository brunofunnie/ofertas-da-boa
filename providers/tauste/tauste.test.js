import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTauste } from './index.js';

test('importa produtos de um catálogo do Tauste', () => {
  const offers = parseTauste('<div class="product-item-info"><img><a class="product-item-link" href="https://tauste.com.br/arroz">Arroz 5kg</a><span class="price-wrapper" data-price-amount="19.90"></span></div>');
  assert.equal(offers[0].price, 1990);
  assert.equal(offers[0].name, 'Arroz 5kg');
});
test('Tauste usa nome do produto e preço final, preservando oferta de clube', () => {
  const html = `<div class="product-item-info"><a class="product-item-link" href="/marca">Marca</a><strong class="product-item-name"><a class="product-item-link" href="/produto.html">Café 500g</a></strong><img src="/media/amasty/amlabel/Clube.png"><span class="old-price"><span class="price-wrapper" data-price-type="oldPrice" data-price-amount="19.90"></span></span><span class="special-price"><span class="price-wrapper" data-price-type="finalPrice" data-price-amount="14.90"></span></span></div>`;
  const [offer] = parseTauste(html);
  assert.equal(offer.name, 'Café 500g');
  assert.equal(offer.price, 1490);
  assert.equal(offer.regular_price, 1990);
  assert.equal(offer.condition, 'Clube');
  assert.equal(offer.url, 'https://tauste.com.br/produto.html');
});
test('obtém a imagem do produto, sem confundir com selos de oferta', () => {
  const html = `<div class="product-item-info"><img class="product-image-photo" src="/media/catalog/product/arroz.jpg"><img src="/media/amasty/amlabel/Clube.png"><strong class="product-item-name"><a class="product-item-link" href="/arroz">Arroz 5kg</a></strong><span class="price-wrapper" data-price-type="finalPrice" data-price-amount="19.90"></span></div>`;
  assert.equal(parseTauste(html)[0].image_url, 'https://tauste.com.br/media/catalog/product/arroz.jpg');
});
