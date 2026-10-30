import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';

test('Vite redireciona /admin para a página do backoffice, preservando a consulta', async () => {
 process.env.GOOGLE_CLIENT_ID = 'test-client';
 process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
 process.env.DATABASE_PATH = ':memory:';
 const probe=createNetServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const vite = await createServer({configFile:resolve('vite.config.js'),server:{host:'127.0.0.1',port,strictPort:true},logLevel:'silent'});
 try {
  await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  const response=await fetch(origin+'/admin?login=erro',{redirect:'manual'});
  assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/admin/?login=erro');
  const page=await fetch(origin+'/admin/');assert.equal(page.status,200);assert.match(await page.text(),/Administração · Ofertas da Boa/);
 } finally {await vite.close();delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;delete process.env.DATABASE_PATH;}
});
