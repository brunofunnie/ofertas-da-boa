import {createHash} from 'node:crypto';
import {S3Client, PutObjectCommand, GetObjectCommand} from '@aws-sdk/client-s3';
import {outboundAgent} from './ai/network.js';

const MAX_BYTES = 5 * 1024 * 1024;
export function imageType(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}
export async function downloadImage(source, fetcher = fetch) {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('URL de imagem inválida.');
  const response = await fetcher(url, {redirect:'error',dispatcher:outboundAgent,signal:AbortSignal.timeout(15000)});
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw Error('Não foi possível baixar a imagem.');
  const parts=[]; let size=0;
  for await (const chunk of response.body) {size+=chunk.length;if(size>MAX_BYTES) throw Error('Imagem muito grande.');parts.push(chunk);}
  const bytes=Buffer.concat(parts), type=imageType(bytes);
  if (!type) throw Error('Formato de imagem inválido.');
  return {bytes,type};
}
export function createImageStore(credentials, client) {
  if (!credentials) return null;
  const {account,token,id}=JSON.parse(credentials);
  if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-f0-9]{32}$/.test(id) || !token) throw Error('Credenciais R2 inválidas.');
  client ||= new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId:id,secretAccessKey:createHash('sha256').update(token).digest('hex')}});
  return {
    async put(bytes) {
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES || !imageType(bytes)) throw Error('Imagem inválida ou maior que 5 MB.');
      const type=imageType(bytes), key=createHash('sha256').update(bytes).digest('hex');
      await client.send(new PutObjectCommand({Bucket:'ofertas-da-boa-images',Key:key,Body:bytes,ContentType:type}),{abortSignal:AbortSignal.timeout(30000)});
      return key;
    },
    async get(key) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Chave inválida.');
      const response=await client.send(new GetObjectCommand({Bucket:'ofertas-da-boa-images',Key:key}),{abortSignal:AbortSignal.timeout(30000)});
      if (response.ContentLength > MAX_BYTES) throw Error('Imagem armazenada inválida.');
      const parts=[]; let size=0; for await(const chunk of response.Body) {size+=chunk.length;if(size>MAX_BYTES)throw Error('Imagem armazenada inválida.');parts.push(chunk);}
      const bytes=Buffer.concat(parts), type=imageType(bytes);
      if (!type) throw Error('Imagem armazenada inválida.');
      return {bytes,type};
    }
  };
}
