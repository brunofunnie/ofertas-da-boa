import {test} from 'node:test';import assert from 'node:assert/strict';import {priceTrend, chartPoints} from '../src/price-history.js';
test('identifica alta e baixa com base nos dois últimos preços',()=>{
 assert.equal(priceTrend([{price:100},{price:120}]),1);assert.equal(priceTrend([{price:120},{price:100}]),-1);assert.equal(priceTrend([{price:100},{price:100}]),0);assert.equal(priceTrend([{price:100}]),0);assert.equal(priceTrend(),0);assert.equal(priceTrend([{price:100},{price:120},{price:110}]),-1);assert.equal(priceTrend([{price:100},{price:80},{price:90}]),1);
});
test('gráfico mantém um ponto por observação e trata preços iguais',()=>{
 assert.deepEqual(chartPoints([{price:100}]),[{x:160,y:70}]);const points=chartPoints([{price:100},{price:150},{price:100}]);assert.equal(points.length,3);assert.ok(points[1].y<points[0].y);assert.ok(points[0].x<points[1].x && points[1].x<points[2].x);assert.ok(chartPoints([{price:100},{price:100}]).every(p=>Number.isFinite(p.y)));
});
