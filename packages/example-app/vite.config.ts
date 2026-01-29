import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { createRequire } from 'module';
import nodePath from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const bufferShimPath = require.resolve('vite-plugin-node-polyfills/shims/buffer');

// Plugin to serve WASM files from node_modules with correct MIME type
function serveWasmPlugin(): Plugin {
  return {
    name: 'serve-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip query parameters and check for .wasm extension
        const urlPath = req.url?.split('?')[0] || '';
        if (urlPath.endsWith('.wasm')) {
          console.log('[WASM] Request:', req.url);
          const wasmFileName = urlPath.split('/').pop();
          // Preserve the full path for public folder lookups (e.g., /circuit2/transaction2.wasm)
          const publicPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;

          const wasmPaths = [
            // Public folder with full path (for /circuit2/*.wasm etc.)
            nodePath.resolve(__dirname, 'public', publicPath),
            // Direct in example-app node_modules
            nodePath.resolve(__dirname, 'node_modules/@lightprotocol/hasher.rs/dist', wasmFileName!),
            // In pnpm store
            nodePath.resolve(__dirname, '../../node_modules/.pnpm/@lightprotocol+hasher.rs@0.2.1/node_modules/@lightprotocol/hasher.rs/dist', wasmFileName!),
            // In privacy-cash node_modules
            nodePath.resolve(__dirname, '../private-routers/privacy-cash/node_modules/@lightprotocol/hasher.rs/dist', wasmFileName!),
            // Public folder (filename only, for backwards compatibility)
            nodePath.resolve(__dirname, 'public', wasmFileName!),
          ];

          for (const wasmPath of wasmPaths) {
            if (fs.existsSync(wasmPath)) {
              console.log('[WASM] Serving from:', wasmPath);
              res.setHeader('Content-Type', 'application/wasm');
              fs.createReadStream(wasmPath).pipe(res);
              return;
            }
          }
          console.log('[WASM] NOT FOUND:', urlPath, '- tried:', wasmPaths);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    serveWasmPlugin(),
    wasm(),
    topLevelAwait(),
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events'],
      globals: {
        Buffer: true,
        global: true,
        process: false,
      },
      protocolImports: true,
    }),
  ],
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: ['../..'],
    },
  },
  define: {
    global: 'globalThis',
    'process.env': 'window.process.env',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    // Include all deps for proper pre-bundling
    include: ['@lightprotocol/hasher.rs', 'privacycash'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      // Only alias during build — in dev, vite-plugin-node-polyfills handles this.
      // Use the plugin's own shim (already browser-ready) so it gets bundled.
      ...(command === 'build' ? { 'vite-plugin-node-polyfills/shims/buffer': bufferShimPath } : {}),
      'bn.js': 'bn.js/lib/bn.js',
      'node-localstorage': nodePath.resolve(__dirname, 'src/shims/node-localstorage.ts'),
      os: nodePath.resolve(__dirname, 'src/shims/os.ts'),
      'node:os': nodePath.resolve(__dirname, 'src/shims/os.ts'),
      path: nodePath.resolve(__dirname, 'src/shims/path.ts'),
      'node:path': nodePath.resolve(__dirname, 'src/shims/path.ts'),
      // Resolve privacycash/utils subpath export
      'privacycash/utils': nodePath.resolve(__dirname, '../private-routers/privacy-cash/node_modules/privacycash/dist/exportUtils.js'),
    },
  },
  assetsInclude: ['**/*.wasm'],
}));
