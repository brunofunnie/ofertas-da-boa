import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCookies, readPostImages } from './index.js';

test('aceita cookies exportados e limita ao domínio do Instagram', () => {
  const cookies = normalizeCookies([{domain:'.instagram.com', name:'sessionid', value:'secret', path:'/', expirationDate:1800000000, sameSite:'no_restriction', secure:true, httpOnly:true}, {domain:'evil.com',name:'bad',value:'x'}]);
  assert.deepEqual(cookies, [{domain:'.instagram.com', name:'sessionid', value:'secret', path:'/', expires:1800000000, sameSite:'None', secure:true, httpOnly:true}]);
  assert.throws(() => normalizeCookies([{domain:'evil.com',name:'sessionid',value:'x'}]), /sessão/);
});

test('coleta todas as imagens do carrossel e mantém a URL da publicação', async () => {
  let slide = 0;
  const page = { currentImages: async () => [['https://cdn.example/1.jpg'], ['https://cdn.example/2.jpg']][slide], next: async () => ++slide < 2 };
  assert.deepEqual(await readPostImages(page), ['https://cdn.example/1.jpg','https://cdn.example/2.jpg']);
});

test('reconhece a URL canônica que o Instagram usa ao abrir o post', async () => {
  const {isPostUrl}=await import('./index.js');
  assert.equal(isPostUrl('/santosupermercados/p/AbC123/', '/p/AbC123/'),true);
  assert.equal(isPostUrl('/santosupermercados/p/AbC123/', '/santosupermercados/p/AbC123/'),true);
  assert.equal(isPostUrl('/santosupermercados/p/AbC123/', '/p/Outro/'),false);
  assert.equal(isPostUrl('/santosupermercados/p/AbC123/', '/reel/AbC123/'),false);
});
