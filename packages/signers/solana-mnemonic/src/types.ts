/**
 * Solana network types
 */
export type SolanaNetwork = 'mainnet';

/**
 * Solana address (base58 encoded public key)
 */
export type SolanaAddress = string;

/**
 * Parameters for creating a Solana account
 */
export interface CreateSolanaAccountParams {
  mnemonic: string;
  accountIndex: number;
  network: SolanaNetwork;
  rpcUrl?: string;
}

/**
 * Solana decimals (lamports)
 */
export const SOLANA_DECIMALS = 9;

/**
 * Lamports per SOL
 */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
