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

test('extrai ofertas de vários posts e dos stories sem repetir imagens', async () => {
  const {fetchInstagramOffers} = await import('./index.js');
  const downloads = [], prompts = [];
  const original = globalThis.fetch, key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test';
  const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('cdninstagram')) { const body = JSON.parse(init.body); prompts.push(body.contents?.[0].parts[0].text ?? body.messages[0].content[0].text); const text = JSON.stringify({is_promotion:true,valid_from:'2020-01-01',valid_until:until,products:[{name:`Produto ${prompts.length}`,price:10}]}); return new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}],choices:[{message:{content:text}}]})); }
    downloads.push(String(url)); return new Response(Buffer.from('img'), {headers:{'content-type':'image/jpeg'}});
  };
  try {
    const collect = async () => ({posts:[{url:'https://www.instagram.com/p/A/',caption:'Válido até sexta',images:['https://scontent.cdninstagram.com/1.jpg','https://scontent.cdninstagram.com/2.jpg']}], stories:['https://scontent.cdninstagram.com/2.jpg','https://scontent.cdninstagram.com/3.jpg']});
    const offers = await fetchInstagramOffers('doma', {collect});
    assert.deepEqual(downloads, ['https://scontent.cdninstagram.com/1.jpg','https://scontent.cdninstagram.com/2.jpg','https://scontent.cdninstagram.com/3.jpg']);
    assert.deepEqual(offers.map(o => o.url), ['https://www.instagram.com/p/A/','https://www.instagram.com/p/A/','https://www.instagram.com/stories/doma/']);
    assert.match(prompts[0], /Válido até sexta/); assert.doesNotMatch(prompts[2], /legenda/);
    await assert.rejects(fetchInstagramOffers('doma', {collect:async () => ({posts:[{url:'x',caption:'',images:['https://evil.example/1.jpg']}],stories:[]})}), /inválido/);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});
