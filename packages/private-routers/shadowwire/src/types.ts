import type { VersionedTransaction } from '@solana/web3.js';

/**
 * Supported tokens on ShadowWire
 */
export const SUPPORTED_TOKENS = [
  'SOL', 'RADR', 'USDC', 'ORE', 'BONK', 'JIM', 'GODL', 'HUSTLE',
  'ZEC', 'CRT', 'BLACKCOIN', 'GIL', 'ANON', 'WLFI', 'USD1', 'AOL',
  'IQLABS', 'SANA', 'POKI', 'RAIN', 'HOSICO', 'SKR'
] as const;

export type ShadowWireToken = typeof SUPPORTED_TOKENS[number];

/**
 * Transfer types supported by ShadowWire
 * - internal: Amount is hidden using ZK proofs
 * - external: Amount is visible but sender remains anonymous
 */
export type TransferType = 'internal' | 'external';

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
   * ShadowWire API base URL (optional, uses default if not provided)
   */
  apiBaseUrl?: string;

  /**
   * API key for authenticated requests (optional)
   */
  apiKey?: string;

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
}

/**
 * Balance response from ShadowWire API
 */
export interface BalanceResponse {
  wallet: string;
  available: number;
  deposited: number;
  withdrawn_to_escrow: number;
  migrated: boolean;
  pool_address: string;
}

/**
 * Deposit request to ShadowWire API
 */
export interface DepositRequest {
  wallet: string;
  amount: number;
  token?: string;
}

/**
 * Deposit response from ShadowWire API
 * Returns an unsigned transaction that must be signed and submitted
 */
export interface DepositResponse {
  success: boolean;
  unsigned_tx_base64?: string;
  pool_address?: string;
  user_balance_pda?: string;
  amount?: number;
  message?: string;
}

/**
 * Submit signed transaction request
 */
export interface SubmitTxRequest {
  signed_tx_base64: string;
}

/**
 * Submit transaction response
 */
export interface SubmitTxResponse {
  success: boolean;
  signature?: string;
  message?: string;
}

/**
 * Withdraw request to ShadowWire API
 */
export interface WithdrawRequest {
  wallet: string;
  amount: number;
  token?: string;
  recipient?: string;
}

/**
 * Withdraw response from ShadowWire API
 */
export interface WithdrawResponse {
  success: boolean;
  txHash?: string;
  message?: string;
}

/**
 * Transfer request to ShadowWire API
 */
export interface TransferRequest {
  sender: string;
  recipient: string;
  amount: number;
  token: string;
  type: TransferType;
  sender_signature?: string;
}

/**
 * Transfer response from ShadowWire API
 */
export interface TransferResponse {
  success: boolean;
  txHash?: string;
  message?: string;
}

/**
 * Fee information for a token
 */
export interface FeeInfo {
  token: string;
  feePercentage: number;
  minimumAmount: number;
}

/**
 * Message to sign for ShadowWire authentication
 */
export const SHADOWWIRE_SIGN_MESSAGE = 'Sign this message to authenticate with ShadowWire.\n\nThis signature will be used to authorize transactions.\n\nThis will NOT trigger any blockchain transaction or cost any gas fees.';

/**
 * Default API base URL
 */
export const DEFAULT_API_BASE_URL = 'https://shadow.radr.fun/shadowpay/api';

/**
 * Token mint addresses on Solana mainnet
 */
export const TOKEN_MINTS: Record<ShadowWireToken, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  RADR: 'DdqTxEHAgFUMFa3SWbHg7EJDi8fFBujmPFxLkQnPpump',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  ORE: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JIM: '3Ysmnbdddpxv9xbY5v7LsKHTqpWuvCMxCLGCfT5Wpump',
  GODL: '9woorpnzYXPBUwvTLSunL4YFbCvwf6tQvhKWskVgpump',
  HUSTLE: 'JASFLs1p2Q23z8hpwADttSvNGwpWScMJnd3PwXpump',
  ZEC: 'B5WTLaRwaUQpKk7ir1wniNB6m5o8GgMrimhKMYan2R6B',
  CRT: 'CRTx1JouZhzSU6XytsE42UQraoGqiHgxabocVfARpump',
  BLACKCOIN: '3S56BDbx2AogHhKLdXasDxuJUCVp6YMdpk12uxupump',
  GIL: 'Bfz8QnpKpMdCPq6Q6pjNFSgU5gFJ4S1kxe3pFpump',
  ANON: '7TTdfHWH7DLSRA6uct2mLByKv1BzcneveJZeBz61pump',
  WLFI: '4kGymJMHBMQKu8Epgb1xaWsKXE8HVMsf7DZL6sNvpump',
  USD1: 'HhXrKdmGqGs9F8dTJxL7rruL7rKLv2tXsHXiTwNpump',
  AOL: '9kNrTXjsLBUq95u4JAq6D1n1u8GS7pP3vKrWxV9fpump',
  IQLABS: '8fq68o3j8pYWNrWzPCCLwpF4HU3NZCkqSPUK1j6pump',
  SANA: '8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump',
  POKI: 'GNfMRsJpKACTXjKWZ1hKKdqYHWE3eE3LipVZKJ1Lpump',
  RAIN: '8p8Zj4f2j5v6Zzb6V5k3QBqKyYLzTPFpqRzfJ7Vpump',
  HOSICO: '2SutkHkCQdLHHyU5wnfv7ghiHG2xP2h3LpwT8Vpump',
  SKR: 'SKRYPTBpLvdMCiuLq7KX3xYqJw7pYdqR2L3vF1pump',
};

/**
 * Token decimals
 */
export const TOKEN_DECIMALS: Record<ShadowWireToken, number> = {
  SOL: 9,
  RADR: 6,
  USDC: 6,
  ORE: 11,
  BONK: 5,
  JIM: 6,
  GODL: 6,
  HUSTLE: 6,
  ZEC: 8,
  CRT: 6,
  BLACKCOIN: 6,
  GIL: 6,
  ANON: 6,
  WLFI: 6,
  USD1: 6,
  AOL: 6,
  IQLABS: 6,
  SANA: 6,
  POKI: 6,
  RAIN: 6,
  HOSICO: 6,
  SKR: 6,
};

/**
 * Token fee percentages (0.003 = 0.3%, 0.01 = 1%)
 */
export const TOKEN_FEES: Record<ShadowWireToken, number> = {
  SOL: 0.005,    // 0.5%
  RADR: 0.003,   // 0.3%
  USDC: 0.005,   // 0.5%
  ORE: 0.01,     // 1%
  BONK: 0.01,    // 1%
  JIM: 0.01,
  GODL: 0.01,
  HUSTLE: 0.01,
  ZEC: 0.01,
  CRT: 0.01,
  BLACKCOIN: 0.01,
  GIL: 0.01,
  ANON: 0.01,
  WLFI: 0.01,
  USD1: 0.01,
  AOL: 0.01,
  IQLABS: 0.01,
  SANA: 0.01,
  POKI: 0.01,
  RAIN: 0.01,
  HOSICO: 0.01,
  SKR: 0.01,
};

/**
 * Default proof bit length for ZK proofs
 */
export const DEFAULT_PROOF_BIT_LENGTH = 64;
