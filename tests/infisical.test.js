import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCredentials } from '../scripts/infisical-run.js';

test('consulta apenas as credenciais Google no ambiente solicitado', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return { ok: true, json: async () => ({ accessToken: 'token' }) };
    return { ok: true, json: async () => ({ secret: { secretValue: calls.length === 2 ? 'id' : 'secret' } }) };
  };
  const result = await googleCredentials('dev', { INFISICAL_CLIENT_ID: 'identity', INFISICAL_CLIENT_SECRET: 'key' }, fetcher);
  assert.deepEqual(result, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.equal(new URL(calls[1].url).searchParams.get('environment'), 'dev');
  assert.equal(new URL(calls[1].url).searchParams.get('secretPath'), '/ofertas-da-boa');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer token');
});

test('não inicia com autenticação ou segredo indisponível', async () => {
  await assert.rejects(googleCredentials('prod', {}, async () => ({ok:false,status:403})), /Infisical/);
  let calls = 0;
  await assert.rejects(googleCredentials('prod', {}, async () => ++calls === 1 ? {ok:true,json:async()=>({accessToken:'token'})} : {ok:false,status:404}), /Infisical/);
});
