import type { Account } from '@privacy-router-sdk/signers-core';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import type { SolanaAddress, SolanaNetwork } from './types';
import { deriveKeypairFromMnemonic } from './utils/keyDerivation';

/**
 * Solana Account with mnemonic-based signing
 * Implements the Account interface with full signing capabilities
 */
export class SolanaAccount implements Account {
  private readonly mnemonic: string;
  private readonly accountIndex: number;
  private readonly network: SolanaNetwork;
  private readonly connection: Connection;
  private cachedKeypair?: Keypair;
  private cachedAddress?: SolanaAddress;

  constructor(params: {
    mnemonic: string;
    accountIndex: number;
    network: SolanaNetwork;
    rpcUrl?: string;
  }) {
    this.mnemonic = params.mnemonic;
    this.accountIndex = params.accountIndex;
    this.network = params.network;

    const rpcUrl = params.rpcUrl || this.getDefaultRpcUrl();
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Get default RPC URL based on network
   */
  private getDefaultRpcUrl(): string {
    // Check env first
    if (process.env['SOLANA_RPC_URL']) {
      return process.env['SOLANA_RPC_URL'];
    }

    switch (this.network) {
      case 'mainnet':
        return 'https://solana-mainnet.nu.fi';
      default:
        throw new Error(`Unsupported network: ${this.network}`);
    }
  }

  /**
   * Derive Keypair from mnemonic using BIP44 derivation path
   */
  private getKeypair(): Keypair {
    if (this.cachedKeypair) {
      return this.cachedKeypair;
    }

    const keypair = deriveKeypairFromMnemonic(this.mnemonic, this.accountIndex);
    this.cachedKeypair = keypair;
    return keypair;
  }

  /**
   * Get the Solana address for this account
   */
  getAddress = async (): Promise<string> => {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const keypair = this.getKeypair();
    this.cachedAddress = keypair.publicKey.toBase58();

    return this.cachedAddress;
  };

  /**
   * Get the balance of this account in lamports, minus fee reserve
   */
  getBalance = async (): Promise<bigint> => {
    try {
      const keypair = this.getKeypair();
      const publicKey = keypair.publicKey;

      const balance = await this.connection.getBalance(publicKey);

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
    const amountLamports = BigInt(amount);

    if (amountLamports <= 0n) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const keypair = this.getKeypair();
    const fromPubkey = keypair.publicKey;
    const toPubkey = new PublicKey(address);

    const balance = await this.getBalance();
    if (balance < amountLamports) {
      throw new Error(
        `Insufficient balance. Required: ${amountLamports}, Available: ${balance}`
      );
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: Number(amountLamports),
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [keypair],
      {
        commitment: 'confirmed',
      }
    );

    return signature;
  };

  /**
   * Sign a Solana VersionedTransaction
   * Used by Privacy Cash SDK
   */
  signTransaction = async <T>(transaction: T): Promise<T> => {
    const keypair = this.getKeypair();

    if (transaction instanceof VersionedTransaction) {
      transaction.sign([keypair]);
      return transaction;
    }

    if (transaction instanceof Transaction) {
      transaction.partialSign(keypair);
      return transaction;
    }

    throw new Error('Unsupported transaction type');
  };

  /**
   * Sign an arbitrary message
   * Used by ShadowWire SDK
   */
  signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    const keypair = this.getKeypair();
    return nacl.sign.detached(message, keypair.secretKey);
  };

  /**
   * Get the secret key as base58 string
   * Used by PrivacyCash SDK
   */
  getSecretKey = (): Uint8Array => {
    const keypair = this.getKeypair();
    return keypair.secretKey;
  };

  /**
   * Get the RPC URL used by this account
   */
  getRpcUrl = (): string => {
    return this.connection.rpcEndpoint;
  };
}
