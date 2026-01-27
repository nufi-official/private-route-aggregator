import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import nodePath from 'path';

export default defineConfig({
  plugins: [
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
  },
  define: {
    global: 'globalThis',
    'process.env': 'window.process.env',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
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
    },
  },
});
