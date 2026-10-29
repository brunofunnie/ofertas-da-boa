import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { Database, createApp } from './server.js';

export default defineConfig({
  plugins: [tailwindcss(), {
    name: 'local-api',
    configureServer(server) {
      const db = new Database(process.env.DATABASE_PATH || 'ofertas.sqlite3');
      const api = createApp(db);
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/') || req.url?.startsWith('/auth/google')) api.emit('request', req, res);
        else next();
      });
      server.httpServer?.once('close', () => { api.stopImageSearch(); db.close(); });
    }
  }]
});
