import type {
  PrivacyProvider,
  FundingStatus,
  WithdrawStatus,
  WithdrawDestination,
} from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { PrivacyCash } from 'privacycash';
import type { PrivacyCashConfig, PrivacyCashAsset } from './types';
import { SPL_MINTS } from './types';

// Type assertion for PrivacyCash client since types may be incomplete
type TxResult = { tx: string };
type BalanceResult = { lamports: number };
type SplBalanceResult = { base_units: number };
type PrivacyCashClient = {
  deposit(params: { lamports: number }): Promise<TxResult>;
  depositSPL(params: { base_units: number; mintAddress: string }): Promise<TxResult>;
  withdraw(params: { lamports: number; recipientAddress?: string }): Promise<TxResult>;
  withdrawSPL(params: { base_units: number; mintAddress: string; recipientAddress?: string }): Promise<TxResult>;
  getPrivateBalance(): Promise<BalanceResult>;
  getPrivateBalanceSpl(mintAddress: string): Promise<SplBalanceResult>;
};

/**
 * Privacy Cash Provider
 * Implements PrivacyProvider using Privacy Cash on Solana
 */
export class PrivacyCashProvider implements PrivacyProvider {
  readonly name = 'privacy-cash';

  private client: PrivacyCashClient;
  private asset: PrivacyCashAsset;

  constructor(config: PrivacyCashConfig, asset: PrivacyCashAsset = 'SOL') {
    const rpcUrl = config.rpcUrl || process.env['SOLANA_RPC_URL'];

    if (!rpcUrl) {
      throw new Error(
        'RPC URL required. Provide via config or SOLANA_RPC_URL env var.'
      );
    }

    this.client = new PrivacyCash({
      RPC_url: rpcUrl,
      owner: config.owner,
      enableDebug: config.enableDebug,
    }) as PrivacyCashClient;

    this.asset = asset;
  }

  /**
   * Fund the privacy pool
   * Note: sourceAccount is not used as Privacy Cash manages its own keypair
   */
  async fund(params: {
    sourceAccount: Account;
    amount: string;
    onStatusChange?: (status: FundingStatus) => void;
  }): Promise<void> {
    const { amount, onStatusChange } = params;

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);

      onStatusChange?.({ stage: 'depositing' });

      let result: TxResult;
      if (this.asset === 'SOL') {
        result = await this.client.deposit({ lamports: Number(baseUnits) });
      } else {
        const mintAddress = SPL_MINTS[this.asset];
        result = await this.client.depositSPL({
          base_units: Number(baseUnits),
          mintAddress,
        });
      }

      onStatusChange?.({ stage: 'completed', txHash: result.tx });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Withdraw from the privacy pool
   */
  async withdraw(params: {
    destination: WithdrawDestination;
    amount: string;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<void> {
    const { destination, amount, onStatusChange } = params;

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);

      onStatusChange?.({ stage: 'processing' });

      let result: TxResult;
      if (this.asset === 'SOL') {
        result = await this.client.withdraw({
          lamports: Number(baseUnits),
          recipientAddress: destination.address,
        });
      } else {
        const mintAddress = SPL_MINTS[this.asset];
        result = await this.client.withdrawSPL({
          base_units: Number(baseUnits),
          mintAddress,
          recipientAddress: destination.address,
        });
      }

      onStatusChange?.({ stage: 'completed', txHash: result.tx });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Get private balance
   */
  async getPrivateBalance(): Promise<bigint> {
    if (this.asset === 'SOL') {
      const result = await this.client.getPrivateBalance();
      return BigInt(result.lamports);
    } else {
      const mintAddress = SPL_MINTS[this.asset];
      const result = await this.client.getPrivateBalanceSpl(mintAddress);
      return BigInt(result.base_units);
    }
  }
}
