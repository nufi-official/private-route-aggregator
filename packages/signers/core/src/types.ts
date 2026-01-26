/**
 * Function type for sending deposits
 * @param address - Destination address
 * @param amount - Amount in base units as string
 * @returns Transaction hash
 */
export type SendDepositFn = (params: {
  address: string;
  amount: string;
}) => Promise<string>;

/**
 * Account with signing capabilities
 * Supports:
 * - sendDeposit: Send native/token transfers
 * - signTransaction: Sign Solana VersionedTransaction (for Privacy Cash)
 * - signMessage: Sign arbitrary messages (for ShadowWire)
 */
export type Account = {
  getAddress: () => Promise<string>;
  assetToBaseUnits: (amount: string) => bigint;
  getBalance: () => Promise<bigint>;
  sendDeposit: SendDepositFn;
  signTransaction?: <T>(transaction: T) => Promise<T>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};
