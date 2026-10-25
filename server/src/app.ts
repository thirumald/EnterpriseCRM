import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRouter } from './routes.ts';
import { wireNotifications } from './alerts.ts';

let wired = false;
export function buildApp() {
  if (!wired) { wireNotifications(); wired = true; }
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', buildRouter());
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
