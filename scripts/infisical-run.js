import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'http://infisical.lan:8090';
const project = 'f6eaa310-d52c-4d9d-9dba-f57eb7d98f5e';

export async function googleCredentials(environment, identity, fetcher = fetch) {
  const login = await fetcher(`${base}/api/v1/auth/universal-auth/login`, {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: identity.INFISICAL_CLIENT_ID, clientSecret: identity.INFISICAL_CLIENT_SECRET }),
    signal: AbortSignal.timeout(15000)
  });
  if (!login.ok) throw new Error(`Infisical: autenticação falhou (HTTP ${login.status})`);
  const { accessToken } = await login.json();
  if (!accessToken) throw new Error('Infisical: autenticação sem token');
  const result = {};
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
    const query = new URLSearchParams({ workspaceId: project, environment, secretPath: '/ofertas-da-boa' });
    const response = await fetcher(`${base}/api/v3/secrets/raw/${key}?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Infisical: ${key} indisponível (HTTP ${response.status})`);
    const { secret } = await response.json();
    if (!secret?.secretValue) throw new Error(`Infisical: ${key} vazio`);
    result[key] = secret.secretValue;
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [environment, command, ...args] = process.argv.slice(2);
  if (!['prod', 'dev'].includes(environment) || !command) throw new Error('Uso: node scripts/infisical-run.js <dev|prod> <comando>');
  try {
    process.loadEnvFile(resolve(homedir(), '.config/infisical/homelab.ua.env'));
    const credentials = await googleCredentials(environment, process.env);
    const { INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, ...environmentVars } = process.env;
    const child = spawn(command, args, { stdio: 'inherit', env: { ...environmentVars, ...credentials, ...(environment === 'dev' ? { GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/google/callback' } : {}) } });
    child.on('error', () => { console.error('Não foi possível iniciar o comando.'); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  } catch (error) { console.error(`Não foi possível carregar as credenciais: ${error.message}`); process.exitCode = 1; }
}
