import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const HTML_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

const ASSET_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

const DEFAULT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
};

app.enable('trust proxy');
app.use(compression());

const distPath = path.join(__dirname, 'dist');

app.use(
  express.static(distPath, {
    cacheControl: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set(HTML_CACHE_HEADERS);
      } else if (filePath.includes('/assets/')) {
        res.set(ASSET_CACHE_HEADERS);
      } else {
        res.set(DEFAULT_CACHE_HEADERS);
      }
    },
  }),
);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile('index.html', {
    root: distPath,
    headers: HTML_CACHE_HEADERS,
  });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
