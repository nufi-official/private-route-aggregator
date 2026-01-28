import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@solana/web3.js',
    '@ledgerhq/hw-transport-webhid',
    '@ledgerhq/hw-app-solana',
  ],
});
