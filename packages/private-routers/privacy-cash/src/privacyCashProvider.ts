import type {
  PrivacyProvider,
  FundingStatus,
  WithdrawStatus,
  WithdrawDestination,
} from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { WasmFactory } from '@lightprotocol/hasher.rs';
import type { LightWasm } from '@lightprotocol/hasher.rs';
// Main PrivacyCash class for private key mode
import { PrivacyCash } from 'privacycash';
// Low-level functions for browser wallet support (direct signing, no middleman)
import {
  deposit as privacyCashDeposit,
  withdraw as privacyCashWithdraw,
  getUtxos,
  getBalanceFromUtxos,
  EncryptionService,
  depositSPL as privacyCashDepositSPL,
  withdrawSPL as privacyCashWithdrawSPL,
  getUtxosSPL,
  getBalanceFromUtxosSPL,
} from 'privacycash/utils';
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

// Constants
const KEY_BASE_PATH = '/circuit2/transaction2';

/**
 * Get browser storage (localStorage in browser, mock for Node)
 */
function getStorage(): Storage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  // For Node.js environments, use a simple in-memory storage
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] || null,
    length: Object.keys(store).length,
  } as Storage;
}

/**
 * Privacy Cash Provider
 * Implements PrivacyProvider using Privacy Cash on Solana
 *
 * Supports two modes:
 * 1. Private key mode: Uses PrivacyCash class directly (for mnemonic wallets)
 * 2. Wallet signer mode: Uses low-level functions with transactionSigner (for browser extension wallets)
 *    - NO intermediate keypair holding SOL
 *    - Wallet signs deposit transaction directly
 *    - Only signature needed to derive encryption key for notes
 */
export class PrivacyCashProvider implements PrivacyProvider {
  readonly name = 'privacy-cash';

  // For private key mode (mnemonic wallets)
  private client: PrivacyCashClient | null = null;
  private ownerKeypair: Keypair | null = null;

  // For wallet signer mode (browser wallets) - NO middleman keypair
  private walletSigner: WalletSigner | null = null;
  private encryptionService: EncryptionService | null = null;
  private connection: Connection | null = null;
  private lightWasm: LightWasm | null = null;

  // Common
  private asset: PrivacyCashAsset;
  private config: PrivacyCashConfig;
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

    // Store the owner keypair for address lookup
    if (owner instanceof Keypair) {
      this.ownerKeypair = owner;
    } else if (owner instanceof Uint8Array) {
      this.ownerKeypair = Keypair.fromSecretKey(owner);
    } else if (Array.isArray(owner)) {
      this.ownerKeypair = Keypair.fromSecretKey(new Uint8Array(owner));
    }

    this.client = new PrivacyCash({
      RPC_url: finalRpcUrl,
      owner,
      enableDebug,
    }) as PrivacyCashClient;
  }

  /**
   * Initialize for wallet signer mode (browser extension wallets)
   * This prompts the user to sign a message to derive encryption keys
   * NO keypair is created to hold SOL - wallet signs transactions directly
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

    // Initialize connection
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Load WASM module
    this.lightWasm = await WasmFactory.getInstance();

    // Ask user to sign message (one-time for encryption key derivation)
    const messageBytes = new TextEncoder().encode(PRIVACY_CASH_SIGN_MESSAGE);
    const signature = await this.walletSigner.signMessage(messageBytes);

    // Create encryption service and derive key from signature
    this.encryptionService = new EncryptionService();
    this.encryptionService.deriveEncryptionKeyFromSignature(signature);

    this.initialized = true;
  }

  /**
   * Check if using wallet signer mode (browser extension wallet)
   */
  private isWalletSignerMode(): boolean {
    return isWalletSignerConfig(this.config);
  }

  /**
   * Get the user's public key
   * - For wallet signer mode: returns the wallet's public key
   * - For private key mode: returns the owner keypair's public key
   */
  getPublicKey(): PublicKey | null {
    if (this.walletSigner) {
      return new PublicKey(this.walletSigner.publicKey.toBase58());
    }
    if (this.ownerKeypair) {
      return this.ownerKeypair.publicKey;
    }
    return null;
  }

  /**
   * Get the user's address as string
   */
  getAddress(): string | null {
    const pubkey = this.getPublicKey();
    return pubkey?.toBase58() ?? null;
  }

  /**
   * Ensure provider is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeWithWalletSigner();
    }
    if (!this.initialized) {
      throw new Error('Privacy Cash provider not initialized');
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
   * - For wallet signer mode: wallet signs deposit tx directly (1 transaction, no middleman)
   * - For private key mode: deposits directly from owner address
   */
  async fund(params: {
    sourceAccount: Account;
    amount: string;
    onStatusChange?: (status: FundingStatus) => void;
  }): Promise<void> {
    const { amount, onStatusChange } = params;

    try {
      onStatusChange?.({ stage: 'preparing' });

      await this.ensureInitialized();

      const baseUnits = BigInt(amount);

      onStatusChange?.({ stage: 'depositing' });

      let txHash: string;

      if (this.isWalletSignerMode()) {
        // Browser wallet mode - direct deposit, no middleman!
        txHash = await this.depositWithWalletSigner(baseUnits);
      } else {
        // Private key mode - use PrivacyCash class
        txHash = await this.depositWithClient(baseUnits);
      }

      onStatusChange?.({ stage: 'completed', txHash });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Deposit using wallet signer (browser extension)
   * Wallet signs the transaction directly - no intermediate keypair
   */
  private async depositWithWalletSigner(baseUnits: bigint): Promise<string> {
    if (!this.walletSigner || !this.connection || !this.encryptionService || !this.lightWasm) {
      throw new Error('Wallet signer mode not properly initialized');
    }

    const publicKey = new PublicKey(this.walletSigner.publicKey.toBase58());
    const storage = getStorage();

    // Create transaction signer callback that uses the wallet
    const transactionSigner = async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
      return await this.walletSigner!.signTransaction(tx);
    };

    if (this.asset === 'SOL') {
      const result = await privacyCashDeposit({
        lightWasm: this.lightWasm,
        connection: this.connection,
        amount_in_lamports: Number(baseUnits),
        keyBasePath: KEY_BASE_PATH,
        publicKey,
        transactionSigner,
        storage,
        encryptionService: this.encryptionService,
      });
      return result.tx;
    } else {
      const mintAddress = new PublicKey(SPL_MINTS[this.asset]);
      const result = await privacyCashDepositSPL({
        lightWasm: this.lightWasm,
        connection: this.connection,
        base_units: Number(baseUnits),
        keyBasePath: KEY_BASE_PATH,
        publicKey,
        transactionSigner,
        storage,
        encryptionService: this.encryptionService,
        mintAddress,
      });
      return result.tx;
    }
  }

  /**
   * Deposit using PrivacyCash client (private key mode)
   */
  private async depositWithClient(baseUnits: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('PrivacyCash client not initialized');
    }

    if (this.asset === 'SOL') {
      const result = await this.client.deposit({ lamports: Number(baseUnits) });
      return result.tx;
    } else {
      const mintAddress = SPL_MINTS[this.asset];
      const result = await this.client.depositSPL({
        base_units: Number(baseUnits),
        mintAddress,
      });
      return result.tx;
    }
  }

  /**
   * Withdraw from the privacy pool
   * No wallet signature needed - uses ZK proof
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

      let txHash: string;

      if (this.isWalletSignerMode()) {
        // Browser wallet mode
        txHash = await this.withdrawWithWalletSigner(baseUnits, destination.address);
      } else {
        // Private key mode
        txHash = await this.withdrawWithClient(baseUnits, destination.address);
      }

      onStatusChange?.({ stage: 'completed', txHash });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Withdraw using wallet signer mode
   * No wallet signature needed - just the encryption key for proof
   */
  private async withdrawWithWalletSigner(
    baseUnits: bigint,
    recipientAddress: string
  ): Promise<string> {
    if (!this.walletSigner || !this.connection || !this.encryptionService || !this.lightWasm) {
      throw new Error('Wallet signer mode not properly initialized');
    }

    const publicKey = new PublicKey(this.walletSigner.publicKey.toBase58());
    const recipient = new PublicKey(recipientAddress);
    const storage = getStorage();

    if (this.asset === 'SOL') {
      const result = await privacyCashWithdraw({
        lightWasm: this.lightWasm,
        connection: this.connection,
        amount_in_lamports: Number(baseUnits),
        keyBasePath: KEY_BASE_PATH,
        publicKey,
        recipient,
        storage,
        encryptionService: this.encryptionService,
      });
      return result.tx;
    } else {
      const mintAddress = new PublicKey(SPL_MINTS[this.asset]);
      const result = await privacyCashWithdrawSPL({
        lightWasm: this.lightWasm,
        connection: this.connection,
        base_units: Number(baseUnits),
        keyBasePath: KEY_BASE_PATH,
        publicKey,
        recipient,
        storage,
        encryptionService: this.encryptionService,
        mintAddress,
      });
      return result.tx;
    }
  }

  /**
   * Withdraw using PrivacyCash client (private key mode)
   */
  private async withdrawWithClient(
    baseUnits: bigint,
    recipientAddress: string
  ): Promise<string> {
    if (!this.client) {
      throw new Error('PrivacyCash client not initialized');
    }

    if (this.asset === 'SOL') {
      const result = await this.client.withdraw({
        lamports: Number(baseUnits),
        recipientAddress,
      });
      return result.tx;
    } else {
      const mintAddress = SPL_MINTS[this.asset];
      const result = await this.client.withdrawSPL({
        base_units: Number(baseUnits),
        mintAddress,
        recipientAddress,
      });
      return result.tx;
    }
  }

  /**
   * Get private balance
   */
  async getPrivateBalance(): Promise<bigint> {
    await this.ensureInitialized();

    if (this.isWalletSignerMode()) {
      return this.getBalanceWithWalletSigner();
    } else {
      return this.getBalanceWithClient();
    }
  }

  /**
   * Get balance using wallet signer mode
   */
  private async getBalanceWithWalletSigner(): Promise<bigint> {
    if (!this.walletSigner || !this.connection || !this.encryptionService) {
      throw new Error('Wallet signer mode not properly initialized');
    }

    const publicKey = new PublicKey(this.walletSigner.publicKey.toBase58());
    const storage = getStorage();

    if (this.asset === 'SOL') {
      const utxos = await getUtxos({
        publicKey,
        connection: this.connection,
        encryptionService: this.encryptionService,
        storage,
      });
      const balance = getBalanceFromUtxos(utxos);
      return BigInt(balance.lamports);
    } else {
      const mintAddress = new PublicKey(SPL_MINTS[this.asset]);
      const utxos = await getUtxosSPL({
        publicKey,
        connection: this.connection,
        encryptionService: this.encryptionService,
        storage,
        mintAddress,
      });
      const balance = getBalanceFromUtxosSPL(utxos);
      return BigInt(balance.base_units);
    }
  }

  /**
   * Get balance using PrivacyCash client (private key mode)
   */
  private async getBalanceWithClient(): Promise<bigint> {
    if (!this.client) {
      throw new Error('PrivacyCash client not initialized');
    }

    if (this.asset === 'SOL') {
      const result = await this.client.getPrivateBalance();
      return BigInt(result.lamports);
    } else {
      const mintAddress = SPL_MINTS[this.asset];
      const result = await this.client.getPrivateBalanceSpl(mintAddress);
      return BigInt(result.base_units);
    }
  }

  // ============================================
  // Legacy methods for backward compatibility
  // ============================================

  /**
   * @deprecated Use getAddress() instead
   * Get the derived address (only relevant for old implementation)
   */
  getDerivedAddress(): string | null {
    return this.getAddress();
  }
}
