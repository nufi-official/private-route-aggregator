import type {
  PrivacyProvider,
  FundingStatus,
  WithdrawStatus,
  WithdrawDestination,
} from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import { Keypair } from '@solana/web3.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { PrivacyCash } from 'privacycash';
import type {
  PrivacyCashConfig,
  PrivacyCashAsset,
  WalletSigner,
} from './types';
import {
  SPL_MINTS,
  PRIVACY_CASH_SIGN_MESSAGE,
  isPrivateKeyConfig,
  isWalletSignerConfig,
} from './types';

// Type assertion for PrivacyCash client since types may be incomplete
type TxResult = { tx: string };
type BalanceResult = { lamports: number };
type SplBalanceResult = { base_units: number };
type PrivacyCashClient = {
  deposit(params: { lamports: number }): Promise<TxResult>;
  depositSPL(params: { base_units: number; mintAddress: string }): Promise<TxResult>;
  withdraw(params: { lamports: number; recipientAddress?: string }): Promise<TxResult>;
  withdrawSPL(params: {
    base_units: number;
    mintAddress: string;
    recipientAddress?: string;
  }): Promise<TxResult>;
  getPrivateBalance(): Promise<BalanceResult>;
  getPrivateBalanceSpl(mintAddress: string): Promise<SplBalanceResult>;
};

/**
 * Derive a Keypair from a signature using SHA-256 hash
 * The signature is hashed to get 32 bytes which are used as the seed
 */
async function deriveKeypairFromSignature(signature: Uint8Array): Promise<Keypair> {
  // Use the first 32 bytes of the signature as seed for the keypair
  // For ed25519, we need exactly 32 bytes for the seed
  const seed = signature.slice(0, 32);
  return Keypair.fromSeed(seed);
}

/**
 * Privacy Cash Provider
 * Implements PrivacyProvider using Privacy Cash on Solana
 *
 * Supports two modes:
 * 1. Private key mode: Direct private key/keypair (for mnemonic wallets)
 * 2. Wallet signer mode: Derives keys from a wallet signature (for browser extension wallets)
 */
export class PrivacyCashProvider implements PrivacyProvider {
  readonly name = 'privacy-cash';

  private client: PrivacyCashClient | null = null;
  private asset: PrivacyCashAsset;
  private config: PrivacyCashConfig;
  private walletSigner: WalletSigner | null = null;
  private derivedKeypair: Keypair | null = null;
  private initialized = false;

  constructor(config: PrivacyCashConfig, asset: PrivacyCashAsset = 'SOL') {
    this.config = config;
    this.asset = asset;

    // If private key mode, initialize immediately
    if (isPrivateKeyConfig(config)) {
      this.initializeWithPrivateKey(config.owner, config.rpcUrl, config.enableDebug);
      this.initialized = true;
    } else if (isWalletSignerConfig(config)) {
      // Wallet signer mode - defer initialization until first use
      this.walletSigner = config.walletSigner;
    }
  }

  private initializeWithPrivateKey(
    owner: Keypair | string | Uint8Array | number[],
    rpcUrl?: string,
    enableDebug?: boolean
  ): void {
    const finalRpcUrl = rpcUrl || process.env['SOLANA_RPC_URL'];

    if (!finalRpcUrl) {
      throw new Error(
        'RPC URL required. Provide via config or SOLANA_RPC_URL env var.'
      );
    }

    this.client = new PrivacyCash({
      RPC_url: finalRpcUrl,
      owner: owner as string | number[] | Uint8Array | Keypair,
      enableDebug,
    }) as PrivacyCashClient;
  }

  /**
   * Initialize the client using wallet signature
   * This will prompt the user to sign a message
   */
  private async initializeWithWalletSigner(): Promise<void> {
    if (this.initialized || !this.walletSigner) {
      return;
    }

    const rpcUrl =
      (this.config as { rpcUrl?: string }).rpcUrl ||
      process.env['SOLANA_RPC_URL'];

    if (!rpcUrl) {
      throw new Error(
        'RPC URL required. Provide via config or SOLANA_RPC_URL env var.'
      );
    }

    // Ask user to sign message
    const messageBytes = new TextEncoder().encode(PRIVACY_CASH_SIGN_MESSAGE);
    const signature = await this.walletSigner.signMessage(messageBytes);

    // Derive keypair from signature
    this.derivedKeypair = await deriveKeypairFromSignature(signature);

    // Initialize client with derived keypair
    this.client = new PrivacyCash({
      RPC_url: rpcUrl,
      owner: this.derivedKeypair.secretKey,
      enableDebug: (this.config as { enableDebug?: boolean }).enableDebug,
    }) as PrivacyCashClient;

    this.initialized = true;
  }

  /**
   * Check if using wallet signer mode (browser extension wallet)
   */
  private isWalletSignerMode(): boolean {
    return isWalletSignerConfig(this.config);
  }

  /**
   * Get the derived keypair's public key (only available after initialization in wallet signer mode)
   */
  getDerivedAddress(): string | null {
    return this.derivedKeypair?.publicKey.toBase58() ?? null;
  }

  /**
   * Ensure client is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeWithWalletSigner();
    }
    if (!this.client) {
      throw new Error('Privacy Cash client not initialized');
    }
  }

  /**
   * Check if provider needs signature initialization
   */
  needsSignature(): boolean {
    return isWalletSignerConfig(this.config) && !this.initialized;
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
    const { sourceAccount, amount, onStatusChange } = params;

    try {
      onStatusChange?.({ stage: 'preparing' });

      await this.ensureInitialized();

      const baseUnits = BigInt(amount);

      // For wallet signer mode, we need to transfer from user's wallet to the derived keypair first
      // The derived keypair is what the PrivacyCash SDK uses internally
      if (this.isWalletSignerMode() && this.derivedKeypair) {
        const derivedAddress = this.derivedKeypair.publicKey.toBase58();

        // Add extra lamports for transaction fees (the privacycash SDK will need to pay fees)
        // 0.0005 SOL (500,000 lamports) should be enough for deposit transaction fees
        const FEE_BUFFER = 500_000n; // 0.0005 SOL in lamports
        const totalAmount = baseUnits + FEE_BUFFER;

        onStatusChange?.({ stage: 'preparing' });

        // Transfer from user's wallet to derived address
        await sourceAccount.sendDeposit({
          address: derivedAddress,
          amount: totalAmount.toString(),
        });
      }

      onStatusChange?.({ stage: 'depositing' });

      let result: TxResult;
      if (this.asset === 'SOL') {
        result = await this.client!.deposit({ lamports: Number(baseUnits) });
      } else {
        const mintAddress = SPL_MINTS[this.asset];
        result = await this.client!.depositSPL({
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

      await this.ensureInitialized();

      const baseUnits = BigInt(amount);

      onStatusChange?.({ stage: 'processing' });

      let result: TxResult;
      if (this.asset === 'SOL') {
        result = await this.client!.withdraw({
          lamports: Number(baseUnits),
          recipientAddress: destination.address,
        });
      } else {
        const mintAddress = SPL_MINTS[this.asset];
        result = await this.client!.withdrawSPL({
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
    await this.ensureInitialized();

    if (this.asset === 'SOL') {
      const result = await this.client!.getPrivateBalance();
      return BigInt(result.lamports);
    } else {
      const mintAddress = SPL_MINTS[this.asset];
      const result = await this.client!.getPrivateBalanceSpl(mintAddress);
      return BigInt(result.base_units);
    }
  }
}
