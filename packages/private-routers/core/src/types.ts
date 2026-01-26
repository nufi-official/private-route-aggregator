import type { Account } from '@privacy-router-sdk/signers-core';

/**
 * Withdrawal destination - address to receive funds
 */
export type WithdrawDestination = {
  address: string;
};

/**
 * Funding status updates
 */
export type FundingStatus =
  | { stage: 'preparing' }
  | { stage: 'depositing'; txHash?: string }
  | { stage: 'confirming'; txHash: string }
  | { stage: 'completed'; txHash: string }
  | { stage: 'failed'; error: string };

/**
 * Withdrawal status updates
 */
export type WithdrawStatus =
  | { stage: 'preparing' }
  | { stage: 'processing' }
  | { stage: 'confirming'; txHash?: string }
  | { stage: 'completed'; txHash?: string }
  | { stage: 'failed'; error: string };

/**
 * Privacy provider interface
 * Implementations route crypto through privacy mechanisms (mixing/shielding)
 */
export interface PrivacyProvider {
  readonly name: string;

  /**
   * Fund the privacy pool with crypto
   */
  fund(params: {
    sourceAccount: Account;
    amount: string;
    onStatusChange?: (status: FundingStatus) => void;
  }): Promise<void>;

  /**
   * Withdraw from the privacy pool
   */
  withdraw(params: {
    destination: WithdrawDestination;
    amount: string;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<void>;

  /**
   * Get current balance in the privacy pool
   */
  getPrivateBalance(): Promise<bigint>;
}
