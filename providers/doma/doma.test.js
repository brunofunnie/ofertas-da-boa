import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOffers } from './index.js';

test('Doma lê 7 posts e os stories do Instagram e exige cookies', async () => {
  let args;
  const offers = await fetchOffers(undefined, async (username, options) => { args = [username, options]; return [{name:'Arroz',price:1000}]; });
  assert.deepEqual(args, ['domasupermercado', {posts:7, stories:true}]);
  assert.equal(offers.length, 1);
  await assert.rejects(fetchOffers(undefined, async () => null), /cookies/i);
});
