import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterCatalog,sortCatalog} from '../src/catalog-filter.js';
const products=[{id:1,name:'Arroz',category:'Mercearia',offers:[{store:'a',price:1500,club_price:900,valid_until:'2099-01-01'},{store:'b',price:500,valid_until:'2000-01-01'}]},{id:2,name:'Sabão',category:'Limpeza',offers:[{store:'b',price:700,valid_until:null}]},{id:3,name:'Produto sem ofertas',category:'Mercearia',offers:[]}];
test('combina categoria, supermercado, faixa e validade na mesma oferta',()=>{
 const base={category:'',store:'',min:null,max:null,status:'all',today:'2026-10-30'};
 assert.deepEqual(filterCatalog(products,{...base,store:'a',min:800,max:1000,status:'active'}).map(p=>p.id),[1]);
 assert.deepEqual(filterCatalog(products,{...base,store:'b',min:800,max:1000,status:'active'}),[]);
 assert.deepEqual(filterCatalog(products,{...base,category:'Mercearia',status:'expired'}).map(p=>p.id),[1]);
 assert.equal(filterCatalog(products,base).length,3);
});
test('ordenação não modifica o catálogo',()=>{
 assert.deepEqual(sortCatalog(products,'name','asc').map(p=>p.id),[1,3,2]);assert.deepEqual(sortCatalog(products,'price','asc').map(p=>p.id),[1,2,3]);assert.deepEqual(products.map(p=>p.id),[1,2,3]);
});
