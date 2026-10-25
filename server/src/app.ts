import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRouter } from './routes.ts';
import { wireNotifications } from './alerts.ts';
import { guard, SIM_ENABLED } from './auth.ts';

let wired = false;
export function buildApp() {
  if (!wired) { wireNotifications(); wired = true; }
  const app = express();
  const prod = process.env.NODE_ENV === 'production';
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
    if (prod) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  if (!prod) app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', guard({ simEnabled: SIM_ENABLED }), buildRouter());
  const dist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  });
  return app;
}
