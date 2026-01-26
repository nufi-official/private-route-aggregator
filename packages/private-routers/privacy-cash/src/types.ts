import type { Keypair } from '@solana/web3.js';

/**
 * Configuration for Privacy Cash provider
 */
export interface PrivacyCashConfig {
  /**
   * Solana RPC URL
   */
  rpcUrl?: string;

  /**
   * Owner keypair - can be:
   * - Keypair instance
   * - Base58 encoded private key string
   * - Uint8Array
   * - number[]
   */
  owner: Keypair | string | Uint8Array | number[];

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;
}

/**
 * Supported assets for Privacy Cash
 */
export type PrivacyCashAsset = 'SOL' | 'USDC' | 'USDT';

/**
 * SPL token mint addresses on mainnet
 */
export const SPL_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;
