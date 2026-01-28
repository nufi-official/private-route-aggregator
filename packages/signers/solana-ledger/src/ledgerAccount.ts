import type { Account } from '@privacy-router-sdk/signers-core';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import Solana from '@ledgerhq/hw-app-solana';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import type {
  SolanaAddress,
  SolanaNetwork,
  LedgerConfig,
  LedgerAccountInfo,
  WalletSigner,
  LedgerConnectionStatus,
} from './types';
import { getDerivationPath } from './types';

// Type for the transport instance
type TransportInstance = Awaited<ReturnType<typeof TransportWebHID.create>>;

/**
 * Solana Account using Ledger hardware wallet
 * Implements the Account interface with signing via Ledger device
 */
export class LedgerAccount implements Account {
  private transport: TransportInstance | null = null;
  private solanaApp: Solana | null = null;
  private readonly network: SolanaNetwork;
  private readonly connection: Connection;
  private readonly accountIndex: number;
  private publicKey: PublicKey | null = null;
  private connectionStatus: LedgerConnectionStatus = 'disconnected';

  constructor(config: LedgerConfig) {
    this.network = config.network;
    this.accountIndex = config.accountIndex ?? 0;

    const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl();
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Get default RPC URL based on network
   */
  private getDefaultRpcUrl(): string {
    // Check env first (works in Node.js context)
    if (typeof process !== 'undefined' && process.env?.['SOLANA_RPC_URL']) {
      return process.env['SOLANA_RPC_URL'];
    }

    switch (this.network) {
      case 'mainnet':
        return 'https://solana-mainnet.nu.fi';
      case 'devnet':
        return 'https://api.devnet.solana.com';
      case 'testnet':
        return 'https://api.testnet.solana.com';
      default:
        throw new Error(`Unsupported network: ${this.network}`);
    }
  }

  /**
   * Get the derivation path for the current account
   */
  getDerivationPath(): string {
    return getDerivationPath(this.accountIndex);
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): LedgerConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Connect to Ledger device
   * Must be called before any signing operations
   */
  async connect(): Promise<void> {
    if (this.transport && this.solanaApp) {
      return; // Already connected
    }

    this.connectionStatus = 'connecting';

    try {
      // Request WebHID connection to Ledger
      this.transport = await TransportWebHID.create();
      this.solanaApp = new Solana(this.transport);

      // Get the public key for the account
      const path = this.getDerivationPath();
      const result = await this.solanaApp.getAddress(path);
      this.publicKey = new PublicKey(result.address);

      this.connectionStatus = 'connected';
    } catch (error) {
      this.connectionStatus = 'error';
      this.transport = null;
      this.solanaApp = null;
      throw new Error(
        `Failed to connect to Ledger: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from Ledger device
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.solanaApp = null;
      this.publicKey = null;
      this.connectionStatus = 'disconnected';
    }
  }

  /**
   * Check if connected to Ledger
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected' && this.solanaApp !== null;
  }

  /**
   * Ensure Ledger is connected before operations
   */
  private ensureConnected(): void {
    if (!this.isConnected() || !this.solanaApp || !this.publicKey) {
      throw new Error('Ledger not connected. Call connect() first.');
    }
  }

  /**
   * Get the Solana address for this account
   */
  getAddress = async (): Promise<SolanaAddress> => {
    this.ensureConnected();
    return this.publicKey!.toBase58();
  };

  /**
   * Get the balance of this account in lamports, minus fee reserve
   */
  getBalance = async (): Promise<bigint> => {
    this.ensureConnected();

    try {
      const balance = await this.connection.getBalance(this.publicKey!);

      // Reserve lamports for transaction fees
      const FEE_RESERVE = 3_000_000n;
      const balanceBigInt = BigInt(balance);

      return balanceBigInt > FEE_RESERVE ? balanceBigInt - FEE_RESERVE : 0n;
    } catch (error) {
      throw new Error(
        `Failed to fetch Solana balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  /**
   * Convert SOL amount to lamports (base units)
   */
  assetToBaseUnits = (amount: string): bigint => {
    const amountFloat = parseFloat(amount);

    if (isNaN(amountFloat) || amountFloat < 0) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const [whole = '0', decimal = ''] = amount.split('.');
    const paddedDecimal = decimal.padEnd(9, '0').slice(0, 9);
    const lamportsStr = whole + paddedDecimal;

    return BigInt(lamportsStr);
  };

  /**
   * Send SOL to a destination address
   */
  sendDeposit = async ({
    address,
    amount,
  }: {
    address: string;
    amount: string;
  }): Promise<string> => {
    this.ensureConnected();

    const amountLamports = BigInt(amount);

    if (amountLamports <= 0n) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const balance = await this.getBalance();
    if (balance < amountLamports) {
      throw new Error(
        `Insufficient balance. Required: ${amountLamports}, Available: ${balance}`
      );
    }

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.publicKey!,
        toPubkey: new PublicKey(address),
        lamports: Number(amountLamports),
      })
    );

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.publicKey!;

    // Serialize and sign with Ledger
    const serializedTx = transaction.serializeMessage();
    const path = this.getDerivationPath();
    const signature = await this.solanaApp!.signTransaction(path, serializedTx);

    // Add signature to transaction
    transaction.addSignature(this.publicKey!, Buffer.from(signature.signature));

    // Send transaction
    const txSignature = await this.connection.sendRawTransaction(
      transaction.serialize()
    );

    // Wait for confirmation
    await this.connection.confirmTransaction(txSignature, 'confirmed');

    return txSignature;
  };

  /**
   * Sign a Solana transaction with Ledger
   */
  signTransaction = async <T>(transaction: T): Promise<T> => {
    this.ensureConnected();

    const path = this.getDerivationPath();

    if (transaction instanceof VersionedTransaction) {
      // Serialize the message for signing
      const messageBytes = Buffer.from(transaction.message.serialize());
      const result = await this.solanaApp!.signTransaction(path, messageBytes);

      // Find our signer index and add signature
      const signerIndex = transaction.message.staticAccountKeys.findIndex(
        (key) => key.equals(this.publicKey!)
      );

      if (signerIndex === -1) {
        throw new Error('Public key not found in transaction signers');
      }

      // Add our signature at the correct index
      transaction.signatures[signerIndex] = result.signature;

      return transaction;
    }

    if (transaction instanceof Transaction) {
      const messageBytes = Buffer.from(transaction.serializeMessage());
      const result = await this.solanaApp!.signTransaction(path, messageBytes);

      transaction.addSignature(this.publicKey!, Buffer.from(result.signature));

      return transaction;
    }

    throw new Error('Unsupported transaction type');
  };

  /**
   * Sign an arbitrary message with Ledger
   * Note: Requires Ledger Solana app v1.3.0+ for off-chain message signing
   *
   * IMPORTANT: Ledger's off-chain message signing has strict format requirements.
   * Some privacy providers may not work with Ledger due to these limitations.
   */
  signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    this.ensureConnected();

    const path = this.getDerivationPath();

    try {
      // Use signOffchainMessage for arbitrary messages
      // This requires Ledger Solana app v1.3.0+
      const messageBuffer = Buffer.from(message);
      const result = await this.solanaApp!.signOffchainMessage(path, messageBuffer);
      return new Uint8Array(result.signature);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific Ledger error codes
      if (errorMessage.includes('0x6d00') || errorMessage.includes('INS_NOT_SUPPORTED')) {
        throw new Error(
          'Off-chain message signing requires Ledger Solana app v1.3.0 or higher. Please update your Ledger app.'
        );
      }

      if (errorMessage.includes('0x6a81')) {
        throw new Error(
          'Ledger rejected the message signing request. This may be because:\n' +
          '1. "Blind signing" is not enabled in Ledger Solana app settings\n' +
          '2. The message format is not supported by Ledger\n\n' +
          'Try enabling "Blind signing" in the Solana app settings on your Ledger device, ' +
          'or use ShadowWire instead which has better Ledger support.'
        );
      }

      throw error;
    }
  };

  /**
   * Get the RPC URL used by this account
   */
  getRpcUrl = (): string => {
    return this.connection.rpcEndpoint;
  };

  /**
   * Get the public key (if connected)
   */
  getPublicKey(): PublicKey | null {
    return this.publicKey;
  }

  /**
   * Get a WalletSigner-compatible object for use with privacy providers
   */
  getWalletSigner(): WalletSigner {
    this.ensureConnected();

    return {
      publicKey: this.publicKey!,
      signMessage: this.signMessage,
      signTransaction: async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
        return this.signTransaction(tx);
      },
    };
  }

  /**
   * Scan multiple accounts for balances
   * Useful for finding accounts with funds
   */
  static async scanAccounts(
    config: Omit<LedgerConfig, 'accountIndex'>,
    maxAccounts: number = 5
  ): Promise<LedgerAccountInfo[]> {
    const accounts: LedgerAccountInfo[] = [];
    let transport: TransportInstance | null = null;

    try {
      transport = await TransportWebHID.create();
      const solanaApp = new Solana(transport);

      const rpcUrl = config.rpcUrl || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');

      for (let i = 0; i < maxAccounts; i++) {
        const path = getDerivationPath(i);
        const result = await solanaApp.getAddress(path);
        const address = result.address.toString();

        // Fetch balance
        const publicKey = new PublicKey(address);
        const balance = await connection.getBalance(publicKey);

        accounts.push({
          path,
          accountIndex: i,
          address,
          balance: BigInt(balance),
        });
      }

      return accounts;
    } finally {
      if (transport) {
        await transport.close();
      }
    }
  }
}
