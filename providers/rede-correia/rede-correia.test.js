import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPdfs,importFlyers} from './index.js';

test('seleciona o PDF de ofertas do domínio do supermercado',()=>{
 const html='<div class="wrap_corpo"><a class="bt_arquivo" href="/uploads/pagina3/folheto.pdf">PDF</a><iframe src="/uploads/pagina3/folheto.pdf"></iframe><a class="bt_arquivo" href="https://evil.test/uploads/pagina3/mal.pdf">fora</a><a class="bt_arquivo" href="/uploads/pagina3/outro.png">imagem</a></div>';
 assert.deepEqual(findPdfs(html),['https://www.redecorreia.com.br/uploads/pagina3/folheto.pdf']);
});
test('lê cada página com sua própria validade e preserva preço de clube',async()=>{
 const html='<div class="wrap_corpo"><a class="bt_arquivo" href="/uploads/pagina3/folheto.pdf">PDF</a></div>';
 const fetcher=async()=>new Response(Buffer.from('%PDF-test'),{headers:{'content-type':'application/pdf'}});
 const render=async()=>[Buffer.from('a'),Buffer.from('b')];
 const read=async(_p,image)=>JSON.stringify(image.toString()==='a' ? {valid_from:'2026-10-28',valid_until:'2026-10-30',products:[{name:'Feijão 1kg',price:8.49,club_price:7.99,club_min_quantity:1}]} : {valid_from:'2026-10-28',valid_until:'2026-11-03',products:[{name:'Maçã Gala',price:5.99,price_unit:'kg'}]});
 const offers=await importFlyers(html,'2026-10-30',{fetcher,render,read});assert.deepEqual(offers.map(o=>[o.name,o.price,o.club_price,o.price_unit,o.valid_until]),[['Feijão 1kg',849,799,'un','2026-10-30'],['Maçã Gala',599,null,'kg','2026-11-03']]);
 const later=await importFlyers(html,'2026-10-31',{fetcher,render,read});assert.deepEqual(later.map(o=>o.name),['Maçã Gala']);
 await assert.rejects(importFlyers(html,'2026-10-30',{fetcher:async()=>new Response('invalid',{headers:{'content-type':'text/html'}}),render,read}));
});
test('continua a coleta quando uma página falha e registra aviso',async()=>{
 const html='<div class="wrap_corpo"><a class="bt_arquivo" href="/uploads/pagina3/folheto.pdf">PDF</a></div>';
 const fetcher=async()=>new Response(Buffer.from('%PDF-test'),{headers:{'content-type':'application/pdf'}});
 const render=async()=>[Buffer.from('a'),Buffer.from('b')];
 const read=async(_p,page)=>{if(page.toString()==='b')throw Error('Erro de leitura');return JSON.stringify({valid_from:'2026-10-28',valid_until:'2026-11-03',products:[{name:'Arroz',price:10}]});};
 const offers=await importFlyers(html,'2026-10-30',{fetcher,render,read});assert.equal(offers.length,1);assert.equal(offers.warnings.length,1);
});

test('descarta preços de clube com quantidade mínima ou condição desconhecida',async()=>{
 const html='<div class="wrap_corpo"><a class="bt_arquivo" href="/uploads/pagina3/folheto.pdf">PDF</a></div>';
 const fetcher=async()=>new Response(Buffer.from('%PDF-test'),{headers:{'content-type':'application/pdf'}});
 const read=async()=>JSON.stringify({valid_from:'2026-10-28',valid_until:'2026-11-03',products:[{name:'A',price:10,club_price:8,club_min_quantity:2},{name:'B',price:10,club_price:8},{name:'C',price:10,club_price:8,club_min_quantity:1}]});
 const offers=await importFlyers(html,'2026-10-30',{fetcher,render:async()=>[Buffer.from('a')],read});assert.deepEqual(offers.map(o=>o.club_price),[null,null,800]);
});
