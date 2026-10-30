import {readFile, mkdir, writeFile, rename, unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {isPublicAddress, outboundAgent} from './network.js';

const defaultPath = () => process.env.AI_CONFIG_PATH || '.local/ai-config.json';
const defaults = () => ({provider:'gemini',gemini:{model:'gemini-2.5-flash',api_key:''},openai:{base_url:'https://api.openai.com/v1',model:'',api_key:''}});
async function configFile(path = defaultPath()) {
  try {return {...defaults(), ...JSON.parse(await readFile(path,'utf8'))};}
  catch (error) {if(error.code === 'ENOENT')return defaults();throw Error('Não foi possível ler a configuração de IA.');}
}
function baseUrl(value) {
  let url; try {url = new URL(value);} catch {throw Error('URL do provedor inválida.');}
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (isIP(host) && !isPublicAddress(host)) || host === 'localhost' || host.endsWith('.localhost')) throw Error('URL do provedor inválida ou destino não permitido.');
  const allowed = ['api.openai.com','api.commandcode.ai', ...(process.env.AI_ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)];
  if (!allowed.includes(url.host.toLowerCase())) throw Error('Provedor de IA não autorizado no servidor.');
  return url.href.replace(/\/+$/, '');
}
function clean(value, label, max = 500) {
  if(typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw Error(`${label} inválido.`);
  return value.trim();
}
export async function saveConfig(input, path = defaultPath()) {
  if (!['gemini','openai'].includes(input.provider)) throw Error('Provedor inválido.');
  const config = await configFile(path), provider = input.provider;
  const model = clean(input.model, 'Modelo', 200);
  if (!model) throw Error('Informe o modelo.');
  const key = clean(input.api_key ?? '', 'Chave', 2000);
  const previous = config[provider] || defaults()[provider];
  if (provider === 'openai') {
    const url = baseUrl(clean(input.base_url, 'URL'));
    config.openai = {base_url:url,model,api_key:key || (previous.base_url === url ? previous.api_key : '')};
  } else config.gemini = {model,api_key:key || previous.api_key || ''};
  config.provider = provider;
  const temp = `${path}.${randomUUID()}.tmp`;
  try {await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(temp,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});await rename(temp,path);}
  catch {await unlink(temp).catch(()=>{});throw Error('Não foi possível salvar a configuração de IA.');}
  return publicConfig(path);
}
export async function activeConfig(path = defaultPath()) {
  const config=await configFile(path); const selected=config[config.provider];
  return {provider:config.provider,...selected,api_key:selected.api_key || (config.provider === 'gemini' ? process.env.GEMINI_API_KEY || '' : '')};
}
export async function publicConfig(path = defaultPath()) {
  const config=await configFile(path); const selected=config[config.provider];
  return {provider:config.provider,model:selected.model,base_url:config.openai.base_url,has_key:!!(selected.api_key || (config.provider === 'gemini' && process.env.GEMINI_API_KEY)),gemini:{model:config.gemini.model,has_key:!!(config.gemini.api_key || process.env.GEMINI_API_KEY)},openai:{model:config.openai.model,base_url:config.openai.base_url,has_key:!!config.openai.api_key}};
}
export async function listModels(config, fetcher = fetch) {
  const isGemini=config.provider==='gemini';
  if (isGemini && !config.api_key) throw Error('Informe a chave do Gemini.');
  const url=isGemini ? 'https://generativelanguage.googleapis.com/v1beta/models' : `${baseUrl(config.base_url)}/models`;
  let res; try {res=await fetcher(url,{headers:isGemini ? {'x-goog-api-key':config.api_key} : (config.api_key ? {Authorization:`Bearer ${config.api_key}`} : {}),signal:AbortSignal.timeout(15000),redirect:'error',dispatcher:outboundAgent});}catch {throw Error('Não foi possível consultar os modelos.');}
  if (!res.ok) throw Error(`Não foi possível consultar os modelos (HTTP ${res.status}).`);
  let data; try {data=await res.json();} catch {throw Error('Lista de modelos inválida.');} const entries=isGemini ? data.models : data.data;
  if(!Array.isArray(entries)) throw Error('Lista de modelos inválida.');
  return entries.map(x=>isGemini ? x.name?.replace(/^models\//,'') : x.id).filter(x=>typeof x==='string' && x.length<=200).slice(0,1000);
}
export async function readImage(config, prompt, bytes, mimeType, fetcher = fetch) {
  const gemini=config.provider==='gemini';
  if (gemini && !config.api_key) throw Error('Configure a chave do Gemini para ler os folhetos.');
  const headers={'content-type':'application/json',...(gemini?{'x-goog-api-key':config.api_key}:config.api_key?{Authorization:`Bearer ${config.api_key}`}:{})};
  const url=gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent` : `${baseUrl(config.base_url)}/chat/completions`;
  const body=gemini ? {contents:[{parts:[{text:prompt},{inlineData:{mimeType,data:bytes.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',temperature:0}} : {model:config.model,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${mimeType};base64,${bytes.toString('base64')}`}}]}]};
  // Este modelo no CommandCode aceita 'off' e pode exceder o prazo ao raciocinar sobre folhetos.
  if (!gemini && new URL(url).hostname==='api.commandcode.ai' && config.model==='deepseek/deepseek-v4.1-flash') body.reasoning_effort='off';
  let response;try {response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000),redirect:'error',dispatcher:outboundAgent});}catch (error) {throw new Error('Não foi possível conectar ao provedor de IA.',{cause:error});}
  if(response.status===429)throw Error(`Limite de requisições do ${gemini?'Gemini':'provedor de IA'} atingido. Tente novamente mais tarde.`);
  if(!response.ok)throw Error(`Leitura do folheto indisponível (HTTP ${response.status}).`);
  let result;try {result=await response.json();} catch {throw Error('Resposta inválida do provedor de IA.');}const text=gemini?result.candidates?.[0]?.content?.parts?.map(p=>p.text || '').join(''):result.choices?.[0]?.message?.content;
  if(typeof text !== 'string' || !text.trim())throw Error('Leitura do folheto não retornou dados.');
  return text;
}
export async function modelConfig(input, path = defaultPath()) {
  const saved=await configFile(path);
  if(!['gemini','openai'].includes(input.provider))throw Error('Provedor inválido.');
  const previous=saved[input.provider]; const key=clean(input.api_key ?? '', 'Chave', 2000);
  if(input.provider==='gemini')return {provider:'gemini',api_key:key || previous.api_key || process.env.GEMINI_API_KEY || ''};
  const url=baseUrl(clean(input.base_url,'URL'));
  return {provider:'openai',base_url:url,api_key:key || (url===previous.base_url ? previous.api_key : '')};
}
