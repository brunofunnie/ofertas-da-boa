import {test} from 'node:test';import assert from 'node:assert/strict';import {Database,createApp} from '../server.js';
test('falhas internas ficam no log e nunca são devolvidas à API', async () => {
 const db=new Database(':memory:'), server=createApp(db,[{id:'teste',name:'Teste',url:'https://example.com',fetchOffers:async()=>{throw Error('erro interno privado /home/secret');}}],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try {const response=await fetch(root+'/api/refresh-store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({store:'teste'})});const body=await response.text();assert.ok(!body.includes('/home/secret'));assert.match(body,/Não atualizado/);}
 finally{await new Promise(r=>server.close(r));db.close();}
});

test('erro interno de uma requisição é registrado e não chega ao cliente', async () => {
 const db=new Database(':memory:'),server=createApp(db,[],{resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})}), original=console.error, errors=[];db.createList=()=>{throw Error('falha privada em /db/interno')};await new Promise(r=>server.listen(0,'127.0.0.1',r));console.error=message=>errors.push(message);
 try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/list`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'teste'})});assert.equal(response.status,400);assert.ok(!(await response.text()).includes('/db/interno'));assert.ok(errors.some(line=>line.includes('/db/interno')));}finally{console.error=original;await new Promise(r=>server.close(r));db.close();}
});
