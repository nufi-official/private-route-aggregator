import { PublicKey, VersionedTransaction, Connection } from '@solana/web3.js';
import {
  ShadowWireClient,
  initWASM,
  isWASMSupported,
  type TokenSymbol,
  type TransferType,
  type WalletAdapter as ShadowWireWalletAdapter,
  SUPPORTED_TOKENS,
  TOKEN_FEES,
  TOKEN_DECIMALS,
  TOKEN_MINTS,
  TOKEN_MINIMUMS,
} from '@radr/shadowwire';
import type {
  FundingStatus,
  WithdrawStatus,
  WithdrawDestination,
} from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';

// Re-export types from official SDK
export type ShadowWireToken = TokenSymbol;
export { SUPPORTED_TOKENS, TOKEN_FEES, TOKEN_DECIMALS, TOKEN_MINTS, TOKEN_MINIMUMS };

/**
 * Wallet signer interface for wallet adapter support
 */
export interface WalletSigner {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

/**
 * Configuration for ShadowWire provider
 */
export interface ShadowWireConfig {
  /**
   * Wallet signer with signMessage and signTransaction capability
   */
  walletSigner: WalletSigner;

  /**
   * Solana RPC URL for submitting transactions
   */
  rpcUrl?: string;

  /**
   * Token to use for transactions (default: 'SOL')
   */
  token?: ShadowWireToken;

  /**
   * Enable debug logging
   */
  enableDebug?: boolean;

  /**
   * Path to WASM file for client-side proof generation (optional)
   */
  wasmPath?: string;

  /**
   * Enable client-side proof generation (requires WASM)
   */
  useClientProofs?: boolean;
}

/**
 * ShadowWire Provider
 * Wraps the official @radr/shadowwire SDK for privacy transactions
 *
 * Features:
 * - Bulletproof ZK proofs for hidden amounts
 * - Internal transfers (amount hidden)
 * - External transfers (sender anonymous, amount visible)
 * - Client-side proof generation via WASM (optional)
 * - Multi-token support (22 tokens)
 */
export class ShadowWireProvider {
  readonly name = 'ShadowWire';

  private client: ShadowWireClient;
  private walletSigner: WalletSigner;
  private connection: Connection;
  private token: ShadowWireToken;
  private debug: boolean;
  private wasmInitialized: boolean = false;
  private wasmPath?: string;

  constructor(config: ShadowWireConfig) {
    this.client = new ShadowWireClient();
    this.walletSigner = config.walletSigner;
    this.connection = new Connection(config.rpcUrl || 'https://api.mainnet-beta.solana.com');
    this.token = config.token || 'SOL';
    this.debug = config.enableDebug || false;
    this.wasmPath = config.wasmPath;

    // Initialize WASM if requested and path provided
    if (config.wasmPath && config.useClientProofs) {
      void this.initializeWASM(config.wasmPath);
    }
  }

  /**
   * Initialize WASM for client-side proof generation
   */
  async initializeWASM(wasmPath?: string): Promise<boolean> {
    if (this.wasmInitialized) return true;

    const path = wasmPath || this.wasmPath;
    if (!path) {
      this.log('No WASM path provided');
      return false;
    }

    if (!isWASMSupported()) {
      this.log('WASM not supported in this environment');
      return false;
    }

    try {
      await initWASM(path);
      this.wasmInitialized = true;
      this.log('WASM initialized for client-side proofs');
      return true;
    } catch (error) {
      this.log('Failed to initialize WASM:', error);
      return false;
    }
  }

  /**
   * Get the wallet public key as string
   */
  private getWalletAddress(): string {
    return this.walletSigner.publicKey.toBase58();
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log('[ShadowWire]', ...args);
    }
  }

  /**
   * Create a wallet adapter compatible with the SDK
   */
  private createWalletAdapter(): ShadowWireWalletAdapter {
    return {
      signMessage: (message: Uint8Array) => this.walletSigner.signMessage(message),
    };
  }

  /**
   * Get decimals for a token (with fallback)
   */
  private getTokenDecimalsValue(token: ShadowWireToken): number {
    return TOKEN_DECIMALS[token] ?? 6;
  }

  /**
   * Get the current private balance (returns bigint in base units)
   */
  async getPrivateBalance(): Promise<bigint> {
    const wallet = this.getWalletAddress();

    try {
      const balance = await this.client.getBalance(wallet, this.token);
      // SDK returns available in base units (lamports for SOL)
      return BigInt(Math.floor(balance.available));
    } catch (error) {
      this.log('Error fetching balance:', error);
      return 0n;
    }
  }

  /**
   * Get detailed balance info
   */
  async getPrivateBalanceDetailed(): Promise<{
    balance: bigint;
    balanceFormatted: number;
    deposited: number;
    poolAddress: string;
  }> {
    const wallet = this.getWalletAddress();

    try {
      const balance = await this.client.getBalance(wallet, this.token);
      const decimals = this.getTokenDecimalsValue(this.token);

      return {
        // SDK returns available in base units
        balance: BigInt(Math.floor(balance.available)),
        balanceFormatted: balance.available / Math.pow(10, decimals),
        deposited: balance.deposited,
        poolAddress: balance.pool_address,
      };
    } catch (error) {
      this.log('Error fetching balance:', error);
      return {
        balance: 0n,
        balanceFormatted: 0,
        deposited: 0,
        poolAddress: '',
      };
    }
  }

  /**
   * Fund the privacy pool (deposit)
   */
  async fund(params: {
    sourceAccount: Account;
    amount: string;
    onStatusChange?: (status: FundingStatus) => void;
  }): Promise<void> {
    const { amount, onStatusChange } = params;
    const wallet = this.getWalletAddress();

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);
      const decimals = this.getTokenDecimalsValue(this.token);
      const decimalAmount = Number(baseUnits) / Math.pow(10, decimals);

      if (decimalAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Validate wallet address
      try {
        new PublicKey(wallet);
      } catch {
        throw new Error('Invalid wallet address');
      }

      this.log('Requesting deposit...', { wallet, amount: Number(baseUnits), token: this.token });

      // Get unsigned transaction from SDK - amount must be in base units (integer)
      const response = await this.client.deposit({
        wallet,
        amount: Number(baseUnits),
        token_mint: this.token === 'SOL' ? undefined : TOKEN_MINTS[this.token],
      });

      if (!response.success || !response.unsigned_tx_base64) {
        throw new Error('Failed to get deposit transaction');
      }

      this.log('Got unsigned transaction, signing...');
      onStatusChange?.({ stage: 'depositing' });

      // Deserialize and sign the transaction
      const txBuffer = Buffer.from(response.unsigned_tx_base64, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      if (!this.walletSigner.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      const signedTransaction = await this.walletSigner.signTransaction(transaction);
      this.log('Transaction signed');

      // Submit to blockchain
      this.log('Submitting transaction to blockchain...');
      const signature = await this.connection.sendTransaction(signedTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      this.log('Transaction submitted:', signature);

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      this.log('Deposit confirmed!');
      onStatusChange?.({ stage: 'completed', txHash: signature });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('Deposit failed:', errorMessage);
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
    const wallet = this.getWalletAddress();
    const recipient = destination.address || wallet;

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);
      const decimals = this.getTokenDecimalsValue(this.token);
      const decimalAmount = Number(baseUnits) / Math.pow(10, decimals);

      if (decimalAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      this.log('Requesting withdraw...', { wallet, recipient, amount: Number(baseUnits), token: this.token });
      onStatusChange?.({ stage: 'processing' });

      // Get unsigned transaction from SDK - amount must be in base units (integer)
      const response = await this.client.withdraw({
        wallet,
        amount: Number(baseUnits),
        token_mint: this.token === 'SOL' ? undefined : TOKEN_MINTS[this.token],
      });

      if (!response.success || !response.unsigned_tx_base64) {
        throw new Error(response.error || 'Failed to get withdraw transaction');
      }

      this.log('Got unsigned transaction, signing...');

      // Deserialize and sign the transaction
      const txBuffer = Buffer.from(response.unsigned_tx_base64, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      if (!this.walletSigner.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      const signedTransaction = await this.walletSigner.signTransaction(transaction);
      this.log('Transaction signed');

      // Submit to blockchain
      this.log('Submitting transaction to blockchain...');
      const serialized = signedTransaction.serialize();
      const signature = await this.connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      this.log('Transaction submitted:', signature);
      onStatusChange?.({ stage: 'confirming', txHash: signature });

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      this.log('Withdraw confirmed!');
      onStatusChange?.({ stage: 'completed', txHash: signature });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('Withdraw failed:', errorMessage);
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Transfer funds privately using the official SDK
   *
   * @param type - 'internal' = amount hidden with ZK proofs, 'external' = sender anonymous but amount visible
   */
  async transfer(params: {
    recipient: string;
    amount: string;
    type?: TransferType;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<{ txHash: string; amountHidden: boolean }> {
    const { recipient, amount, type = 'internal', onStatusChange } = params;
    const sender = this.getWalletAddress();

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);
      const decimals = this.getTokenDecimalsValue(this.token);
      const decimalAmount = Number(baseUnits) / Math.pow(10, decimals);

      if (decimalAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (sender === recipient) {
        throw new Error('Cannot transfer to yourself');
      }

      // Validate recipient address
      try {
        new PublicKey(recipient);
      } catch {
        throw new Error('Invalid recipient address');
      }

      this.log('Initiating transfer...', { sender, recipient, amount: decimalAmount, type, token: this.token });
      onStatusChange?.({ stage: 'processing' });

      const walletAdapter = this.createWalletAdapter();

      // Use the high-level transfer method which handles everything
      const response = await this.client.transfer({
        sender,
        recipient,
        amount: decimalAmount,
        token: this.token,
        type,
        wallet: walletAdapter,
      });

      if (!response.success) {
        throw new Error('Transfer failed');
      }

      const txHash = response.tx_signature;

      this.log('Transfer completed:', { txHash, amountHidden: response.amount_hidden });
      onStatusChange?.({ stage: 'completed', txHash });

      return {
        txHash,
        amountHidden: response.amount_hidden,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('Transfer failed:', errorMessage);
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Transfer with client-side proof generation (requires WASM)
   */
  async transferWithClientProofs(params: {
    recipient: string;
    amount: string;
    type?: TransferType;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<{ txHash: string; amountHidden: boolean }> {
    if (!this.wasmInitialized) {
      const initialized = await this.initializeWASM();
      if (!initialized) {
        throw new Error('WASM not available. Cannot generate client-side proofs.');
      }
    }

    const { recipient, amount, type = 'internal', onStatusChange } = params;
    const sender = this.getWalletAddress();

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);
      const decimals = this.getTokenDecimalsValue(this.token);
      const decimalAmount = Number(baseUnits) / Math.pow(10, decimals);

      if (decimalAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      this.log('Generating client-side proofs...', { amount: decimalAmount });

      // Generate proof locally using the SDK
      const proofData = await this.client.generateProofLocally(decimalAmount, this.token);

      this.log('Proof generated, initiating transfer...');
      onStatusChange?.({ stage: 'processing' });

      const walletAdapter = this.createWalletAdapter();

      const response = await this.client.transferWithClientProofs({
        sender,
        recipient,
        amount: decimalAmount,
        token: this.token,
        type,
        wallet: walletAdapter,
        customProof: proofData,
      });

      if (!response.success) {
        throw new Error('Transfer with client proofs failed');
      }

      const txHash = response.tx_signature;

      this.log('Transfer with client proofs completed:', txHash);
      onStatusChange?.({ stage: 'completed', txHash });

      return {
        txHash,
        amountHidden: response.amount_hidden,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('Transfer with client proofs failed:', errorMessage);
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Get fee percentage for the current token
   */
  getFeePercentage(): number {
    return this.client.getFeePercentage(this.token);
  }

  /**
   * Get minimum amount for the current token (in decimal format)
   */
  getMinimumAmount(): number {
    return this.client.getMinimumAmount(this.token);
  }

  /**
   * Calculate fee for a given amount (in decimal format)
   */
  calculateFee(amount: number): { fee: number; netAmount: number } {
    return this.client.calculateFee(amount, this.token);
  }

  /**
   * Get decimals for the current token
   */
  getTokenDecimals(): number {
    return this.getTokenDecimalsValue(this.token);
  }

  /**
   * Get mint address for the current token
   */
  getTokenMint(): string {
    return TOKEN_MINTS[this.token] ?? '';
  }

  /**
   * Convert token amount to base units
   */
  toBaseUnits(amount: number): bigint {
    const decimals = this.getTokenDecimals();
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }

  /**
   * Convert base units to token amount
   */
  fromBaseUnits(baseUnits: bigint): number {
    const decimals = this.getTokenDecimals();
    return Number(baseUnits) / Math.pow(10, decimals);
  }

  /**
   * Set the token for transactions
   */
  setToken(token: ShadowWireToken): void {
    this.token = token;
  }

  /**
   * Get current token
   */
  getToken(): ShadowWireToken {
    return this.token;
  }

  /**
   * Check if WASM is initialized
   */
  isWASMInitialized(): boolean {
    return this.wasmInitialized;
  }

  /**
   * Check if WASM is supported for client-side proofs
   */
  static isWASMSupported(): boolean {
    return isWASMSupported();
  }

  /**
   * Check if a token is supported
   */
  static isTokenSupported(token: string): token is ShadowWireToken {
    return SUPPORTED_TOKENS.includes(token as ShadowWireToken);
  }
}
