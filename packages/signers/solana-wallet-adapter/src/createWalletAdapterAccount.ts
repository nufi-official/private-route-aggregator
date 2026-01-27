import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { CreateWalletAdapterAccountParams } from './types';
import { WalletAdapterAccount } from './walletAdapterAccount';

/**
 * Factory function to create a Solana account from a connected wallet adapter
 *
 * @param wallet - The wallet context from useWallet() hook
 * @param params - Account creation parameters
 * @returns WalletAdapterAccount instance
 *
 * @example
 * ```tsx
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { createWalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
 *
 * function MyComponent() {
 *   const wallet = useWallet();
 *
 *   const handleConnect = () => {
 *     if (wallet.connected) {
 *       const account = createWalletAdapterAccount(wallet, {
 *         network: 'mainnet',
 *       });
 *       // Use account...
 *     }
 *   };
 * }
 * ```
 */
export function createWalletAdapterAccount(
  wallet: WalletContextState,
  params: CreateWalletAdapterAccountParams
): WalletAdapterAccount {
  return new WalletAdapterAccount({
    wallet,
    network: params.network,
    rpcUrl: params.rpcUrl,
  });
}
