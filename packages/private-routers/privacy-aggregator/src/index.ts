export { PrivacyAggregatorProvider } from './privacyAggregatorProvider';
export type {
  PrivacyAggregatorConfig,
  PrivacyAggregatorConfigPrivateKey,
  PrivacyAggregatorConfigWalletSigner,
  SourceAsset,
  CrossChainFundingStatus,
  CrossChainFundParams,
} from './types';
export {
  isPrivateKeyConfig,
  isWalletSignerConfig,
  SOLANA_SOL_ASSET,
  SOLANA_USDC_ASSET,
  SOLANA_USDT_ASSET,
  PRIVACY_CASH_TO_NEAR_INTENTS_ASSET,
} from './types';

// Re-export useful types from dependencies
export type { PrivacyCashAsset, WalletSigner } from '@privacy-router-sdk/privacy-cash';
export type { SwapApiAsset, SwapStateChangeEvent } from '@privacy-router-sdk/near-intents';
