import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@solana/wallet-adapter-base',
    '@solana/wallet-adapter-react',
    '@solana/web3.js',
  ],
});
