import type { VersionedTransaction } from '@solana/web3.js';

/**
 * Solana address type
 */
export type SolanaAddress = string;

/**
 * Supported Solana networks
 */
export type SolanaNetwork = 'mainnet' | 'devnet' | 'testnet';

/**
 * Ledger connection status
 */
export type LedgerConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Ledger account info from derivation
 */
export interface LedgerAccountInfo {
  /** Derivation path used */
  path: string;
  /** Account index in the derivation path */
  accountIndex: number;
  /** Public key / address */
  address: SolanaAddress;
  /** Balance in lamports (if fetched) */
  balance?: bigint;
}

/**
 * Configuration for Ledger account
 */
export interface LedgerConfig {
  /** Solana network to use */
  network: SolanaNetwork;
  /** Custom RPC URL (optional) */
  rpcUrl?: string;
  /** Account index for derivation (default: 0) */
  accountIndex?: number;
}

/**
 * WalletSigner interface compatible with privacy providers
 */
export interface WalletSigner {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

/**
 * Default derivation path for Solana on Ledger
 * BIP44: m/44'/501'/accountIndex'/0'
 */
export const SOLANA_DERIVATION_PATH_PREFIX = "44'/501'";

/**
 * Get full derivation path for an account index
 */
export function getDerivationPath(accountIndex: number): string {
  return `${SOLANA_DERIVATION_PATH_PREFIX}/${accountIndex}'/0'`;
}
