import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';

export const ADMIN_EMAIL = 'brunodeoliveira@gmail.com';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const lifetime = 30*24*60*60;
export function isAdmin(user) { return user?.email?.toLowerCase() === ADMIN_EMAIL; }
export function createSession(db,user) {
  db.prepare('INSERT INTO users(id,email,name,picture) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture').run(user.sub,user.email.toLowerCase(),user.name,user.picture || null);
  if (isAdmin(user)) db.prepare("UPDATE lists SET owner_id=? WHERE owner_id='legacy-admin'").run(user.sub);
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Math.floor(Date.now()/1000));
  const raw=token();db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(raw),user.sub,Math.floor(Date.now()/1000)+lifetime);return raw;
}
export function getSession(db,req) {
  const raw=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('ofertas_session='))?.slice('ofertas_session='.length);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const row=db.prepare('SELECT users.id AS sub,users.email,users.name,users.picture FROM auth_sessions JOIN users ON users.id=auth_sessions.user_id WHERE token_hash=? AND expires_at>?').get(hash(raw),Math.floor(Date.now()/1000));
  return row ? {...row,admin:isAdmin(row)} : null;
}
export function destroySession(db,req) {
  const raw=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('ofertas_session='))?.slice('ofertas_session='.length);
  if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(raw));
}
export function createGoogleAuth(options = {}) {
  const clientId=options.clientId ?? process.env.GOOGLE_CLIENT_ID, clientSecret=options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri=options.redirectUri ?? process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8000/auth/google/callback';
  const secure=redirectUri.startsWith('https://');
  const oauth=options.client || (clientId && clientSecret ? new OAuth2Client(clientId,clientSecret,redirectUri) : null);
  const pending=new Map();
  const cookie=(name,value,maxAge,path='/') => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  return {
    available:!!oauth,
    begin(req,res) {
      if (!oauth) {res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Login Google ainda não configurado.');return;}
      for (const [key,value] of pending) if (value.expires < Date.now()) pending.delete(key);
      if (pending.size >= 1000) {res.writeHead(429);res.end();return;}
      const state=token(),nonce=token(),verifier=token(),challenge=createHash('sha256').update(verifier).digest('base64url');
      pending.set(state,{nonce,verifier,expires:Date.now()+600000});
      const url=oauth.generateAuthUrl({scope:['openid','email','profile'],response_type:'code',state,nonce,code_challenge:challenge,code_challenge_method:'S256'});
      res.writeHead(302,{'Location':url,'Set-Cookie':cookie('ofertas_oauth',state,600,'/auth/google/callback'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
    },
    async callback(req,res,db,url) {
      const state=url.searchParams.get('state') || '', code=url.searchParams.get('code') || '';
      const saved=String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('ofertas_oauth='))?.slice('ofertas_oauth='.length) || '';
      const attempt=pending.get(state);pending.delete(state);
      const same=/^[A-Za-z0-9_-]{43}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(saved) && timingSafeEqual(Buffer.from(state),Buffer.from(saved));
      try {
        if (!oauth || !same || !attempt || attempt.expires < Date.now() || !code) throw Error('Estado de login inválido.');
        const {tokens}=await oauth.getToken({code,codeVerifier:attempt.verifier,redirect_uri:redirectUri});
        if (!tokens.id_token) throw Error('Token de identidade ausente.');
        const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId});const info=ticket.getPayload();
        if (!info || info.nonce !== attempt.nonce || info.email_verified !== true || typeof info.sub !== 'string' || !info.sub || typeof info.email !== 'string' || !info.email) throw Error('Identidade Google inválida.');
        let picture = null;
        try { const url = new URL(info.picture); if (url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) && url.href.length <= 2048) picture = url.href; } catch {}
        const user={sub:info.sub,email:info.email,name:typeof info.name==='string' ? info.name.slice(0,120) : info.email,picture};destroySession(db,req);const session=createSession(db,user);
        console.log(JSON.stringify({type:'audit',at:new Date().toISOString(),action:'login-google',outcome:'ok',actor:user.sub}));
        res.writeHead(302,{'Location':'/','Set-Cookie':[cookie('ofertas_session',session,lifetime),cookie('ofertas_oauth','',0,'/auth/google/callback')],'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
      } catch (error) {console.error(JSON.stringify({type:'error',at:new Date().toISOString(),scope:'auth:google',detail:'Falha ao validar a autenticação Google.'}));res.writeHead(302,{'Location':'/?login=erro','Set-Cookie':cookie('ofertas_oauth','',0,'/auth/google/callback'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
    },
    clearCookie:()=>cookie('ofertas_session','',0)
  };
}
