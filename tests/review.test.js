import {test} from 'node:test';import assert from 'node:assert/strict';import {Database,createApp} from '../server.js';
test('preços extraídos por IA aguardam aprovação e rejeições não voltam na mesma oferta', async () => {
 const db=new Database(':memory:');let price=900;const provider={id:'teste',name:'Teste',url:'https://example.com',fetchOffers:async()=>[{name:'Arroz 5kg',price,extracted:true,valid_until:'2099-12-31',url:'https://example.com/folheto'},{name:'Feijão 1kg',price:500}]};
 const server=createApp(db,[provider]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;const post=async (p,d={})=>fetch(`${root}/api/${p}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
 try {
  await post('refresh-store',{store:'teste'});assert.deepEqual(db.offers().map(x=>x.name),['Feijão 1kg']);let data=await (await fetch(root+'/api/data')).json();assert.equal(data.pending_offers.length,1);const id=data.pending_offers[0].id;
  assert.equal((await post('review-offer',{id,decision:'approve'})).status,200);assert.equal(db.offers().find(o=>o.name==='Arroz 5kg').price,900);
  await post('refresh-store',{store:'teste'});data=await (await fetch(root+'/api/data')).json();assert.equal(data.pending_offers.length,0);
  price=1200;await post('refresh-store',{store:'teste'});assert.equal(db.offers().find(o=>o.name==='Arroz 5kg').price,900);data=await (await fetch(root+'/api/data')).json();assert.equal(data.pending_offers.length,1);
  const reject=data.pending_offers[0].id;await post('review-offer',{id:reject,decision:'reject'});await post('refresh-store',{store:'teste'});data=await (await fetch(root+'/api/data')).json();assert.equal(data.pending_offers.length,0);assert.equal(db.offers().find(o=>o.name==='Arroz 5kg').price,900);
 }finally{await new Promise(r=>server.close(r));db.close();}
});

test('falhas internas ficam no log e nunca são devolvidas à API', async () => {
 const db=new Database(':memory:'), server=createApp(db,[{id:'teste',name:'Teste',url:'https://example.com',fetchOffers:async()=>{throw Error('erro interno privado /home/secret');}}]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try {const response=await fetch(root+'/api/refresh-store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store:'teste'})});const body=await response.text();assert.ok(!body.includes('/home/secret'));assert.match(body,/Não atualizado/);}
 finally{await new Promise(r=>server.close(r));db.close();}
});

test('não aprova oferta vencida nem expõe erros antigos no status', async () => {
 const db=new Database(':memory:');db.queueOffers('teste',[{name:'Café',price:500,extracted:true,valid_until:'2000-01-01',url:'https://example.com'}]);const id=db.pendingOffers()[0].id;assert.equal(db.reviewOffer(id,'approve'),false);assert.equal(db.offers().length,0);assert.equal(db.pendingOffers().length,1);
 db.status('teste',{state:'error',status:'Não atualizado: erro interno /caminho/privado'});const server=createApp(db,[]);await new Promise(r=>server.listen(0,'127.0.0.1',r));try {const data=await(await fetch(`http://127.0.0.1:${server.address().port}/api/data`)).json();assert.ok(!JSON.stringify(data.sources).includes('/caminho/privado'));}finally{await new Promise(r=>server.close(r));db.close();}
});

test('auditoria registra ação e decisão sem salvar dados da requisição', async () => {
 const db=new Database(':memory:');db.queueOffers('teste',[{name:'Arroz',price:500,extracted:true,valid_until:'2099-12-31',url:'https://example.com'}]);const id=db.pendingOffers()[0].id, server=createApp(db,[]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const original=console.log, entries=[];console.log=message=>entries.push(message);
 try {const res=await fetch(`http://127.0.0.1:${server.address().port}/api/review-offer`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,decision:'approve',api_key:'segredo-nao-registrar'})});assert.equal(res.status,200);const event=entries.map(JSON.parse).find(item=>item.type==='audit');assert.equal(event.action,'review-offer');assert.equal(event.decision,'approve');assert.equal(event.id,id);assert.equal(event.actor,'sem-autenticacao');assert.ok(!JSON.stringify(event).includes('segredo-nao-registrar'));}finally{console.log=original;await new Promise(r=>server.close(r));db.close();}
});

test('falha na aprovação mantém a oferta pendente sem alterar preços', () => {
 const db=new Database(':memory:');try {db.queueOffers('teste',[{name:'Café',price:500,extracted:true,valid_until:'2099-12-31',url:'https://example.com'}]);const id=db.pendingOffers()[0].id;db.saveOffers=()=>{throw Error('falha de gravação')};assert.throws(()=>db.reviewOffer(id,'approve'));assert.equal(db.pendingOffers()[0].id,id);assert.equal(db.offers().length,0);}finally{db.close();}
});

test('erro interno de uma requisição é registrado e não chega ao cliente', async () => {
 const db=new Database(':memory:'),server=createApp(db,[]), original=console.error, errors=[];db.createList=()=>{throw Error('falha privada em /db/interno')};await new Promise(r=>server.listen(0,'127.0.0.1',r));console.error=message=>errors.push(message);
 try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/list`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'teste'})});assert.equal(response.status,400);assert.ok(!(await response.text()).includes('/db/interno'));assert.ok(errors.some(line=>line.includes('/db/interno')));}finally{console.error=original;await new Promise(r=>server.close(r));db.close();}
});
