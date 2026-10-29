import {test} from 'node:test';import assert from 'node:assert/strict';import {Database,createApp} from '../server.js';
test('rotas de escrita recusam origens externas e tipos simples', async () => {
 const db=new Database(':memory:'),server=createApp(db,[]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  for (const headers of [{'content-type':'text/plain',origin:'https://outside.example'},{'content-type':'application/json',origin:'https://outside.example'},{'content-type':'application/json','sec-fetch-site':'cross-site'},{'content-type':'application/x-www-form-urlencoded'}]) {
   const res=await fetch(base+'/api/list',{method:'POST',headers,body:JSON.stringify({name:'Bloqueada'})});assert.ok([403,415].includes(res.status));
  }
  assert.equal(db.lists().length,0);
  const ok=await fetch(base+'/api/list',{method:'POST',headers:{'content-type':'application/json',origin:base,'sec-fetch-site':'same-origin'},body:JSON.stringify({name:'Permitida'})});assert.equal(ok.status,200);assert.equal(db.lists().length,1);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
