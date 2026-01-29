import type { GetExecutionStatusResponse } from '@defuse-protocol/one-click-sdk-typescript';
import {
  OpenAPI,
  OneClickService,
  QuoteRequest,
  ApiError,
} from '@defuse-protocol/one-click-sdk-typescript';

import { sleep } from './utils';
import type {
  CheckStatusParams,
  GetQuoteParams,
  SubmitTxHashParams,
  SwapApi,
} from './types';

export type OneClickApiConfig = {
  jwtToken?: string;
  apiBaseUrl?: string;
};

const DEFAULT_API_URL = 'https://1click.chaindefuser.com';

export const OneClickApi = (config: OneClickApiConfig = {}): SwapApi => {
  const apiBaseUrl =
    config.apiBaseUrl ||
    process.env['NEAR_INTENTS_API_URL'] ||
    DEFAULT_API_URL;

  const jwtToken = config.jwtToken || process.env['NEAR_INTENTS_JWT_TOKEN'];

  if (!jwtToken) {
    throw new Error(
      'JWT token required. Provide via config or NEAR_INTENTS_JWT_TOKEN env var.'
    );
  }

  OpenAPI.BASE = apiBaseUrl;
  OpenAPI.TOKEN = jwtToken;

  return {
    getTokens: async () => {
      return await OneClickService.getTokens();
    },

    getQuote: async (params: GetQuoteParams) => {
      const quoteRequest: QuoteRequest = {
        dry: params.dry,
        swapType: QuoteRequest.swapType.EXACT_INPUT,
        slippageTolerance: params.slippageTolerance,
        originAsset: params.originAsset,
        depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
        destinationAsset: params.destinationAsset,
        amount: params.amount,
        refundTo: params.senderAddress,
        refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
        recipient: params.recipientAddress,
        recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
        deadline:
          params.deadline ?? new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        referral: params.referral,
        quoteWaitingTimeMs: 3000,
      };

      try {
        return await OneClickService.getQuote(quoteRequest);
      } catch (err) {
        if (err instanceof ApiError) {
          // Extract more details from the API error
          const errorBody = err.body as { message?: string; error?: string; details?: unknown } | undefined;
          const errorMessage = errorBody?.message || errorBody?.error || err.message;
          const detailedError = new Error(
            `Quote failed (${err.status}): ${errorMessage}${errorBody?.details ? ` - ${JSON.stringify(errorBody.details)}` : ''}`
          );
          (detailedError as Error & { cause?: unknown }).cause = err;
          throw detailedError;
        }
        throw err;
      }
    },

    submitTxHash: async (params: SubmitTxHashParams) => {
      await OneClickService.submitDepositTx({
        txHash: params.transactionHash,
        depositAddress: params.depositAddress,
      });
    },

    pollStatus: async (
      params: CheckStatusParams
    ): Promise<GetExecutionStatusResponse | null> => {
      await sleep(params.initialDelay);
      let attempts = 0;
      let statusResponse: GetExecutionStatusResponse | null = null;
      while (attempts < params.maxAttempts) {
        try {
          const newStatusResponse = await OneClickService.getExecutionStatus(
            params.depositAddress
          );

          if (
            params.onStatusChange &&
            newStatusResponse.status !== statusResponse?.status
          ) {
            params?.onStatusChange({
              status: newStatusResponse.status,
              statusResponse: newStatusResponse,
            });
          }

          // Stop polling on terminal states
          if (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            newStatusResponse.status === 'SUCCESS' ||
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            newStatusResponse.status === 'FAILED' ||
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            newStatusResponse.status === 'REFUNDED'
          ) {
            return newStatusResponse;
          }

          statusResponse = newStatusResponse;
        } finally {
          attempts++;
          await sleep(params.pollingInterval);
        }
      }
      return statusResponse;
    },
  };
};
