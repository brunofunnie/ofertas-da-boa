import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveConfig,publicConfig,listModels,readImage} from './index.js';
process.env.AI_ALLOWED_HOSTS = 'example.org,another.example,api.example';

test('configuração preserva segredo e não o expõe na resposta', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-'));const path=join(dir,'config.json');
 try {await saveConfig({provider:'openai',base_url:'https://example.org/v1',model:'vision',api_key:'segredo'},path);
 const result=await publicConfig(path);assert.equal(result.model,'vision');assert.equal(result.has_key,true);assert.ok(!JSON.stringify(result).includes('segredo'));
 await saveConfig({provider:'openai',base_url:'https://example.org/v1',model:'vision2',api_key:''},path);assert.equal(JSON.parse(await readFile(path,'utf8')).openai.api_key,'segredo');assert.equal((await stat(path)).mode & 0o777,0o600);
 await saveConfig({provider:'openai',base_url:'https://another.example/v1',model:'vision',api_key:''},path);assert.equal(JSON.parse(await readFile(path,'utf8')).openai.api_key,'');
 await assert.rejects(saveConfig({provider:'openai',base_url:'file:///etc/passwd',model:'x'},path),/URL/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('consulta modelos e envia imagem para API compatível', async () => {
 const config={provider:'openai',base_url:'https://api.example/v1',model:'vision',api_key:'key'};const calls=[];
 const mock=async (url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/models')?{data:[{id:'vision'},{id:'vision-2'}]}:{choices:[{message:{content:'{"products":[]}'}}]}));};
 assert.deepEqual(await listModels(config,mock),['vision','vision-2']);
 assert.equal(await readImage(config,'Leia',Buffer.from('x'),'image/jpeg',mock),'{"products":[]}');
 const request=JSON.parse(calls[1].options.body);assert.equal(request.model,'vision');assert.equal(request.messages[0].content[1].image_url.url,'data:image/jpeg;base64,eA==');
});

test('API salva e lista modelos sem devolver a chave e rejeita origem externa', async () => {
 const {Database,createApp}=await import('../server.js');
 const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-http-'));const path=join(dir,'config.json');
 const originalFetch=globalThis.fetch; globalThis.fetch=async (url,options)=>String(url)==='https://example.org/v1/models' ? new Response(JSON.stringify({data:[{id:'modelo-vision'}]})) : originalFetch(url,options);
 const db=new Database(':memory:'), server=createApp(db,[],{aiConfigPath:path,resolveUser:()=>({sub:'legacy-admin',email:'brunodeoliveira@gmail.com',name:'Admin',admin:true})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const config={provider:'openai',base_url:'https://example.org/v1',model:'modelo-vision',api_key:'segredo'};
 const post=async (name,data,origin)=>fetch(`${root}/api/${name}`,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(data)});
 try {const saved=await post('ai-config',config);assert.equal(saved.status,200);assert.ok(!(await saved.text()).includes('segredo'));
 const current=await (await fetch(`${root}/api/ai-config`)).json();assert.equal(current.provider,'openai');assert.equal(current.has_key,true);assert.ok(!JSON.stringify(current).includes('segredo'));
 const models=await post('ai-models',{...config,api_key:''});assert.deepEqual((await models.json()).models,['modelo-vision']);assert.equal((await post('ai-config',config,'https://outside.example')).status,403);
 } finally {await new Promise(r=>server.close(r));db.close();globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

test('o provedor selecionado extrai ofertas de imagens', async () => {
 const {extractFlyerImage}=await import('../providers/bom-lugar/index.js');const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-flyer-')),path=join(dir,'config.json');const previous=process.env.AI_CONFIG_PATH, original=globalThis.fetch;
 try {await saveConfig({provider:'openai',base_url:'https://example.org/v1',model:'vision',api_key:''},path);process.env.AI_CONFIG_PATH=path;
 globalThis.fetch=async (url,opts)=>{assert.equal(url,'https://example.org/v1/chat/completions');assert.equal(JSON.parse(opts.body).model,'vision');return new Response(JSON.stringify({choices:[{message:{content:'```json\n{"is_promotion":true,"valid_from":"2026-10-01","valid_until":"2026-10-31","products":[{"name":"Arroz 5kg","price":10}]}\n```'}}]}));};
 const offers=await extractFlyerImage(Buffer.from('x'),'image/jpeg','https://instagram.com/p/x','2026-10-29',{requirePromotion:true});assert.equal(offers[0].price,1000);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.AI_CONFIG_PATH;else process.env.AI_CONFIG_PATH=previous;await rm(dir,{recursive:true,force:true});}
});

test('bloqueia destinos privados, locais e esquemas inseguros na API de IA', async () => {
 for (const url of ['http://127.0.0.1:1234/v1','https://127.0.0.1/v1','https://[::1]/v1','https://[::ffff:7f00:1]/v1','https://169.254.169.254/v1','https://192.168.1.1/v1','http://example.com/v1']) {
  await assert.rejects(listModels({provider:'openai',base_url:url,api_key:''}), /URL|endereço|destino/i);
 }
});

test('consulta DNS bloqueia destinos privados e misturados antes de conectar', async () => {
 const {createSafeLookup}=await import('./network.js');
 const lookup=(addresses)=>createSafeLookup((_host,_opts,cb)=>cb(null,addresses));
 for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'1.1.1.1',family:4},{address:'::1',family:6}]]) {
  const error=await new Promise(resolve=>lookup(addresses)('example.test',{},err=>resolve(err)));assert.ok(error);
 }
 const addresses=[{address:'1.1.1.1',family:4}];const result=await new Promise((resolve,reject)=>lookup(addresses)('example.test',{all:true},(err,value)=>err?reject(err):resolve(value)));assert.deepEqual(result,addresses);
});

test('somente provedores autorizados no servidor podem ser consultados', async () => {
 await assert.rejects(listModels({provider:'openai',base_url:'https://host-nao-autorizado.example/v1',api_key:''}),/não autorizado/i);
});
