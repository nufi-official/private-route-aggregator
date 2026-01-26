import type { Account } from '@privacy-router-sdk/signers-core';
import type { CreateSolanaAccountParams } from './types';
import { SolanaAccount } from './solanaAccount';

/**
 * Factory function to create a Solana account from mnemonic
 *
 * @param params - Account creation parameters
 * @returns Account instance
 *
 * @example
 * ```typescript
 * const account = createSolanaAccount({
 *   mnemonic: 'your twelve word mnemonic phrase here...',
 *   accountIndex: 0,
 *   network: 'mainnet',
 *   rpcUrl: 'https://api.mainnet-beta.solana.com', // optional
 * });
 *
 * const address = await account.getAddress();
 * const balance = await account.getBalance();
 * const txSig = await account.sendDeposit({
 *   address: 'destinationAddress...',
 *   amount: '1000000000', // 1 SOL in lamports
 * });
 * ```
 */
export function createSolanaAccount(params: CreateSolanaAccountParams): Account {
  const { mnemonic, accountIndex, network, rpcUrl } = params;

  return new SolanaAccount({
    mnemonic,
    accountIndex,
    network,
    rpcUrl,
  });
}
