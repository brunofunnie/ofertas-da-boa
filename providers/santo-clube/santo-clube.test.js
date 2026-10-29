import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProduct, fetchOffers} from './index.js';

test('interpreta promoção de loja e imagem do Santo', () => {
  const p = parseProduct({id:'568204',name:'Hamburguer Sadia 113g Bovino',salePrice:4.99,liquidPrice:0.99,stock:3,continuousStockProduct:false,weighable:false,imageUrl:'https://www.crescevendas.com/ecommerce/disk/a.png',discounts:[{type:'Loja',promotion:'R$ 0,99'}]});
  assert.equal(p.price,99); assert.equal(p.regular_price,499); assert.equal(p.condition,'');
  assert.equal(p.image_url,'https://www.crescevendas.com/ecommerce/disk/a.png');
  assert.equal(p.url,'https://santoclube.crescevendas.com/ecommerce/produto/568204');
});
test('sinaliza desconto do aplicativo e preço por quilo e descarta sem estoque', () => {
  const p = {id:'123',name:'Batata kg',salePrice:7.49,liquidPrice:3.99,stock:2,weighable:true,discounts:[{type:'Aplicativo',promotion:'R$ 3,99'}]};
  assert.equal(parseProduct(p).condition,'Aplicativo'); assert.equal(parseProduct(p).price_unit,'kg');
  assert.equal(parseProduct({...p, stock:0, continuousStockProduct:false}),null);
  assert.equal(parseProduct({...p, stock:0, continuousStockProduct:true}).price,399);
  assert.equal(parseProduct({...p, liquidPrice:1, discounts:[{type:'Cashback',promotion:'25% Cashback'}]}).price,749);
});
test('percorre promoções e evita duplicatas dos setores', async () => {
  const p={id:'123',name:'Produto 1kg',salePrice:10,liquidPrice:8,stock:1,discounts:[{type:'Loja',promotion:'R$ 8,00'}]};
  const calls=[];
  const request=async (query,variables)=>{calls.push(variables); if(query.includes('home {')) return {home:{carousels:[{products:[p]}],categories:[{name:'Mercearia',products:[p]}]}}; return {carouselProducts:{pageInfo:{hasNextPage:false},edges:[{node:p}]}}};
  const offers=await fetchOffers(undefined,request,async () => []);
  assert.equal(offers.length,1);assert.equal(offers[0].price,800);assert.equal(calls.length,2);
});
test('não confunde produtos distintos com o mesmo nome', async () => {
  const p = {id:'1', name:'Leite 1L', salePrice:10, liquidPrice:10, stock:1, discounts:[]};
  const request=async q => q.includes('home {') ? {home:{categories:[],carousels:[{products:[p,{...p,id:'2'}]}]}} : {carouselProducts:{pageInfo:{hasNextPage:false},edges:[]}};
  assert.deepEqual(await fetchOffers(undefined,request,async () => []), []);
});
test('desconto do aplicativo é indicado mesmo com desconto de loja no mesmo preço', () => {
  const p={id:'1',name:'Café 500g',salePrice:10,liquidPrice:5,stock:1,discounts:[{type:'Loja',promotion:'R$ 5,00'},{type:'Aplicativo',promotion:'R$ 5,00'}]};
  assert.equal(parseProduct(p).condition,'Aplicativo');
});

test('incorpora ofertas do Instagram ao catálogo do mesmo supermercado', async () => {
  const p={id:'1',name:'Arroz 5kg',salePrice:10,liquidPrice:10,stock:1,discounts:[]};
  const request=async q => q.includes('home {') ? {home:{categories:[],carousels:[{products:[p]}]}} : {carouselProducts:{pageInfo:{hasNextPage:false},edges:[]}};
  const offers=await fetchOffers(undefined,request,async () => [{name:'Feijão 1kg',price:800,url:'https://www.instagram.com/p/abc/'}]);
  assert.equal(offers.length,2); assert.equal(offers[1].price,800);
});

test('atualiza o site mesmo se o Instagram falhar e sinaliza a falha', async () => {
  const p={id:'1',name:'Arroz 5kg',salePrice:10,liquidPrice:10,stock:1,discounts:[]};
  const request=async q => q.includes('home {') ? {home:{categories:[],carousels:[{products:[p]}]}} : {carouselProducts:{pageInfo:{hasNextPage:false},edges:[]}};
  const offers=await fetchOffers(undefined,request,async () => {throw Error('Sessão expirada');});
  assert.equal(offers.length,1); assert.match(offers.warnings[0],/Instagram/);
});
test('atualiza Instagram quando o catálogo estiver indisponível', async () => {
  const offers=await fetchOffers(undefined,async () => {throw Error('Fora do ar');},async () => [{name:'Feijão 1kg',price:800}]);
  assert.equal(offers.length,1); assert.match(offers.warnings[0],/site/i);
});
