import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findFlyers, parseFlyer} from './index.js';
process.env.AI_CONFIG_PATH = `/tmp/ofertas-test-config-ausente-${process.pid}.json`;

test('descobre folhetos da seção de ofertas sem buscar imagens de propaganda', () => {
  const html = '<section><h2>Ofertas da semana</h2><img src="https://static.wixstatic.com/media/abc~mv2.jpg/v1/fit/test"><img src="https://static.wixstatic.com/media/abc~mv2.jpg/v1/fill/test"></section><section><img src="https://static.wixstatic.com/media/logo.png"></section>';
  assert.deepEqual(findFlyers(html), ['https://static.wixstatic.com/media/abc~mv2.jpg']);
});
test('guarda preços distintos e ignora ofertas inválidas ou sem validade', () => {
  const data = {valid_from:'2026-10-26', valid_until:'2026-10-29', products:[{name:'Arroz 5kg', price:21.99, club_price:19.99},{name:'Inválido',price:null,club_price:2}]};
  const items = parseFlyer(data, 'https://example.com/flyer.jpg', '2026-10-29');
  assert.equal(items.length, 1); assert.equal(items[0].price, 2199); assert.equal(items[0].club_price, 1999); assert.equal(items[0].valid_until, '2026-10-29');
  assert.equal(parseFlyer(data, 'https://example.com/flyer.jpg', '2026-10-30').length, 0);
  assert.equal(parseFlyer({...data,valid_until:null}, 'https://example.com/flyer.jpg', '2026-10-29').length, 0);
});

test('Instagram ignora imagens sem promoção confirmada ou sem produto', async () => {
  const {extractFlyerImage} = await import('./index.js');
  const original=globalThis.fetch, key=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test';
  let data={is_promotion:false,valid_from:'2026-10-01',valid_until:'2026-10-31',products:[{name:'Arroz',price:10}]};
  globalThis.fetch=async () => new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(data)}]}}]}));
  try {
    assert.deepEqual(await extractFlyerImage(Buffer.from('x'),'image/jpeg','https://instagram.com/p/x','2026-10-29',{requirePromotion:true}),[]);
    data={...data,is_promotion:true,products:[]};
    assert.deepEqual(await extractFlyerImage(Buffer.from('x'),'image/jpeg','https://instagram.com/p/x','2026-10-29',{requirePromotion:true}),[]);
    data={...data,products:[{name:'Arroz 5kg',price:10}]};
    assert.equal((await extractFlyerImage(Buffer.from('x'),'image/jpeg','https://instagram.com/p/x','2026-10-29',{requirePromotion:true})).length,1);
  } finally { globalThis.fetch=original; if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key; }
});

test('explica quando a API de leitura atinge o limite de requisições', async () => {
  const {extractFlyerImage}=await import('./index.js'); const original=globalThis.fetch, key=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test'; globalThis.fetch=async () => new Response('',{status:429});
  try {await assert.rejects(extractFlyerImage(Buffer.from('x'),'image/jpeg','https://example.com','2026-10-29'), /limite.*Gemini/i);}
  finally {globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});

test('Bom Lugar informa folhetos vencidos quando nenhum está vigente', async () => {
  const {importBomLugar} = await import('./index.js');
  const original=globalThis.fetch, key=process.env.GEMINI_API_KEY, path=process.env.AI_CONFIG_PATH;
  process.env.GEMINI_API_KEY='test'; process.env.AI_CONFIG_PATH='/nonexistent/ai-config.json';
  const html='<section><h2>Ofertas da semana</h2><img src="https://static.wixstatic.com/media/folheto.jpg/v1/fill/w_500/folheto.jpg"></section>';
  const text=JSON.stringify({valid_from:'2026-10-27',valid_until:'2026-10-29',products:[{name:'Arroz 5kg',price:10}]});
  globalThis.fetch=async url => String(url).includes('wixstatic') ? new Response(Buffer.from('x'),{headers:{'content-type':'image/jpeg'}}) : new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}],choices:[{message:{content:text}}]}));
  try { await assert.rejects(importBomLugar(html,'2026-11-01'),/vencidos/); }
  finally { globalThis.fetch=original; if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key; if(path===undefined)delete process.env.AI_CONFIG_PATH;else process.env.AI_CONFIG_PATH=path; }
});
