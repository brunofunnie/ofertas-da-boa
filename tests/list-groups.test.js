import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupListItems } from '../src/list-groups.js';

test('agrupa itens por supermercado e soma todos os preços em centavos', () => {
  const items = [{store:'tauste',price:1200,checked:1},{store:'bom-lugar',price:450},{store:'tauste',price:350}];
  const stores = {tauste:['Tauste'], 'bom-lugar':['Bom Lugar']};
  const groups = groupListItems(items, stores);
  assert.deepEqual(groups.map(g => [g.name, g.total, g.items.length]), [['Bom Lugar',450,1],['Tauste',1550,2]]);
  assert.equal(groups.reduce((sum,g) => sum+g.total,0), 2000);
  assert.deepEqual(groupListItems([], stores), []);
});
test('multiplica o preço pela quantidade em cada subtotal', () => {
  const groups = groupListItems([{store:'tauste',price:1250,quantity:3},{store:'tauste',price:90,quantity:2}], {tauste:['Tauste']});
  assert.equal(groups[0].total, 3930);
});
