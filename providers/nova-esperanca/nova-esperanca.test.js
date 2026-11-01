import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findFlyers,parseFlyer,importFlyers} from './index.js';

const base='https://supermercadonovaesperanca.com.br';
test('encontra apenas imagens originais da galeria de ofertas no domínio da loja',()=>{
  const html=`<main><div class="elementor-widget-image-gallery"><figure class="gallery-item"><a href="/wp-content/uploads/2026/10/folheto.jpg"><img src="/thumb.jpg"></a></figure><figure class="gallery-item"><a href="${base}/wp-content/uploads/2026/10/folheto.jpg"></a></figure><figure class="gallery-item"><a href="https://evil.test/wp-content/uploads/fake.jpg"></a></figure></div></main><a href="${base}/wp-content/uploads/logo.jpg">fora</a>`;
  assert.deepEqual(findFlyers(html),[`${base}/wp-content/uploads/2026/10/folheto.jpg`]);
});
test('valida a vigência e preserva o preço por quilo',()=>{
  const data={valid_from:'2026-10-30',valid_until:'2026-10-30',products:[{name:'Maçã Fuji',price:7.29,price_unit:'kg'},{name:'Ovos 30 unidades',price:16.5,price_unit:'un'},{name:'Inválido',price:0}]};
  assert.deepEqual(parseFlyer(data,'https://loja.test','2026-10-30').map(x=>[x.name,x.price,x.price_unit]),[['Maçã Fuji',729,'kg'],['Ovos 30 unidades',1650,'un']]);
  assert.deepEqual(parseFlyer(data,'https://loja.test','2026-10-31'),[]);
  assert.deepEqual(parseFlyer({...data,valid_until:'2026-02-30'},'https://loja.test','2026-10-30'),[]);
});
test('busca as imagens e interpreta cada folheto sem aceitar conteúdos que não são imagens',async()=>{
 const html=`<main><div class="elementor-widget-image-gallery"><figure class="gallery-item"><a href="/wp-content/uploads/folheto.jpg"></a></figure></div></main>`;
 const ai=async()=>JSON.stringify({valid_from:'2026-10-30',valid_until:'2026-10-30',products:[{name:'Arroz 5kg',price:19.9,price_unit:'un'}]});
 const image=async()=>new Response(Buffer.from('image'),{headers:{'content-type':'image/jpeg'}});
 const offers=await importFlyers(html,'2026-10-30',{fetcher:image,read:ai});assert.equal(offers[0].price,1990);assert.equal(offers[0].url,`${base}/wp-content/uploads/folheto.jpg`);
 await assert.rejects(importFlyers(html,'2026-10-30',{fetcher:async()=>new Response('x',{headers:{'content-type':'text/html'}}),read:ai}));
});
test('preserva ofertas lidas quando outro folheto falha e sinaliza atualização parcial',async()=>{
 const html=`<main><div class="elementor-widget-image-gallery"><figure class="gallery-item"><a href="/wp-content/uploads/1.jpg"></a></figure><figure class="gallery-item"><a href="/wp-content/uploads/2.jpg"></a></figure></div></main>`;
 const fetcher=async url=>String(url).endsWith('/2.jpg') ? new Response('',{status:503}) : new Response('image',{headers:{'content-type':'image/jpeg'}});
 const read=async()=>JSON.stringify({valid_from:'2026-10-30',valid_until:'2026-10-31',products:[{name:'Leite 1L',price:5}]});
 const offers=await importFlyers(html,'2026-10-30',{fetcher,read});assert.equal(offers.length,1);assert.equal(offers.warnings.length,1);
});

test('folhetos vencidos são informados em vez de erro genérico',async()=>{
 const html=`<main><div class="elementor-widget-image-gallery"><figure class="gallery-item"><a href="/wp-content/uploads/folheto.jpg"></a></figure></div></main>`;
 const read=async()=>JSON.stringify({valid_from:'2026-10-27',valid_until:'2026-10-29',products:[{name:'Arroz 5kg',price:19.9}]});
 const fetcher=async()=>new Response(Buffer.from('image'),{headers:{'content-type':'image/jpeg'}});
 await assert.rejects(importFlyers(html,'2026-11-01',{fetcher,read}),error=>error.warning===true && /vencidos/.test(error.message));
 assert.deepEqual(await importFlyers(html,'2026-11-01',{fetcher,read:async()=>JSON.stringify({products:[]})}),[]);
});
