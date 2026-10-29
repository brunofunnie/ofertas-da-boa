import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveConfig,publicConfig,listModels,readImage} from './index.js';

test('configuração preserva segredo e não o expõe na resposta', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-'));const path=join(dir,'config.json');
 try {await saveConfig({provider:'openai',base_url:'http://127.0.0.1:1234/v1',model:'vision',api_key:'segredo'},path);
 const result=await publicConfig(path);assert.equal(result.model,'vision');assert.equal(result.has_key,true);assert.ok(!JSON.stringify(result).includes('segredo'));
 await saveConfig({provider:'openai',base_url:'http://127.0.0.1:1234/v1',model:'vision2',api_key:''},path);assert.equal(JSON.parse(await readFile(path,'utf8')).openai.api_key,'segredo');assert.equal((await stat(path)).mode & 0o777,0o600);
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
 const {createServer}=await import('node:http'); const {Database,createApp}=await import('../server.js');
 const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-http-'));const path=join(dir,'config.json');
 const fake=createServer((req,res)=>{assert.equal(req.url,'/v1/models');assert.equal(req.headers.authorization,'Bearer segredo');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'modelo-vision'}]}));});await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 const db=new Database(':memory:'), server=createApp(db,[],{aiConfigPath:path});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const config={provider:'openai',base_url:`http://127.0.0.1:${fake.address().port}/v1`,model:'modelo-vision',api_key:'segredo'};
 const post=async (name,data,origin)=>fetch(`${root}/api/${name}`,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(data)});
 try {const saved=await post('ai-config',config);assert.equal(saved.status,200);assert.ok(!(await saved.text()).includes('segredo'));
 const current=await (await fetch(`${root}/api/ai-config`)).json();assert.equal(current.provider,'openai');assert.equal(current.has_key,true);assert.ok(!JSON.stringify(current).includes('segredo'));
 const models=await post('ai-models',{...config,api_key:''});assert.deepEqual((await models.json()).models,['modelo-vision']);assert.equal((await post('ai-config',config,'https://outside.example')).status,403);
 } finally {await new Promise(r=>server.close(r));db.close();await new Promise(r=>fake.close(r));await rm(dir,{recursive:true,force:true});}
});

test('o provedor selecionado extrai ofertas de imagens', async () => {
 const {extractFlyerImage}=await import('../providers/bom-lugar/index.js');const dir=await mkdtemp(join(tmpdir(),'ofertas-ai-flyer-')),path=join(dir,'config.json');const previous=process.env.AI_CONFIG_PATH, original=globalThis.fetch;
 try {await saveConfig({provider:'openai',base_url:'http://localhost:1234/v1',model:'vision',api_key:''},path);process.env.AI_CONFIG_PATH=path;
 globalThis.fetch=async (url,opts)=>{assert.equal(url,'http://localhost:1234/v1/chat/completions');assert.equal(JSON.parse(opts.body).model,'vision');return new Response(JSON.stringify({choices:[{message:{content:'```json\n{"is_promotion":true,"valid_from":"2026-10-01","valid_until":"2026-10-31","products":[{"name":"Arroz 5kg","price":10}]}\n```'}}]}));};
 const offers=await extractFlyerImage(Buffer.from('x'),'image/jpeg','https://instagram.com/p/x','2026-10-29',{requirePromotion:true});assert.equal(offers[0].price,1000);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.AI_CONFIG_PATH;else process.env.AI_CONFIG_PATH=previous;await rm(dir,{recursive:true,force:true});}
});
