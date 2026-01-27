import type { Account } from '@privacy-router-sdk/signers-core';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { SolanaAddress, SolanaNetwork } from './types';

/**
 * Solana Account using Wallet Adapter (browser extension wallets)
 * Implements the Account interface with signing via connected wallet
 */
export class WalletAdapterAccount implements Account {
  private readonly wallet: WalletContextState;
  private readonly network: SolanaNetwork;
  private readonly connection: Connection;

  constructor(params: {
    wallet: WalletContextState;
    network: SolanaNetwork;
    rpcUrl?: string;
  }) {
    this.wallet = params.wallet;
    this.network = params.network;

    const rpcUrl = params.rpcUrl || this.getDefaultRpcUrl();
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Get default RPC URL based on network
   */
  private getDefaultRpcUrl(): string {
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
   * Get the Solana address for this account
   */
  getAddress = async (): Promise<SolanaAddress> => {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    return this.wallet.publicKey.toBase58();
  };

  /**
   * Get the balance of this account in lamports, minus fee reserve
   */
  getBalance = async (): Promise<bigint> => {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);

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
    if (!this.wallet.publicKey || !this.wallet.sendTransaction) {
      throw new Error('Wallet not connected or does not support sending transactions');
    }

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

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: new PublicKey(address),
        lamports: Number(amountLamports),
      })
    );

    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signature = await this.wallet.sendTransaction(transaction, this.connection);

    // Wait for confirmation
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  };

  /**
   * Sign a Solana transaction
   */
  signTransaction = async <T>(transaction: T): Promise<T> => {
    if (!this.wallet.signTransaction) {
      throw new Error('Wallet does not support signing transactions');
    }

    if (transaction instanceof VersionedTransaction || transaction instanceof Transaction) {
      return (await this.wallet.signTransaction(transaction)) as T;
    }

    throw new Error('Unsupported transaction type');
  };

  /**
   * Sign an arbitrary message
   */
  signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    if (!this.wallet.signMessage) {
      throw new Error('Wallet does not support signing messages');
    }

    return await this.wallet.signMessage(message);
  };

  /**
   * Get the RPC URL used by this account
   */
  getRpcUrl = (): string => {
    return this.connection.rpcEndpoint;
  };

  /**
   * Check if wallet is connected
   */
  isConnected = (): boolean => {
    return this.wallet.connected && this.wallet.publicKey !== null;
  };

  /**
   * Get the underlying wallet context
   */
  getWallet = (): WalletContextState => {
    return this.wallet;
  };

  /**
   * Get a WalletSigner-compatible object for use with PrivacyCashProvider
   * This allows browser wallet users to use privacy features via signature-based key derivation
   */
  getWalletSigner = (): { publicKey: { toBase58(): string }; signMessage(message: Uint8Array): Promise<Uint8Array> } => {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    if (!this.wallet.signMessage) {
      throw new Error('Wallet does not support signing messages');
    }

    return {
      publicKey: this.wallet.publicKey,
      signMessage: this.wallet.signMessage,
    };
  };
}
