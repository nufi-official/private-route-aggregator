import type { GetExecutionStatusResponse } from '@defuse-protocol/one-click-sdk-typescript';

export type TokensResponse = Record<string, string>;

export type SwapQuote = {
  amountInFormatted: string;
  amountOutFormatted: string;
  depositAddress: string;
  estimatedFees?: {
    network?: string;
    protocol?: string;
  };
};

export type SwapQuoteResponse = {
  timestamp: string;
  signature: string;
  quote: { depositAddress?: string };
};

export type SubmitTxHashParams = {
  transactionHash: string;
  depositAddress: string;
};

export type GetQuoteParams = {
  dry: boolean;
  senderAddress: string;
  recipientAddress: string;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  slippageTolerance: number;
  deadline?: string;
  referral?: string;
};

export type CheckStatusParams = {
  depositAddress: string;
  maxAttempts: number;
  pollingInterval: number;
  initialDelay: number;
  onStatusChange?: (event: SwapStateChangeEvent) => void;
};

export const checkStatusResponse = [
  'KNOWN_DEPOSIT_TX',
  'PENDING_DEPOSIT',
  'INCOMPLETE_DEPOSIT',
  'PROCESSING',
  'SUCCESS',
  'REFUNDED',
  'FAILED',
] as const;

export type CheckStatusResponse = (typeof checkStatusResponse)[number];

export const SWAP_HAPPY_PATH_TIMELINE: readonly CheckStatusResponse[] = [
  'PENDING_DEPOSIT',
  'KNOWN_DEPOSIT_TX',
  'PROCESSING',
  'SUCCESS',
] as const;

export const SWAP_END_STATES = new Set<CheckStatusResponse>([
  'SUCCESS',
  'FAILED',
  'REFUNDED',
]);

export type SwapApiAsset = {
  assetId: string;
  priceUpdatedAt: string;
  price: number;
  decimals: number;
  symbol: string;
  blockchain: string;
  contractAddress?: string | undefined;
};

export type SendDepositFn = (params: {
  address: string;
  amount: string;
}) => Promise<string>;

export type SwapStateChangeEvent =
  | {
      status: 'QUOTE_RECEIVED';
      depositAddress: string;
    }
  | {
      status: 'DEPOSIT_SENT';
      txHash: string;
    }
  | {
      status: CheckStatusResponse;
      statusResponse: GetExecutionStatusResponse;
    };

export type SwapApi = {
  getTokens: () => Promise<SwapApiAsset[]>;
  getQuote: (params: GetQuoteParams) => Promise<SwapQuoteResponse>;
  submitTxHash: (params: SubmitTxHashParams) => Promise<void>;
  pollStatus: (
    params: CheckStatusParams
  ) => Promise<GetExecutionStatusResponse | null>;
};

export type SwapParams = {
  swapApi: SwapApi;
  quote: GetQuoteParams;
  sendDeposit?: SendDepositFn;
  onStatusChange?: (event: SwapStateChangeEvent) => void;
};
