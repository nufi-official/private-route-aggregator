import { PublicKey, VersionedTransaction, Connection } from '@solana/web3.js';
import type {
  FundingStatus,
  WithdrawStatus,
  WithdrawDestination,
} from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import type {
  ShadowWireConfig,
  ShadowWireToken,
  BalanceResponse,
  DepositResponse,
  WithdrawResponse,
  TransferResponse,
  TransferType,
} from './types';
import {
  DEFAULT_API_BASE_URL,
  SHADOWWIRE_SIGN_MESSAGE,
  TOKEN_FEES,
  TOKEN_DECIMALS,
  TOKEN_MINTS,
} from './types';

/**
 * ShadowWire Provider
 * Implements privacy transactions using ShadowWire's Bulletproof ZK proofs
 *
 * Features:
 * - Simple API-based deposits and withdrawals
 * - Internal transfers with hidden amounts (ZK proofs)
 * - External transfers with anonymous sender
 * - Multi-token support (22 tokens)
 */
export class ShadowWireProvider {
  readonly name = 'ShadowWire';

  private apiBaseUrl: string;
  private apiKey?: string;
  private walletSigner: ShadowWireConfig['walletSigner'];
  private connection: Connection;
  private token: ShadowWireToken;
  private debug: boolean;
  private cachedSignature?: string;

  constructor(config: ShadowWireConfig) {
    this.apiBaseUrl = config.apiBaseUrl || DEFAULT_API_BASE_URL;
    this.apiKey = config.apiKey;
    this.walletSigner = config.walletSigner;
    this.connection = new Connection(config.rpcUrl || 'https://api.mainnet-beta.solana.com');
    this.token = config.token || 'SOL';
    this.debug = config.enableDebug || false;
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
      console.log('[ShadowWire]', ...args);
    }
  }

  /**
   * Make an API request to ShadowWire
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    this.log(`API ${method} ${endpoint}`, body ? JSON.stringify(body) : '');

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ShadowWire API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as T;
    this.log('API response:', data);
    return data;
  }

  /**
   * Generate a signature for authentication
   */
  private async generateSignature(): Promise<string> {
    if (this.cachedSignature) {
      return this.cachedSignature;
    }

    const message = new TextEncoder().encode(SHADOWWIRE_SIGN_MESSAGE);
    const signatureBytes = await this.walletSigner.signMessage(message);
    this.cachedSignature = Buffer.from(signatureBytes).toString('base64');
    return this.cachedSignature;
  }

  /**
   * Get the current private balance (returns bigint in base units)
   * Matches PrivacyProvider interface
   */
  async getPrivateBalance(): Promise<bigint> {
    const wallet = this.getWalletAddress();

    try {
      // For native SOL, don't pass token_mint parameter
      // For other tokens, pass the token_mint
      const endpoint = this.token === 'SOL'
        ? `/pool/balance/${wallet}`
        : `/pool/balance/${wallet}?token_mint=${TOKEN_MINTS[this.token]}`;

      const response = await this.apiRequest<BalanceResponse>(endpoint);

      // available is in base units (lamports for SOL)
      return BigInt(response.available);
    } catch (error) {
      this.log('Error fetching balance:', error);
      return 0n;
    }
  }

  /**
   * Get detailed balance info for a specific token
   */
  async getPrivateBalanceDetailed(token?: ShadowWireToken): Promise<{
    balance: bigint;
    balanceFormatted: number;
    deposited: number;
    poolAddress: string;
  }> {
    const wallet = this.getWalletAddress();
    const targetToken = token || this.token;

    try {
      // For native SOL, don't pass token_mint parameter
      const endpoint = targetToken === 'SOL'
        ? `/pool/balance/${wallet}`
        : `/pool/balance/${wallet}?token_mint=${TOKEN_MINTS[targetToken]}`;

      const response = await this.apiRequest<BalanceResponse>(endpoint);

      const decimals = TOKEN_DECIMALS[targetToken];

      return {
        balance: BigInt(response.available),
        balanceFormatted: response.available / Math.pow(10, decimals),
        deposited: response.deposited,
        poolAddress: response.pool_address,
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
   * Matches PrivacyProvider interface
   *
   * Flow:
   * 1. Request unsigned transaction from API
   * 2. Sign transaction with wallet
   * 3. Submit signed transaction
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

      // Validate amount
      if (baseUnits <= 0n) {
        throw new Error('Amount must be greater than 0');
      }

      // Validate wallet address
      try {
        new PublicKey(wallet);
      } catch {
        throw new Error('Invalid wallet address');
      }

      // Step 1: Get unsigned transaction from API
      this.log('Requesting deposit transaction...');
      const response = await this.apiRequest<DepositResponse>('/pool/deposit', 'POST', {
        wallet,
        amount: Number(baseUnits),
        token: this.token,
      });

      if (!response.success || !response.unsigned_tx_base64) {
        throw new Error(response.message || 'Failed to get deposit transaction');
      }

      this.log('Got unsigned transaction, signing...');
      onStatusChange?.({ stage: 'depositing' });

      // Step 2: Deserialize and sign the transaction
      const txBuffer = Buffer.from(response.unsigned_tx_base64, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      // Sign with wallet
      if (!this.walletSigner.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      const signedTransaction = await this.walletSigner.signTransaction(transaction);
      this.log('Transaction signed');

      // Step 3: Submit to blockchain
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

      this.log('Transaction confirmed!');
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
   * Matches PrivacyProvider interface
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

      // Validate amount
      if (baseUnits <= 0n) {
        throw new Error('Amount must be greater than 0');
      }

      onStatusChange?.({ stage: 'processing' });

      const response = await this.apiRequest<WithdrawResponse>('/pool/withdraw', 'POST', {
        wallet,
        amount: Number(baseUnits),
        token: this.token,
        recipient,
      });

      if (!response.success) {
        throw new Error(response.message || 'Withdrawal failed');
      }

      const txHash = response.txHash || 'pending';

      onStatusChange?.({ stage: 'confirming', txHash });

      // Wait for confirmation
      await this.waitForConfirmation(txHash);

      onStatusChange?.({ stage: 'completed', txHash });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Transfer funds privately
   * - internal: Amount hidden with ZK proofs
   * - external: Amount visible, sender anonymous
   */
  async transfer(params: {
    recipient: string;
    amount: string;
    type?: TransferType;
    onStatusChange?: (status: WithdrawStatus) => void;
  }): Promise<{ txHash: string }> {
    const { recipient, amount, type = 'internal', onStatusChange } = params;
    const sender = this.getWalletAddress();

    try {
      onStatusChange?.({ stage: 'preparing' });

      const baseUnits = BigInt(amount);

      // Validate
      if (baseUnits <= 0n) {
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

      // Generate signature for authentication
      const signature = await this.generateSignature();

      onStatusChange?.({ stage: 'processing' });

      // Choose endpoint based on transfer type
      const endpoint = type === 'internal' ? '/zk/internal-transfer' : '/zk/external-transfer';

      const response = await this.apiRequest<TransferResponse>(endpoint, 'POST', {
        sender,
        recipient,
        amount: this.fromBaseUnits(Number(baseUnits)),
        token: this.token,
        type,
        sender_signature: signature,
      });

      if (!response.success) {
        throw new Error(response.message || 'Transfer failed');
      }

      const txHash = response.txHash || 'pending';

      onStatusChange?.({ stage: 'confirming', txHash });

      await this.waitForConfirmation(txHash);

      onStatusChange?.({ stage: 'completed', txHash });

      return { txHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onStatusChange?.({ stage: 'failed', error: errorMessage });
      throw error;
    }
  }

  /**
   * Get fee percentage for the current token (as decimal, e.g., 0.005 = 0.5%)
   */
  getFeePercentage(): number {
    return TOKEN_FEES[this.token] || 0.01;
  }

  /**
   * Get decimals for the current token
   */
  getTokenDecimals(): number {
    return TOKEN_DECIMALS[this.token] || 6;
  }

  /**
   * Get mint address for the current token
   */
  getTokenMint(): string {
    return TOKEN_MINTS[this.token];
  }

  /**
   * Get minimum amount for the current token (in base units)
   */
  getMinimumAmount(): number {
    const decimals = this.getTokenDecimals();
    return Math.pow(10, decimals - 3);
  }

  /**
   * Calculate fee for a given amount (in base units)
   */
  calculateFee(amount: number): { fee: number; netAmount: number } {
    const feeRate = this.getFeePercentage();
    const fee = Math.floor(amount * feeRate);
    const netAmount = amount - fee;
    return { fee, netAmount };
  }

  /**
   * Convert token amount to base units
   */
  toBaseUnits(amount: number): number {
    const decimals = this.getTokenDecimals();
    return Math.floor(amount * Math.pow(10, decimals));
  }

  /**
   * Convert base units to token amount
   */
  fromBaseUnits(baseUnits: number): number {
    const decimals = this.getTokenDecimals();
    return baseUnits / Math.pow(10, decimals);
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(txHash: string): Promise<void> {
    if (txHash === 'pending') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return;
    }

    const maxAttempts = 30;
    const delayMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.apiRequest<{ confirmed: boolean }>(
          `/tx/status/${txHash}`
        );
        if (status.confirmed) {
          return;
        }
      } catch {
        // Status endpoint might not exist, that's ok
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    this.log('Max confirmation attempts reached, assuming success');
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
   * Check if a token is supported
   */
  static isTokenSupported(token: string): token is ShadowWireToken {
    const supportedTokens = [
      'SOL', 'RADR', 'USDC', 'ORE', 'BONK', 'JIM', 'GODL', 'HUSTLE',
      'ZEC', 'CRT', 'BLACKCOIN', 'GIL', 'ANON', 'WLFI', 'USD1', 'AOL',
      'IQLABS', 'SANA', 'POKI', 'RAIN', 'HOSICO', 'SKR'
    ];
    return supportedTokens.includes(token);
  }
}
