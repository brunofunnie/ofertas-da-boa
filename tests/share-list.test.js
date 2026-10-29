import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatShoppingList} from '../src/share-list.js';

test('formata lista para compartilhamento com lojas, condições e totais',()=>{
 const groups=[{name:'Mercado A',total:3500,items:[{name:'Arroz 5 kg',price:1500,quantity:2,checked:1},{name:'Maçã',price:500,quantity:1,price_unit:'kg',condition:'Clube',checked:0}]}];
 const text=formatShoppingList('Compra da semana',groups);
 assert.match(text,/Compra da semana/);assert.match(text,/Mercado A/);assert.match(text,/✓ 2 × Arroz 5 kg/);assert.match(text,/1 kg × Maçã \(Clube\)/);assert.match(text,/R\$\s?30,00/);assert.match(text,/Total: R\$\s?35,00/);
});

test('lista vazia continua compartilhável',()=>{assert.match(formatShoppingList('Semana',[]),/Total: R\$\s?0,00/)});
