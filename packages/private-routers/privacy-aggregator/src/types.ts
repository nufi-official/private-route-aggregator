import type { SwapApi } from '@privacy-router-sdk/near-intents';
import type { WalletSigner, PrivacyCashAsset } from '@privacy-router-sdk/privacy-cash';
import type { Keypair } from '@solana/web3.js';

/**
 * Supported source assets for cross-chain funding
 * Format: blockchain:symbol or blockchain:contractAddress
 */
export type SourceAsset = string;

/**
 * Common configuration options
 */
export interface PrivacyAggregatorConfigBase {
  /**
   * Solana RPC URL for privacy cash operations
   */
  rpcUrl?: string;

  /**
   * NEAR Intents JWT token (or set via NEAR_INTENTS_JWT_TOKEN env var)
   */
  nearIntentsJwtToken?: string;

  /**
   * NEAR Intents API base URL
   */
  nearIntentsApiUrl?: string;

  /**
   * Slippage tolerance for swaps (default: 0.01 = 1%)
   */
  slippageTolerance?: number;

  /**
   * Referral address for NEAR Intents
   */
  referral?: string;

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;
}

/**
 * Configuration with private key (for mnemonic wallets)
 */
export interface PrivacyAggregatorConfigPrivateKey extends PrivacyAggregatorConfigBase {
  /**
   * Owner keypair for privacy cash
   */
  owner: Keypair | string | Uint8Array | number[];
}

/**
 * Configuration with wallet signer (for browser extension wallets)
 */
export interface PrivacyAggregatorConfigWalletSigner extends PrivacyAggregatorConfigBase {
  /**
   * Wallet signer for signing messages and transactions
   */
  walletSigner: WalletSigner;
}

/**
 * Combined config type
 */
export type PrivacyAggregatorConfig =
  | PrivacyAggregatorConfigPrivateKey
  | PrivacyAggregatorConfigWalletSigner;

/**
 * Type guard for private key config
 */
export function isPrivateKeyConfig(
  config: PrivacyAggregatorConfig
): config is PrivacyAggregatorConfigPrivateKey {
  return 'owner' in config;
}

/**
 * Type guard for wallet signer config
 */
export function isWalletSignerConfig(
  config: PrivacyAggregatorConfig
): config is PrivacyAggregatorConfigWalletSigner {
  return 'walletSigner' in config;
}

/**
 * Funding status for cross-chain operations
 */
export type CrossChainFundingStatus =
  | { stage: 'preparing' }
  | { stage: 'getting_quote'; sourceAsset: string; destinationAsset: string }
  | { stage: 'awaiting_deposit'; depositAddress: string }
  | { stage: 'deposit_sent'; txHash: string }
  | { stage: 'swapping'; status: string }
  | { stage: 'swap_completed' }
  | { stage: 'depositing_to_pool' }
  | { stage: 'completed'; txHash: string }
  | { stage: 'failed'; error: string };

/**
 * Parameters for cross-chain funding
 */
export interface CrossChainFundParams {
  /**
   * Source asset identifier (e.g., "near:native", "ethereum:usdc")
   */
  sourceAsset: SourceAsset;

  /**
   * Amount in source asset base units
   */
  amount: string;

  /**
   * Sender address on source chain
   */
  senderAddress: string;

  /**
   * Callback to send deposit on source chain
   * This will be called with the deposit address from NEAR Intents
   */
  sendDeposit: (params: { address: string; amount: string }) => Promise<string>;

  /**
   * Status change callback
   */
  onStatusChange?: (status: CrossChainFundingStatus) => void;
}

/**
 * Destination asset on Solana for privacy pool
 */
export const SOLANA_SOL_ASSET = 'solana:native';
export const SOLANA_USDC_ASSET = 'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_USDT_ASSET = 'solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

/**
 * Map privacy cash assets to NEAR Intents asset IDs
 */
export const PRIVACY_CASH_TO_NEAR_INTENTS_ASSET: Record<PrivacyCashAsset, string> = {
  SOL: SOLANA_SOL_ASSET,
  USDC: SOLANA_USDC_ASSET,
  USDT: SOLANA_USDT_ASSET,
};
