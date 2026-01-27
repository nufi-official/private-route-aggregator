import type { PrivacyProvider, FundingStatus, WithdrawStatus, WithdrawDestination } from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import { PrivacyCashProvider, type PrivacyCashAsset } from '@privacy-router-sdk/privacy-cash';
import { OneClickApi, swap, type SwapApi, type SwapStateChangeEvent } from '@privacy-router-sdk/near-intents';
import type {
  PrivacyAggregatorConfig,
  CrossChainFundParams,
} from './types';
import {
  isPrivateKeyConfig,
  isWalletSignerConfig,
  PRIVACY_CASH_TO_NEAR_INTENTS_ASSET,
} from './types';

/**
 * Privacy Aggregator Provider
 *
 * Combines NEAR Intents cross-chain swaps with Privacy Cash privacy pools.
 *
 * Features:
 * - Direct SOL funding (same as PrivacyCashProvider)
 * - Cross-chain funding: swap any asset → SOL → privacy pool
 * - Unified interface for both browser wallets and mnemonic wallets
 */
export class PrivacyAggregatorProvider implements PrivacyProvider {
  readonly name = 'privacy-aggregator';

  private privacyCashProvider: PrivacyCashProvider;
  private swapApi: SwapApi;
  private config: PrivacyAggregatorConfig;
  private asset: PrivacyCashAsset;

  constructor(config: PrivacyAggregatorConfig, asset: PrivacyCashAsset = 'SOL') {
    this.config = config;
    this.asset = asset;

    // Initialize Privacy Cash provider based on config type
    if (isPrivateKeyConfig(config)) {
      this.privacyCashProvider = new PrivacyCashProvider(
        {
          rpcUrl: config.rpcUrl,
          owner: config.owner,
          enableDebug: config.enableDebug,
        },
        asset
      );
    } else if (isWalletSignerConfig(config)) {
      this.privacyCashProvider = new PrivacyCashProvider(
        {
          rpcUrl: config.rpcUrl,
          walletSigner: config.walletSigner,
          enableDebug: config.enableDebug,
        },
        asset
      );
    } else {
      throw new Error('Invalid config: must provide either owner or walletSigner');
    }

    // Initialize NEAR Intents API
    this.swapApi = OneClickApi({
      jwtToken: config.nearIntentsJwtToken,
      apiBaseUrl: config.nearIntentsApiUrl,
    });
  }

  /**
   * Get the underlying Privacy Cash provider
   */
  getPrivacyCashProvider(): PrivacyCashProvider {
    return this.privacyCashProvider;
  }

  /**
   * Get the NEAR Intents swap API
   */
  getSwapApi(): SwapApi {
    return this.swapApi;
  }

  /**
   * Check if provider needs signature initialization (for wallet signer mode)
   */
  needsSignature(): boolean {
    return this.privacyCashProvider.needsSignature();
  }

  /**
   * Get the derived address for the privacy pool (only available after initialization)
   */
  getDerivedAddress(): string | null {
    return this.privacyCashProvider.getDerivedAddress();
  }

  /**
   * Fund the privacy pool directly with SOL (same chain)
   * Use this when the source is already SOL on Solana
   */
  async fund(params: {
    sourceAccount: Account;
    amount: string;
    onStatusChange?: (status: FundingStatus) => void;
  }): Promise<void> {
    return this.privacyCashProvider.fund(params);
  }

  /**
   * Fund the privacy pool via cross-chain swap
   * Use this when the source is a different asset (e.g., NEAR, ETH, USDC on other chains)
   *
   * Flow:
   * 1. Get quote from NEAR Intents (source asset → SOL)
   * 2. User deposits source asset to NEAR Intents deposit address
   * 3. NEAR Intents swaps and sends SOL to privacy pool derived address
   * 4. Privacy Cash deposits from derived address to privacy pool
   */
  async fundCrossChain(params: CrossChainFundParams): Promise<void> {
    const { sourceAsset, amount, senderAddress, sendDeposit, onStatusChange } = params;

    try {
      onStatusChange?.({ stage: 'preparing' });

      // Get the destination asset (SOL or SPL token based on privacy cash asset)
      const destinationAsset = PRIVACY_CASH_TO_NEAR_INTENTS_ASSET[this.asset];

      // Get the derived address where SOL should be sent
      // This will trigger signature if needed (for wallet signer mode)
      const derivedAddress = await this.initializeAndGetDerivedAddress();

      onStatusChange?.({
        stage: 'getting_quote',
        sourceAsset,
        destinationAsset
      });

      // Create quote params
      const quoteParams = {
        dry: false,
        senderAddress,
        recipientAddress: derivedAddress,
        originAsset: sourceAsset,
        destinationAsset,
        amount,
        slippageTolerance: this.config.slippageTolerance ?? 0.01,
        referral: this.config.referral,
      };

      // Map NEAR Intents status to our status
      const handleSwapStatusChange = (event: SwapStateChangeEvent) => {
        if (event.status === 'QUOTE_RECEIVED') {
          onStatusChange?.({
            stage: 'awaiting_deposit',
            depositAddress: event.depositAddress
          });
        } else if (event.status === 'DEPOSIT_SENT') {
          onStatusChange?.({
            stage: 'deposit_sent',
            txHash: event.txHash
          });
        } else if (event.status === 'PROCESSING') {
          onStatusChange?.({ stage: 'swapping', status: event.status });
        } else if (event.status === 'SUCCESS') {
          onStatusChange?.({ stage: 'swap_completed' });
        } else if (event.status === 'FAILED' || event.status === 'REFUNDED') {
          onStatusChange?.({
            stage: 'failed',
            error: `Swap ${event.status.toLowerCase()}`
          });
        }
      };

      // Execute the swap
      await swap({
        swapApi: this.swapApi,
        quote: quoteParams,
        sendDeposit,
        onStatusChange: handleSwapStatusChange,
      });

      // After swap completes, deposit to privacy pool
      onStatusChange?.({ stage: 'depositing_to_pool' });

      // The SOL is now in the derived address
      // Deposit it to the privacy pool using the derived keypair (no wallet signature needed)
      let depositTxHash = '';
      await this.privacyCashProvider.depositDirect({
        amount, // Use the original amount - actual received may vary due to slippage
        onStatusChange: (status: FundingStatus) => {
          if (status.stage === 'completed' && 'txHash' in status) {
            depositTxHash = status.txHash;
          }
        },
      });

      onStatusChange?.({ stage: 'completed', txHash: depositTxHash });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Initialize the provider and get the derived address
   * For private key mode, this is immediate
   * For wallet signer mode, this prompts for signature
   */
  private async initializeAndGetDerivedAddress(): Promise<string> {
    // Call getPrivateBalance to trigger initialization if needed
    await this.privacyCashProvider.getPrivateBalance();

    const derivedAddress = this.privacyCashProvider.getDerivedAddress();
    if (!derivedAddress) {
      // For private key mode, there's no derived address - use the owner's address
      // This is a fallback, ideally the privacy cash provider should expose this
      throw new Error('Could not get destination address for privacy pool');
    }

    return derivedAddress;
  }

  /**
   * Withdraw from the privacy pool
   */
  async withdraw(params: {
    destination: WithdrawDestination;
    amount: string;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<void> {
    return this.privacyCashProvider.withdraw(params);
  }

  /**
   * Get the private balance in the privacy pool
   */
  async getPrivateBalance(): Promise<bigint> {
    return this.privacyCashProvider.getPrivateBalance();
  }

  /**
   * Get available tokens for cross-chain swaps
   */
  async getAvailableSourceAssets() {
    return this.swapApi.getTokens();
  }
}
