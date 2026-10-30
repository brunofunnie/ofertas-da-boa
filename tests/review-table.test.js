import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterReviewOffers, sortReviewOffers} from '../src/review-table.js';

const stores={a:['São Mercado'],b:['Outro']};
const offers=[{id:1,name:'Feijão',store:'a',price:900,valid_until:'2026-11-05'}, {id:2,name:'Arroz',store:'b',price:300,valid_until:'2026-10-30'}, {id:3,name:'Leite',store:'a',price:500,valid_until:null}];
test('filtra produtos e supermercados sem diferenciar acentos ou caixa',()=>{
 assert.deepEqual(filterReviewOffers(offers,stores,'feijao').map(o=>o.id),[1]);
 assert.deepEqual(filterReviewOffers(offers,stores,'SAO mercado').map(o=>o.id),[1,3]);
 assert.deepEqual(filterReviewOffers(offers,stores,'ausente'),[]);
});
test('ordena por preço, produto e validade sem alterar dados originais',()=>{
 assert.deepEqual(sortReviewOffers(offers,stores,'price','asc').map(o=>o.id),[2,3,1]);
 assert.deepEqual(sortReviewOffers(offers,stores,'name','desc').map(o=>o.id),[3,1,2]);
 assert.deepEqual(sortReviewOffers(offers,stores,'valid_until','asc').map(o=>o.id),[2,1,3]);
 assert.deepEqual(offers.map(o=>o.id),[1,2,3]);
});
