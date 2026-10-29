import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database, createApp} from '../server.js';

test('conta novos e alterações sem contar consultas iguais como mudanças', () => {
 const db=new Database(':memory:');
 assert.deepEqual(db.saveOffers('mercado',[{name:'Arroz 5kg',price:1000}]),{total:1,new_count:1,changed_count:0});
 assert.deepEqual(db.saveOffers('mercado',[{name:'Arroz 5kg',price:1000},{name:'Feijão 1kg',price:900}]),{total:2,new_count:1,changed_count:0});
 assert.deepEqual(db.saveOffers('mercado',[{name:'Arroz 5kg',price:1100},{name:'Feijão 1kg',price:900}]),{total:2,new_count:0,changed_count:1});
 db.close();
});
test('atualização individual registra sucesso e preserva dados anteriores após erro', async () => {
 const db=new Database(':memory:'); let fail=false;
 const provider={id:'teste',name:'Mercado',url:'https://example.com',fetchOffers:async()=>{if(fail)throw Error('Fonte indisponível');return [{name:'Arroz 5kg',price:1000}];}};
 const server=createApp(db,[provider],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const update=()=>fetch(base+'/api/refresh-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:'teste'})}).then(r=>r.json());
 try {
   const first=await update(); assert.equal(first.state,'ok'); assert.equal(first.new_count,1);
   const second=await update(); assert.equal(second.total,1); assert.equal(second.new_count,0); assert.equal(second.changed_count,0);
   fail=true; const failure=await update(); assert.equal(failure.state,'error');
   const data=await fetch(base+'/api/data').then(r=>r.json()); const source=data.sources.find(s=>s.store==='teste');
   assert.equal(source.state,'error'); assert.ok(source.last_success); assert.equal(source.total,1); assert.equal(db.offers().length,1);
 } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
test('consultas simultâneas do mesmo supermercado compartilham a atualização', async () => {
 const db=new Database(':memory:'); let calls=0, finish;
 const provider={id:'teste',name:'Mercado',url:'https://example.com',fetchOffers:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}};
 const server=createApp(db,[provider],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})}); let arrivals=0; server.on('request', req => { if (req.url === '/api/refresh-store') arrivals++; }); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const base=`http://127.0.0.1:${server.address().port}`;
 const update=()=>fetch(base+'/api/refresh-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:'teste'})}).then(r=>r.json());
 try { const first=update(); while(!finish) await new Promise(resolve=>setTimeout(resolve,5)); const second=update(); while(arrivals<2) await new Promise(resolve=>setTimeout(resolve,5)); const data=await fetch(base+'/api/data').then(r=>r.json()); assert.equal(data.sources[0].state,'running'); finish([{name:'Arroz 5kg',price:1000}]); const results=await Promise.all([first,second]); assert.equal(calls,1); assert.equal(results[0].state,'ok'); assert.equal(results[1].state,'ok'); }
 finally {await new Promise(resolve=>server.close(resolve));db.close();}
});

test('atualização parcial salva produtos disponíveis e informa a fonte que falhou', async () => {
 const db=new Database(':memory:'); const provider={id:'teste',name:'Mercado',url:'https://example.com',fetchOffers:async()=>{const offers=[{name:'Arroz 5kg',price:1000}];offers.warnings=['Instagram: sessão expirada'];return offers;}};
 const server=createApp(db,[provider],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/refresh-store`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:'teste'})});const result=await response.json();assert.equal(result.state,'error');assert.match(result.status,/parcial.*Instagram/);assert.equal(result.total,1);assert.equal(db.offers().length,1);}finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('registra e apresenta o status de cada fonte, inclusive falhas e fonte não configurada', async () => {
 const db=new Database(':memory:'); let fail=true;
 const provider={id:'teste',name:'Mercado',url:'https://example.com',sourceDefinitions:[{id:'site',name:'Site'},{id:'instagram',name:'Instagram'}],fetchWithStatus:async (_,report)=>{report({id:'site',state:'ok',total:1});report({id:'instagram',state:fail?'error':'unconfigured',status:fail?'Sessão do Instagram expirada ou requer verificação.':'Não configurado'});const offers=[{name:'Arroz 5kg',price:1000}];if(fail)offers.warnings=['Instagram: Sessão expirada'];return offers;}};
 const server=createApp(db,[provider],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const update=()=>fetch(base+'/api/refresh-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:'teste'})});
 try {
  let data=await fetch(base+'/api/data').then(r=>r.json());assert.deepEqual(data.store_sources.map(s=>s.state),['unknown','unknown']);
  await update();data=await fetch(base+'/api/data').then(r=>r.json());assert.equal(data.store_sources[0].state,'ok');assert.equal(data.store_sources[0].total,1);assert.equal(data.store_sources[1].state,'error');assert.equal(data.store_sources[1].status,'Sessão do Instagram expirada ou requer verificação.');
  fail=false;await update();data=await fetch(base+'/api/data').then(r=>r.json());assert.equal(data.store_sources[1].state,'unconfigured');assert.equal(data.store_sources[0].state,'ok');
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('mostra fontes concluídas enquanto outra ainda está atualizando', async () => {
 const db=new Database(':memory:');let finish,started;
 const provider={id:'teste',name:'Mercado',url:'https://example.com',sourceDefinitions:[{id:'site',name:'Site'},{id:'instagram',name:'Instagram'}],fetchWithStatus:async (_,report)=>{report({id:'site',state:'ok',status:'Concluído',total:1});started=true;await new Promise(resolve=>{finish=resolve});report({id:'instagram',state:'ok',status:'Concluído',total:0});return [{name:'Arroz 5kg',price:1000}];}};
 const server=createApp(db,[provider],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{const update=fetch(base+'/api/refresh-store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store:'teste'})});while(!started)await new Promise(r=>setTimeout(r,5));const data=await fetch(base+'/api/data').then(r=>r.json());assert.deepEqual(data.store_sources.map(s=>s.state),['ok','running']);finish();await update;}finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
