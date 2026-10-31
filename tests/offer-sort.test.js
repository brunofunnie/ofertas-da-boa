import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortOfferGroups } from '../src/offer-sort.js';

test('sorts filtered product groups by their lowest price or Portuguese name without mutation', () => {
  const groups = [[{ name: 'Banana', price: 900 }, { name: 'Banana', price: 100 }], [{ name: 'Água', price: 300 }], [{ name: 'Carne', price: 200 }]];
  const names = order => sortOfferGroups(groups, order).map(group => group[0].name);
  assert.deepEqual(names('price-asc'), ['Banana', 'Carne', 'Água']);
  assert.deepEqual(names('price-desc'), ['Água', 'Carne', 'Banana']);
  assert.deepEqual(names('name-asc'), ['Água', 'Banana', 'Carne']);
  assert.deepEqual(names('name-desc'), ['Carne', 'Banana', 'Água']);
  assert.equal(sortOfferGroups(groups, ''), groups);
  assert.equal(groups[0][0].name, 'Banana');
});
