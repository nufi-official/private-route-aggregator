import type { Keypair } from '@solana/web3.js';

/**
 * Signer interface for wallet adapter support
 */
export interface WalletSigner {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Configuration for Privacy Cash provider - Private Key mode
 */
export interface PrivacyCashConfigPrivateKey {
  /**
   * Solana RPC URL
   */
  rpcUrl?: string;

  /**
   * Owner keypair - can be:
   * - Keypair instance
   * - Base58 encoded private key string
   * - Uint8Array (64 bytes secret key)
   * - number[]
   */
  owner: Keypair | string | Uint8Array | number[];

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;
}

/**
 * Configuration for Privacy Cash provider - Wallet Signer mode
 */
export interface PrivacyCashConfigWalletSigner {
  /**
   * Solana RPC URL
   */
  rpcUrl?: string;

  /**
   * Wallet signer with signMessage capability
   */
  walletSigner: WalletSigner;

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;
}

/**
 * Combined config type
 */
export type PrivacyCashConfig = PrivacyCashConfigPrivateKey | PrivacyCashConfigWalletSigner;

/**
 * Type guard for private key config
 */
export function isPrivateKeyConfig(config: PrivacyCashConfig): config is PrivacyCashConfigPrivateKey {
  return 'owner' in config;
}

/**
 * Type guard for wallet signer config
 */
export function isWalletSignerConfig(config: PrivacyCashConfig): config is PrivacyCashConfigWalletSigner {
  return 'walletSigner' in config;
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

/**
 * Message to sign for deriving Privacy Cash keys
 */
export const PRIVACY_CASH_SIGN_MESSAGE = 'Sign this message to access Privacy Cash.\n\nThis signature will be used to derive your private keys for the privacy pool.\n\nThis will NOT trigger any blockchain transaction or cost any gas fees.';
