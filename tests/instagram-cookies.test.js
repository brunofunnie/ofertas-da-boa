import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database,createApp} from '../server.js';

test('salva cookies válidos sem expor a sessão e preserva arquivo ao rejeitar dados inválidos', async () => {
  const dir=await mkdtemp(join(tmpdir(),'ofertas-cookies-')), path=join(dir,'instagram-cookies.json');
  const db=new Database(':memory:'), server=createApp(db,[],{instagramCookiesPath:path,resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const url=`http://127.0.0.1:${server.address().port}/api/instagram-cookies`;
  const send=async (cookies,origin)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify({cookies})});
  try {
    const raw=JSON.stringify([{domain:'.instagram.com',name:'sessionid',value:'secret',path:'/',secure:true,unneeded:'discard'}]);
    assert.equal((await send(raw)).status,200); const saved=await readFile(path,'utf8'); assert.deepEqual(JSON.parse(saved),[{name:'sessionid',value:'secret',domain:'.instagram.com',path:'/',secure:true,httpOnly:false}]); assert.equal((await stat(path)).mode & 0o777,0o600);
    const invalid=await send('{"value":"secret"'); assert.equal(invalid.status,400); assert.ok(!(await invalid.text()).includes('secret')); assert.equal(await readFile(path,'utf8'),saved);
    assert.equal((await send(JSON.stringify([{domain:'.instagram.com',name:'sessionid',value:'bad\nvalue'}]))).status,400); assert.equal(await readFile(path,'utf8'),saved);
    assert.equal((await send(raw,'https://outside.example')).status,403); assert.equal((await fetch(url)).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); db.close(); await rm(dir,{recursive:true,force:true}); }
});
