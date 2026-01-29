// Re-export types from the official @radr/shadowwire SDK
export {
  type TokenSymbol as ShadowWireToken,
  type TransferType,
  type WalletAdapter,
  type PoolBalance,
  type DepositRequest,
  type DepositResponse,
  type WithdrawRequest,
  type WithdrawResponse,
  type TransferRequest,
  type TransferResponse,
  type ZKTransferResponse,
  SUPPORTED_TOKENS,
  TOKEN_FEES,
  TOKEN_DECIMALS,
  TOKEN_MINTS,
  TOKEN_MINIMUMS,
} from '@radr/shadowwire';

// Additional types for our provider wrapper
import type { VersionedTransaction } from '@solana/web3.js';

/**
 * Wallet signer interface for wallet adapter support
 */
export interface WalletSigner {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

/**
 * Configuration for ShadowWire provider
 */
export interface ShadowWireConfig {
  /**
   * Wallet signer with signMessage and signTransaction capability
   */
  walletSigner: WalletSigner;

  /**
   * Solana RPC URL for submitting transactions
   */
  rpcUrl?: string;

  /**
   * Token to use for transactions (default: 'SOL')
   */
  token?: import('@radr/shadowwire').TokenSymbol;

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;

  /**
   * Path to WASM file for client-side proof generation (optional)
   */
  wasmPath?: string;

  /**
   * Enable client-side proof generation (requires WASM)
   */
  useClientProofs?: boolean;
}
