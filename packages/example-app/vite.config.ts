import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import nodePath from 'path';
import fs from 'fs';

// Plugin to serve WASM files from node_modules
function serveWasmPlugin(): Plugin {
  return {
    name: 'serve-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('.wasm')) {
          // Try to find the WASM file in node_modules
          const wasmFileName = req.url.split('/').pop();
          const wasmPaths = [
            nodePath.resolve(__dirname, 'node_modules/@lightprotocol/hasher.rs/dist', wasmFileName!),
            nodePath.resolve(__dirname, '../../node_modules/.pnpm/@lightprotocol+hasher.rs@0.2.1/node_modules/@lightprotocol/hasher.rs/dist', wasmFileName!),
            nodePath.resolve(__dirname, 'public', wasmFileName!),
          ];

          for (const wasmPath of wasmPaths) {
            if (fs.existsSync(wasmPath)) {
              res.setHeader('Content-Type', 'application/wasm');
              fs.createReadStream(wasmPath).pipe(res);
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
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
        process: false, // We inject process via index.html
      },
      protocolImports: true,
    }),
  ],
  server: {
    port: 3000,
    host: true,
    fs: {
      // Allow serving files from node_modules for WASM
      allow: ['../..'],
    },
  },
  assetsInclude: ['**/*.wasm'],
  define: {
    global: 'globalThis',
    'process.env': 'window.process.env',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    // Include privacycash for CJS deps, exclude hasher.rs so WASM loads correctly
    include: ['privacycash'],
    exclude: ['@lightprotocol/hasher.rs'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      'bn.js': 'bn.js/lib/bn.js',
      'node-localstorage': nodePath.resolve(__dirname, 'src/shims/node-localstorage.ts'),
      os: nodePath.resolve(__dirname, 'src/shims/os.ts'),
      'node:os': nodePath.resolve(__dirname, 'src/shims/os.ts'),
      path: nodePath.resolve(__dirname, 'src/shims/path.ts'),
      'node:path': nodePath.resolve(__dirname, 'src/shims/path.ts'),
      // Explicitly resolve privacycash/utils subpath export to the actual file
      'privacycash/utils': nodePath.resolve(__dirname, '../private-routers/privacy-cash/node_modules/privacycash/dist/exportUtils.js'),
    },
  },
});
