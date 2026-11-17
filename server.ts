import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Same-origin image proxy for JOOR CDN assets so PDF generation can embed photos cleanly without CORS tainting
  app.get('/api/image-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).send('Missing url parameter');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid url');
      return;
    }

    if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.jooraccess.com') {
      res.status(403).send('Host not allowed');
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).send(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Proxy fetch failed';
      res.status(502).send(msg);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
