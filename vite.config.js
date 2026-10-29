import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { Database, createApp } from './server.js';
import { loadDevGoogleAuth } from './scripts/infisical-run.js';

export default defineConfig({
  plugins: [tailwindcss(), {
    name: 'local-api',
    async configureServer(server) {
      let googleAuth;
      if (!process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_SECRET) {
        try { googleAuth = await loadDevGoogleAuth(); }
        catch { console.error('Não foi possível carregar o login Google do Infisical.'); }
      }
      const db = new Database(process.env.DATABASE_PATH || 'ofertas.sqlite3');
      const api = createApp(db, undefined, { googleAuth });
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/') || req.url?.startsWith('/auth/google')) api.emit('request', req, res);
        else next();
      });
      server.httpServer?.once('close', () => { db.close(); });
    }
  }]
});
