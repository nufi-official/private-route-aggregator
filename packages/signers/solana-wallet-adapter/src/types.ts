/**
 * Solana network types
 */
export type SolanaNetwork = 'mainnet' | 'devnet' | 'testnet';

/**
 * Solana address type
 */
export type SolanaAddress = string;

/**
 * Parameters for creating a wallet adapter account
 */
export interface CreateWalletAdapterAccountParams {
  /**
   * Solana network
   */
  network: SolanaNetwork;

  /**
   * Optional custom RPC URL
   */
  rpcUrl?: string;
}

/**
 * Solana decimals (9 for SOL)
 */
export const SOLANA_DECIMALS = 9;

/**
 * Lamports per SOL
 */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
