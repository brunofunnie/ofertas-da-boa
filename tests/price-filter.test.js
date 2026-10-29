import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePriceBound, matchesPriceRange} from '../src/price-filter.js';

test('interpreta valores em reais com até dois decimais sem arredondar', () => {
 assert.equal(parsePriceBound(''),null);assert.equal(parsePriceBound(' 12,50 '),1250);assert.equal(parsePriceBound('0.05'),5);assert.equal(parsePriceBound('12'),1200);
 for(const value of ['-1','1,234','abc','12,','1.000,00']) assert.equal(parsePriceBound(value),undefined);
});
test('inclui limites e preços de clube, rejeitando valores fora do intervalo', () => {
 assert.equal(matchesPriceRange({price:1000},1000,1000),true);
 assert.equal(matchesPriceRange({price:1500,club_price:900},800,1000),true);
 assert.equal(matchesPriceRange({price:1500,club_price:0},800,1000),false);
 assert.equal(matchesPriceRange({price:500},null,1000),true);
 assert.equal(matchesPriceRange({price:1500},1000,null),true);
});
