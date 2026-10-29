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

test('carrega o login local a partir da identidade do Infisical', async () => {
  const { loadDevGoogleAuth } = await import('../scripts/infisical-run.js');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'ofertas-infisical-'));
  try {
    const file = join(dir, 'identity');
    await writeFile(file, 'INFISICAL_CLIENT_ID=identity\nINFISICAL_CLIENT_SECRET=key\n');
    let calls = 0;
    const fetcher = async () => ++calls === 1
      ? { ok: true, json: async () => ({ accessToken: 'token' }) }
      : { ok: true, json: async () => ({ secret: { secretValue: calls === 2 ? 'id' : 'secret' } }) };
    assert.deepEqual(await loadDevGoogleAuth(file, fetcher), { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost:5173/auth/google/callback' });
    assert.equal(await loadDevGoogleAuth(join(dir, 'missing')), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
