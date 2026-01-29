export { ShadowWireProvider } from './shadowWireProvider';
export type {
  ShadowWireConfig,
  WalletSigner,
  ShadowWireToken,
  TransferType,
  WalletAdapter,
  PoolBalance,
  DepositRequest,
  DepositResponse,
  WithdrawRequest,
  WithdrawResponse,
  TransferRequest,
  TransferResponse,
  ZKTransferResponse,
} from './types';
export {
  SUPPORTED_TOKENS,
  TOKEN_MINTS,
  TOKEN_DECIMALS,
  TOKEN_FEES,
  TOKEN_MINIMUMS,
} from './types';

// Re-export WASM utilities from official SDK
export {
  initWASM,
  isWASMSupported,
  generateRangeProof,
  verifyRangeProof,
} from '@radr/shadowwire';
