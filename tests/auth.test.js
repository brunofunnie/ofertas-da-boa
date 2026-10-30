import {test} from 'node:test';import assert from 'node:assert/strict';import {Database,createApp} from '../server.js';import {createSession} from '../auth/index.js';

test('ofertas públicas; listas pertencem ao usuário; ações administrativas são restritas', async()=>{
 const db=new Database(':memory:');db.saveOffers('tauste',[{name:'Arroz 5kg',price:1000}]);const server=createApp(db,[]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const user={sub:'user-one',email:'one@example.com',name:'Um'},other={sub:'user-two',email:'two@example.com',name:'Dois'},admin={sub:'admin-one',email:'brunodeoliveira@gmail.com',name:'Admin'};
 const cookie=u=>`ofertas_session=${createSession(db.db,u)}`;const one=cookie(user),two=cookie(other),boss=cookie(admin);
 const post=(path,data,c)=>fetch(`${root}/api/${path}`,{method:'POST',headers:{'content-type':'application/json',...(c?{cookie:c}:{})},body:JSON.stringify(data)});
 try{let r=await fetch(root+'/api/data');let j=await r.json();assert.equal(j.offers.length,1);assert.deepEqual(j.lists,[]);assert.equal((await post('list',{name:'Privada'})).status,401);
 const made=await (await post('list',{name:'Privada'},one)).json();assert.ok(made.id);j=await(await fetch(root+'/api/data',{headers:{cookie:two}})).json();assert.equal(j.lists.length,0);j=await(await fetch(root+'/api/data',{headers:{cookie:one}})).json();assert.equal(j.lists.length,1);
 for(const [path,body] of [['delete-list',{id:made.id}],['rename-list',{id:made.id,name:'Outro'}],['item',{list_id:made.id,offer_id:db.offers()[0].id}],['remove',{list_id:made.id,offer_id:1}],['check',{list_id:made.id,offer_id:1}],['quantity',{list_id:made.id,offer_id:1,quantity:2}]]) assert.equal((await post(path,body,two)).status,404);
 for(const path of ['ai-config','ai-models','refresh','refresh-store','instagram-cookies','offer','admin/product/update','admin/product/delete']) {assert.equal((await post(path,{},one)).status,403);assert.equal((await post(path,{})).status,401);}
 assert.equal((await fetch(root+'/api/ai-config',{headers:{cookie:one}})).status,403);assert.equal((await post('list',{name:'Admin'},boss)).status,200);
 }finally{await new Promise(r=>server.close(r));db.close();}
});

test('listas antigas são vinculadas apenas ao administrador após login',()=>{
 const db=new Database(':memory:');try{const id=db.createList('Antiga');createSession(db.db,{sub:'ordinary',email:'other@example.com',name:'Pessoa'});assert.equal(db.lists('ordinary').length,0);createSession(db.db,{sub:'google-admin',email:'brunodeoliveira@gmail.com',name:'Admin'});assert.equal(db.lists('google-admin')[0].id,id);assert.equal(db.lists('ordinary').length,0);}finally{db.close();}
});

test('login Google exige estado, PKCE, nonce e email verificado antes de criar sessão', async()=>{
 let request, verified=true;const google={generateAuthUrl:params=>{request=params;return `https://accounts.google.com/o/oauth2/v2/auth?state=${params.state}`;},getToken:async params=>{assert.ok(params.codeVerifier);return {tokens:{id_token:'fake'}};},verifyIdToken:async()=>({getPayload:()=>({sub:'google-sub',email:'brunodeoliveira@gmail.com',email_verified:verified,name:'Bruno',picture:'https://lh3.googleusercontent.com/avatar',nonce:request.nonce})})};
 const db=new Database(':memory:');const server=createApp(db,[],{googleAuth:{client:google,clientId:'id',clientSecret:'secret',redirectUri:'https://ofertas.funnie.dev/auth/google/callback'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try {
  let start=await fetch(root+'/auth/google',{redirect:'manual'});assert.equal(start.status,302);assert.equal(request.code_challenge_method,'S256');const cookie=start.headers.get('set-cookie').split(';')[0];assert.match(start.headers.get('set-cookie'),/HttpOnly/);assert.match(start.headers.get('set-cookie'),/Secure/);
  let bad=await fetch(`${root}/auth/google/callback?state=${request.state}&code=one`,{redirect:'manual'});assert.equal(bad.headers.get('location'),'/?login=erro');
  start=await fetch(root+'/auth/google',{redirect:'manual'});const state=request.state, c=start.headers.get('set-cookie').split(';')[0];let callback=await fetch(`${root}/auth/google/callback?state=${state}&code=one`,{redirect:'manual',headers:{cookie:c}});assert.equal(callback.headers.get('location'),'/');const session=callback.headers.getSetCookie().find(x=>x.startsWith('ofertas_session=')).split(';')[0];let data=await(await fetch(root+'/api/data',{headers:{cookie:session}})).json();assert.equal(data.user.admin,true);assert.equal(data.user.picture,'https://lh3.googleusercontent.com/avatar');
  const out=await fetch(root+'/api/logout',{method:'POST',headers:{'content-type':'application/json',cookie:session},body:'{}'});assert.equal(out.status,200);data=await(await fetch(root+'/api/data',{headers:{cookie:session}})).json();assert.equal(data.user,null);
  verified=false;start=await fetch(root+'/auth/google',{redirect:'manual'});callback=await fetch(`${root}/auth/google/callback?state=${request.state}&code=two`,{redirect:'manual',headers:{cookie:start.headers.get('set-cookie').split(';')[0]}});assert.equal(callback.headers.get('location'),'/?login=erro');assert.ok(!callback.headers.getSetCookie().some(x=>x.startsWith('ofertas_session=')));
 }finally{await new Promise(r=>server.close(r));db.close();}
});
