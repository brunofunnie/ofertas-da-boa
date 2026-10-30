import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database,createApp} from '../server.js';
import {createSession} from '../auth/index.js';

test('sessões da loja e do backoffice são independentes e não dão acesso cruzado',async()=>{
 const db=new Database(':memory:'),admin={sub:'admin',name:'Admin',email:'brunodeoliveira@gmail.com'};
 db.queueOffers('a',[{name:'Arroz',price:100,valid_until:'2099-01-01'}]);
 const appToken=createSession(db.db,admin), adminToken=createSession(db.db,admin,'admin');
 const appCookie=`ofertas_session=${appToken}`;
 const adminCookie=`ofertas_admin_session=${adminToken}`;
 const server=createApp(db,[]);await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,cookie)=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 try {
  assert.equal((await fetch(root+'/api/admin/data',{headers:{cookie:appCookie}})).status,403);
  assert.equal((await fetch(root+'/api/admin/data',{headers:{cookie:`ofertas_admin_session=${appToken}`}})).status,401);
  assert.equal((await post('/api/list',{name:'Invasão'},`ofertas_session=${adminToken}`)).status,401);
  assert.equal((await (await fetch(root+'/api/data',{headers:{cookie:appCookie}})).json()).pending_offers.length,0);
  assert.equal((await post('/api/offer-settings',{irresistible_percent:30},appCookie)).status,403);
  const adminData=await fetch(root+'/api/admin/data',{headers:{cookie:adminCookie}});assert.equal(adminData.status,200);assert.equal((await adminData.json()).pending_offers.length,1);
  assert.equal((await post('/api/offer-settings',{irresistible_percent:30},adminCookie)).status,200);
  assert.equal((await post('/api/list',{name:'Privada'},adminCookie)).status,401);
  assert.equal((await post('/api/admin/logout',{},adminCookie)).status,200);
  assert.equal((await fetch(root+'/api/admin/data',{headers:{cookie:adminCookie}})).status,401);
  assert.equal((await post('/api/list',{name:'Continua autenticado'},appCookie)).status,200);
 } finally {await new Promise(r=>server.close(r));db.close();}
});

test('login do backoffice só cria sessão para o administrador autorizado',async()=>{
 let request,email='other@example.com';const google={generateAuthUrl:p=>(request=p,'https://accounts.google.com/test'),getToken:async()=>({tokens:{id_token:'fake'}}),verifyIdToken:async()=>({getPayload:()=>({sub:'id',email,email_verified:true,name:'Teste',nonce:request.nonce})})};
 const db=new Database(':memory:'),server=createApp(db,[],{googleAuth:{client:google,clientId:'id',clientSecret:'secret',redirectUri:'http://localhost:5173/auth/google/callback'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 async function login(){const start=await fetch(root+'/auth/google/admin',{redirect:'manual'});assert.equal(start.status,302);assert.equal(request.prompt,'select_account');const c=start.headers.get('set-cookie').split(';')[0];return fetch(`${root}/auth/google/callback?state=${request.state}&code=code`,{redirect:'manual',headers:{cookie:c}})}
 try {const start=await fetch(root+'/auth/google/admin',{redirect:'manual'});assert.equal(start.status,302);const forged=await fetch(`${root}/auth/google/callback?state=${request.state}&code=code`,{redirect:'manual',headers:{cookie:`ofertas_oauth=${request.state}`}});assert.equal(forged.headers.get('location'),'/admin/?login=erro');assert.ok(!forged.headers.getSetCookie().some(x=>x.startsWith('ofertas_admin_session=')));let r=await login();assert.equal(r.headers.get('location'),'/admin/?login=erro');assert.ok(!r.headers.getSetCookie().some(x=>x.startsWith('ofertas_admin_session=')));email='brunodeoliveira@gmail.com';r=await login();assert.equal(r.headers.get('location'),'/admin/');assert.ok(r.headers.getSetCookie().some(x=>x.startsWith('ofertas_admin_session=')));}finally{await new Promise(r=>server.close(r));db.close();}
});

test('migração preserva sessões existentes da área de compras', async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {createHash}=await import('node:crypto');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {getSession}=await import('../auth/index.js');
 const dir=mkdtempSync(join(tmpdir(),'ofertas-auth-')),file=join(dir,'data.sqlite3'),legacy=new DatabaseSync(file),raw='a'.repeat(43);
 legacy.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL,picture TEXT); CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL); INSERT INTO users VALUES('id','user@example.com','Pessoa',NULL)");
 legacy.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(raw).digest('hex'),'id',Math.floor(Date.now()/1000)+3600);legacy.close();
 const db=new Database(file);try {assert.equal(getSession(db.db,{headers:{cookie:`ofertas_session=${raw}`}})?.sub,'id');assert.equal(getSession(db.db,{headers:{cookie:`ofertas_admin_session=${raw}`}},'admin'),null);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
