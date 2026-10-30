import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageType, downloadImage} from '../image-store.js';

test('aceita somente formatos de imagem reconhecidos pelo conteúdo', () => {
  assert.equal(imageType(Buffer.from('89504e470d0a1a0a','hex')), 'image/png');
  assert.equal(imageType(Buffer.from('ffd8ff00','hex')), 'image/jpeg');
  assert.equal(imageType(Buffer.from('<svg onload=alert(1)>')), null);
});

test('download rejeita endereços inseguros, redirecionamentos e imagens inválidas', async () => {
  await assert.rejects(downloadImage('http://localhost/image'));
  await assert.rejects(downloadImage('https://example.com/image', async () => new Response('x', {status:302, headers:{location:'http://localhost'}})));
  await assert.rejects(downloadImage('https://example.com/image', async () => new Response('bad')));
});

test('edição protegida salva uma imagem compartilhada e preserva alterações futuras do fornecedor', async () => {
  const {Database,createApp}=await import('../server.js');
  const db=new Database(':memory:'); db.saveOffers('a',[{name:'Arroz Teste 5kg',price:1000}]); db.saveOffers('b',[{name:'Arroz Teste 5kg',price:1200}]);
  const product=db.catalog()[0], bytes=Buffer.from('89504e470d0a1a0a0000','hex'), key='a'.repeat(64);
  const imageStore={put:async data=>{assert.deepEqual(data,bytes);return key;},get:async()=>({bytes,type:'image/png'})};
  let admin=false;const server=createApp(db,[],{imageStore,resolveUser:()=>admin ? {sub:'admin',admin:true} : null});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const post=()=>fetch(`${base}/api/admin/product/image`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:product.id,image:bytes.toString('base64')})});
    assert.equal((await post()).status,401);admin=true;assert.equal((await post()).status,200);
    db.saveOffers('a',[{name:'Arroz Teste 5kg',price:1100,image_url:'https://example.com/new.jpg'}]);
    const offers=db.offers();assert.equal(offers.length,2);assert.equal(offers[0].image_url,offers[1].image_url);
    assert.equal(offers[0].image_url,`/api/product-image/${product.id}/${key}`);
    const image=await fetch(base+offers[0].image_url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});

test('ao excluir produtos, remove a imagem apenas quando não há outros produtos usando-a e retenta falhas', async () => {
  const {Database,createApp}=await import('../server.js'); const db=new Database(':memory:');
  db.saveOffers('a',[{name:'Arroz Teste 5kg',price:1000},{name:'Feijao Teste 1kg',price:1000}]);
  const key='b'.repeat(64); db.db.prepare('UPDATE products SET image_r2_key=?').run(key);
  let fail=false; const removed=[];const store={delete:async value=>{if(fail)throw Error('offline');removed.push(value);}};
  const server=createApp(db,[],{imageStore:store,resolveUser:()=>({sub:'admin',admin:true})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function remove(product){return fetch(`${base}/api/admin/product/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:product.id,expected:{offer_ids:product.offers.map(x=>x.id),list_count:product.list_count,history_count:product.history_count}})});}
  try {
    let [first,second]=db.catalog();assert.equal((await remove(first)).status,200);assert.deepEqual(removed,[]);
    fail=true;assert.equal((await remove(second)).status,200);assert.deepEqual(removed,[]);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM image_deletion_queue').get().n,1);
    await new Promise(resolve=>server.close(resolve)); fail=false;
    const retry=createApp(db,[],{imageStore:store});await new Promise(resolve=>retry.listen(0,'127.0.0.1',resolve));
    try {await new Promise(resolve=>setTimeout(resolve,1200));assert.deepEqual(removed,[key]);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM image_deletion_queue').get().n,0);} finally {await new Promise(resolve=>retry.close(resolve));}
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});

test('exclusão no R2 usa a chave validada e o bucket correto', async () => {
  const {createImageStore}=await import('../image-store.js'); const commands=[];
  const store=createImageStore(JSON.stringify({account:'a'.repeat(32),id:'b'.repeat(32),token:'secret'}),{send:async command=>commands.push(command)});
  await assert.rejects(store.delete('../other'));
  await store.delete('c'.repeat(64));
  assert.equal(commands.length,1);assert.equal(commands[0].constructor.name,'DeleteObjectCommand');
  assert.equal(commands[0].input.Bucket,'ofertas-da-boa-images');assert.equal(commands[0].input.Key,'c'.repeat(64));
});
