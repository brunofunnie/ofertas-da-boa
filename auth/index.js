import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';

export const ADMIN_EMAIL = 'brunodeoliveira@gmail.com';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const lifetime = 30*24*60*60;
export function isAdmin(user) { return user?.email?.toLowerCase() === ADMIN_EMAIL; }
export function createSession(db,user,scope='app') {
  db.prepare('INSERT INTO users(id,email,name,picture) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture').run(user.sub,user.email.toLowerCase(),user.name,user.picture || null);
  if (isAdmin(user)) db.prepare("UPDATE lists SET owner_id=? WHERE owner_id='legacy-admin'").run(user.sub);
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Math.floor(Date.now()/1000));
  const raw=token();db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,scope) VALUES(?,?,?,?)').run(hash(raw),user.sub,Math.floor(Date.now()/1000)+lifetime,scope);return raw;
}
export function getSession(db,req,scope='app') {
  const name=scope === 'admin' ? 'ofertas_admin_session=' : 'ofertas_session=';
  const raw=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const row=db.prepare('SELECT users.id AS sub,users.email,users.name,users.picture FROM auth_sessions JOIN users ON users.id=auth_sessions.user_id WHERE token_hash=? AND expires_at>? AND scope=?').get(hash(raw),Math.floor(Date.now()/1000),scope);
  return row ? {...row,admin:isAdmin(row)} : null;
}
export function destroySession(db,req,scope='app') {
  const name=scope === 'admin' ? 'ofertas_admin_session=' : 'ofertas_session=';
  const raw=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length);
  if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) db.prepare('DELETE FROM auth_sessions WHERE token_hash=? AND scope=?').run(hash(raw),scope);
}
export function createGoogleAuth(options = {}) {
  const clientId=options.clientId ?? process.env.GOOGLE_CLIENT_ID, clientSecret=options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUris=String(options.redirectUri ?? process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8000/auth/google/callback').split(',').map(x=>x.trim()).filter(Boolean);
  const redirectFor=req=>redirectUris.find(uri=>new URL(uri).host === req.headers.host) ?? redirectUris[0];
  const secure=redirectUris.every(uri=>uri.startsWith('https://'));
  const oauth=options.client || (clientId && clientSecret ? new OAuth2Client(clientId,clientSecret,redirectUris[0]) : null);
  const pending=new Map();
  const cookie=(name,value,maxAge,path='/') => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  return {
    available:!!oauth,
    begin(req,res,scope='app') {
      if (!oauth) {res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Login Google ainda não configurado.');return;}
      for (const [key,value] of pending) if (value.expires < Date.now()) pending.delete(key);
      if (pending.size >= 1000) {res.writeHead(429);res.end();return;}
      const state=token(),nonce=token(),verifier=token(),challenge=createHash('sha256').update(verifier).digest('base64url');
      const redirectUri=redirectFor(req);pending.set(state,{nonce,verifier,scope,redirectUri,expires:Date.now()+600000});
      const url=oauth.generateAuthUrl({scope:['openid','email','profile'],response_type:'code',state,nonce,redirect_uri:redirectUri,code_challenge:challenge,code_challenge_method:'S256',...(scope === 'admin' ? {prompt:'select_account'} : {})});
      res.writeHead(302,{'Location':url,'Set-Cookie':cookie(scope === 'admin' ? 'ofertas_admin_oauth' : 'ofertas_oauth',state,600,'/auth/google/callback'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
    },
    async callback(req,res,db,url) {
      const state=url.searchParams.get('state') || '', code=url.searchParams.get('code') || '';
      const attempt=pending.get(state);pending.delete(state);
      const scope=attempt?.scope === 'admin' ? 'admin' : 'app', oauthCookie=scope === 'admin' ? 'ofertas_admin_oauth' : 'ofertas_oauth';
      const saved=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(oauthCookie+'='))?.slice(oauthCookie.length+1) || '';
      const same=/^[A-Za-z0-9_-]{43}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(saved) && timingSafeEqual(Buffer.from(state),Buffer.from(saved));
      try {
        if (!oauth || !same || !attempt || attempt.expires < Date.now() || !code) throw Error('Estado de login inválido.');
        const {tokens}=await oauth.getToken({code,codeVerifier:attempt.verifier,redirect_uri:attempt.redirectUri});
        if (!tokens.id_token) throw Error('Token de identidade ausente.');
        const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId});const info=ticket.getPayload();
        if (!info || info.nonce !== attempt.nonce || info.email_verified !== true || typeof info.sub !== 'string' || !info.sub || typeof info.email !== 'string' || !info.email) throw Error('Identidade Google inválida.');
        let picture = null;
        try { const url = new URL(info.picture); if (url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) && url.href.length <= 2048) picture = url.href; } catch {}
        const user={sub:info.sub,email:info.email,name:typeof info.name==='string' ? info.name.slice(0,120) : info.email,picture};if (scope === 'admin' && !isAdmin(user)) throw Error('Acesso restrito.');destroySession(db,req,scope);const session=createSession(db,user,scope);
        console.log(JSON.stringify({type:'audit',at:new Date().toISOString(),action:'login-google',outcome:'ok',actor:user.sub,session_scope:scope}));
        res.writeHead(302,{'Location':scope === 'admin' ? '/admin/' : '/','Set-Cookie':[cookie(scope === 'admin' ? 'ofertas_admin_session' : 'ofertas_session',session,lifetime),cookie(oauthCookie,'',0,'/auth/google/callback')],'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
      } catch (error) {console.error(JSON.stringify({type:'error',at:new Date().toISOString(),scope:'auth:google',detail:'Falha ao validar a autenticação Google.'}));res.writeHead(302,{'Location':scope === 'admin' ? '/admin/?login=erro' : '/?login=erro','Set-Cookie':cookie(oauthCookie,'',0,'/auth/google/callback'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
    },
    clearCookie:(scope='app')=>cookie(scope === 'admin' ? 'ofertas_admin_session' : 'ofertas_session','',0)
  };
}
