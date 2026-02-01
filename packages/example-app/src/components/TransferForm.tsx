import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { TokenSelector } from './TokenSelector';
import { getAssetIcon } from '../utils/tokenIcons';
import type { WithdrawStatus } from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import type { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import type { ShadowWireProvider } from '@privacy-router-sdk/shadowwire';
import {
  OneClickApi,
  type SwapApiAsset,
  type SwapStateChangeEvent,
} from '@privacy-router-sdk/near-intents';

type ProviderType = PrivacyCashProvider | ShadowWireProvider;

// Chain display names
const CHAIN_NAMES: Record<string, string> = {
  sol: 'Solana',
  eth: 'Ethereum',
  base: 'Base',
  arb: 'Arbitrum',
  btc: 'Bitcoin',
  near: 'NEAR',
  ton: 'TON',
  doge: 'Dogecoin',
  xrp: 'XRP',
  bsc: 'BNB Chain',
  pol: 'Polygon',
  op: 'Optimism',
  avax: 'Avalanche',
};

// Get display name for an asset
function getAssetDisplayName(asset: string): string {
  if (asset.includes(':')) {
    return asset.split(':')[0] ?? asset;
  }
  return asset;
}

// Swap transfer status
type SwapTransferStatus =
  | { stage: 'idle' }
  | { stage: 'getting_quote' }
  | { stage: 'transferring'; depositAddress: string }
  | { stage: 'swapping'; status: string }
  | { stage: 'completed'; txHash?: string }
  | { stage: 'failed'; error: string };

interface TransferFormProps {
  account: Account | null;
  provider: ProviderType | null;
  privateBalance: bigint;
  privateBalanceLoading?: boolean;
  onSuccess: () => void;
  asset: string;
  decimals: number;
  availableAssets: string[];
  onAssetChange: (asset: string) => void;
  formatUsdValue?: (symbol: string, amount: string) => string | null;
  convertAmount?: (fromSymbol: string, toSymbol: string, amount: string) => string | null;
  nearIntentsTokens?: SwapApiAsset[];
  pricesLoading?: boolean;
  onConnectClick?: () => void;
}

export function TransferForm({
  account,
  provider,
  privateBalance,
  privateBalanceLoading,
  onSuccess,
  asset,
  decimals,
  availableAssets,
  onAssetChange,
  formatUsdValue,
  convertAmount,
  nearIntentsTokens = [],
  pricesLoading: _pricesLoading = false,
  onConnectClick,
}: TransferFormProps) {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<WithdrawStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapTransferStatus>({ stage: 'idle' });
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);

  // Fee preview state
  const [feePreview, setFeePreview] = useState<{
    solAmount: string;
    fee: string;
    feePercent: string;
    rentFee: string;
    totalWithdraw: string;
    sufficient: boolean;
    belowMinimum: boolean;
    minimumAmount: number;
  } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  // Max amount after fees (for MAX button)
  const [maxSolAfterFees, setMaxSolAfterFees] = useState<string | null>(null);

  // Success notification state
  const [successNotification, setSuccessNotification] = useState<{ message: string; visible: boolean } | null>(null);
  const lastSubmittedAmountRef = useRef<{ amount: string; asset: string } | null>(null);

  // Reset form when provider changes
  useEffect(() => {
    setAmount('');
    setDestinationAddress('');
    setStatus(null);
    setError(null);
    setSwapStatus({ stage: 'idle' });
    setFeePreview(null);
    setMaxSolAfterFees(null);
  }, [provider]);

  // Auto-hide success notification
  useEffect(() => {
    if (successNotification?.visible) {
      const fadeTimer = setTimeout(() => {
        setSuccessNotification(prev => prev ? { ...prev, visible: false } : null);
      }, 2000);
      const removeTimer = setTimeout(() => {
        setSuccessNotification(null);
      }, 2500);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [successNotification?.visible]);

  // Show success notification when withdrawal completes
  useEffect(() => {
    if (status?.stage === 'completed') {
      const submitted = lastSubmittedAmountRef.current;
      const amountText = submitted ? `${submitted.amount} ${submitted.asset}` : '';
      setSuccessNotification({ message: amountText, visible: true });
      // Reset status after showing notification
      const timer = setTimeout(() => setStatus(null), 500);
      return () => clearTimeout(timer);
    }
  }, [status?.stage]);

  // Check if we need to swap (any non-SOL asset needs swap via NEAR Intents)
  const needsSwap = asset !== 'SOL';

  // Parse asset: "ADA:cardano" -> { symbol: "ADA", chain: "cardano" }
  const [assetSymbol, assetChain] = asset.includes(':')
    ? [asset.split(':')[0] ?? asset, asset.split(':')[1] ?? 'sol']
    : [asset, 'sol'];

  const formatBalance = (amount: bigint, assetDecimals: number = decimals): string => {
    const divisor = Math.pow(10, assetDecimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  // SOL balance formatted (always 9 decimals)
  const solBalanceFormatted = formatBalance(privateBalance, 9);

  // Calculate fee preview when amount changes
  const calculateFeePreview = useCallback(async () => {
    if (!amount || !provider || !account || parseFloat(amount) <= 0) {
      setFeePreview(null);
      setFeeError(null);
      return;
    }

    setFeeLoading(true);
    setFeeError(null);
    try {
      // Detect provider type by name (more reliable than 'in' checks)
      const providerName = (provider as { name?: string }).name;
      const isPrivacyCash = providerName === 'privacy-cash';
      const isShadowWire = providerName?.toLowerCase() === 'shadowwire' || 'transfer' in provider;

      console.log('[TransferForm] Fee preview - provider:', providerName, 'isPrivacyCash:', isPrivacyCash, 'isShadowWire:', isShadowWire);

      // Convert target amount to SOL
      let solAmount: string;
      if (needsSwap) {
        const converted = convertAmount?.(assetSymbol, 'SOL', amount);
        if (!converted) {
          console.log('[TransferForm] Fee preview - no conversion available for', assetSymbol);
          setFeePreview(null);
          setFeeLoading(false);
          return;
        }
        solAmount = converted;
      } else {
        solAmount = amount;
      }

      // Add price buffer (2%)
      const priceBuffer = 1.02;
      const solAmountWithBuffer = (parseFloat(solAmount) * priceBuffer).toFixed(9);
      const solBaseUnits = account.assetToBaseUnits(solAmountWithBuffer);

      console.log('[TransferForm] Fee preview - solAmount:', solAmount, 'withBuffer:', solAmountWithBuffer, 'baseUnits:', solBaseUnits.toString());

      let fee: bigint;
      let totalWithdraw: bigint;
      let feePercent = 0;
      let rentFee = 0;

      if (isPrivacyCash) {
        // PrivacyCash: percentage + rent fee
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pcProvider = provider as any;
        // eslint-disable-next-line no-console
        console.log('[TransferForm] Calling getFeeConfig...');
        const config = await pcProvider.getFeeConfig();
        // eslint-disable-next-line no-console
        console.log('[TransferForm] PrivacyCash fee config:', config);
        // withdrawFeeRate is decimal (e.g., 0.001 for 0.1%), convert to percentage for display
        feePercent = config.withdrawFeeRate * 100;
        rentFee = config.withdrawRentFee;
        console.log('[TransferForm] Calling calculateWithdrawAmount with', solBaseUnits.toString());
        const result = await pcProvider.calculateWithdrawAmount(solBaseUnits);
        console.log('[TransferForm] PrivacyCash calculateWithdrawAmount result:', result);
        totalWithdraw = result.withdrawAmount as bigint;
        fee = result.fee as bigint;
      } else if (isShadowWire) {
        // ShadowWire: use SDK's calculateFee for accurate fee calculation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const swProvider = provider as any;
        // getFeePercentage() returns decimal directly (0.005 for 0.5%, NOT 0.5)
        const baseFeeRate = swProvider.getFeePercentage();
        const feeBuffer = 0.001; // Add 0.1% buffer for safety
        const feeRate = baseFeeRate + feeBuffer;
        feePercent = feeRate * 100; // For display: 0.006 -> 0.6%

        // Calculate the amount to withdraw to get the desired net amount after fee
        const desiredNetSol = parseFloat(solAmountWithBuffer);
        let withdrawAmountSol = desiredNetSol / (1 - feeRate);

        // Verify with calculateFee and adjust if needed
        let feeBreakdown = swProvider.calculateFee(withdrawAmountSol);
        while (feeBreakdown.netAmount < desiredNetSol) {
          withdrawAmountSol += 0.0001;
          feeBreakdown = swProvider.calculateFee(withdrawAmountSol);
        }

        // eslint-disable-next-line no-console
        console.log('[TransferForm] ShadowWire fee breakdown:', {
          feeRate,
          feePercentDisplay: feePercent,
          desiredNetSol,
          withdrawAmountSol,
          feeBreakdown,
        });

        totalWithdraw = account.assetToBaseUnits(withdrawAmountSol.toFixed(9));
        fee = account.assetToBaseUnits(feeBreakdown.fee.toFixed(9));
      } else {
        // Fallback: no fee
        console.warn('[TransferForm] Unknown provider type, no fee calculation');
        totalWithdraw = solBaseUnits;
        fee = 0n;
      }

      const sufficient = privateBalance >= totalWithdraw;
      const totalWithdrawSol = Number(totalWithdraw) / 1e9;

      // Check minimum amount for ShadowWire
      let belowMinimum = false;
      let minimumAmount = 0;
      if (isShadowWire) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        minimumAmount = (provider as any).getMinimumAmount();
        belowMinimum = totalWithdrawSol < minimumAmount;
      }

      setFeePreview({
        solAmount: solAmountWithBuffer,
        fee: (Number(fee) / 1e9).toFixed(6),
        feePercent: feePercent.toFixed(2), // Already in percentage form (0.5 for 0.5%)
        rentFee: rentFee.toFixed(4),
        totalWithdraw: totalWithdrawSol.toFixed(6),
        sufficient,
        belowMinimum,
        minimumAmount,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[TransferForm] Fee preview error:', errorMsg, err);
      setFeePreview(null);
      setFeeError(errorMsg);
    } finally {
      setFeeLoading(false);
    }
  }, [amount, provider, needsSwap, assetSymbol, convertAmount, account, privateBalance]);

  // Recalculate fee preview when inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      void calculateFeePreview();
    }, 300); // Debounce
    return () => clearTimeout(timer);
  }, [calculateFeePreview]);

  // Calculate max SOL available after accounting for fees
  useEffect(() => {
    const calculateMax = async () => {
      if (!provider || !account) {
        setMaxSolAfterFees(null);
        return;
      }

      // Wait for balance to finish loading before calculating
      if (privateBalanceLoading) {
        setMaxSolAfterFees(null);
        return;
      }

      // Use actual balance (not rounded display value) for precision
      const balanceSol = Number(privateBalance) / 1e9;
      if (balanceSol <= 0) {
        setMaxSolAfterFees('0');
        return;
      }

      try {
        const providerName = (provider as { name?: string }).name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const providerAny = provider as any;
        // Detect by method existence for more reliable detection
        const hasCalculateWithdrawAmount = typeof providerAny.calculateWithdrawAmount === 'function';
        const hasGetFeePercentage = typeof providerAny.getFeePercentage === 'function';
        const isPrivacyCash = hasCalculateWithdrawAmount || providerName === 'privacy-cash';
        const isShadowWire = !isPrivacyCash && (hasGetFeePercentage || providerName?.toLowerCase() === 'shadowwire');

        console.log('[TransferForm] MAX calc starting - provider:', providerName, 'isPrivacyCash:', isPrivacyCash, 'isShadowWire:', isShadowWire, 'balance:', balanceSol);

        // Fee preview adds 2% price buffer, so we need to account for it
        const priceBuffer = 1.02;
        // Add small safety margin to avoid edge cases with rounding
        const safetyMargin = 0.9995;
        let maxNetSol: number;

        if (isPrivacyCash && hasCalculateWithdrawAmount) {
          // PrivacyCash: use SDK to verify max amount
          // Calculate minimum fee by checking what fee would be charged for a tiny amount
          const tinyAmount = account.assetToBaseUnits('0.0001');
          const minFeeCheck = await providerAny.calculateWithdrawAmount(tinyAmount);
          const minFeeSol = Number(minFeeCheck.fee as bigint) / 1e9;

          console.log('[TransferForm] MAX calc - PrivacyCash minFee:', minFeeSol, 'balance:', balanceSol);

          // If minimum fee exceeds balance, max is 0
          if (minFeeSol >= balanceSol) {
            console.log('[TransferForm] MAX calc - fee exceeds balance, setting max to 0');
            maxNetSol = 0;
          } else {
            // Binary search to find max amount that fits in balance
            let low = 0;
            let high = balanceSol;
            const balanceLamports = privateBalance;

            for (let i = 0; i < 20; i++) { // 20 iterations for precision
              const mid = (low + high) / 2;
              const midWithBuffer = mid * priceBuffer;
              const midLamports = account.assetToBaseUnits(midWithBuffer.toFixed(9));
              const result = await providerAny.calculateWithdrawAmount(midLamports);
              const totalWithdraw = result.withdrawAmount as bigint;

              if (totalWithdraw <= balanceLamports) {
                low = mid;
              } else {
                high = mid;
              }
            }
            maxNetSol = low * safetyMargin;
            console.log('[TransferForm] MAX calc - binary search result:', maxNetSol);
          }
        } else if (isShadowWire) {
          // ShadowWire: percentage fee
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const swProvider = provider as any;
          const baseFeeRate = swProvider.getFeePercentage(); // e.g., 0.005 for 0.5%
          const feeBuffer = 0.001; // 0.1% buffer for safety
          const feeRate = baseFeeRate + feeBuffer;
          // maxNet = balance * (1 - feeRate) / priceBuffer * safetyMargin
          maxNetSol = (balanceSol * (1 - feeRate)) / priceBuffer * safetyMargin;
        } else {
          maxNetSol = balanceSol * safetyMargin;
        }

        // Ensure non-negative and truncate (floor) to 4 decimals to avoid rounding up
        maxNetSol = Math.max(0, maxNetSol);
        const truncated = Math.floor(maxNetSol * 10000) / 10000;
        setMaxSolAfterFees(truncated.toFixed(4));
      } catch (err) {
        console.error('[TransferForm] Error calculating max after fees:', err);
        setMaxSolAfterFees(null);
      }
    };

    void calculateMax();
  }, [provider, account, privateBalance, privateBalanceLoading]);

  // Direct SOL transfer (no swap needed)
  const handleDirectTransfer = async (solAmount: string) => {
    if (!provider) {
      throw new Error('Provider not initialized');
    }
    if (!account) {
      throw new Error('Account not connected');
    }

    const baseUnits = account.assetToBaseUnits(solAmount);
    const userAddress = await account.getAddress();
    const isSelfTransfer = destinationAddress.toLowerCase() === userAddress.toLowerCase();

    // ShadowWire uses transfer() for others, withdraw() for self
    if ('transfer' in provider) {
      if (isSelfTransfer && 'withdraw' in provider) {
        // Withdraw to own wallet
        await provider.withdraw({
          destination: { address: destinationAddress },
          amount: baseUnits.toString(),
          onStatusChange: setStatus,
        });
      } else {
        // Transfer to external address
        await provider.transfer({
          recipient: destinationAddress,
          amount: baseUnits.toString(),
          type: 'external',
          onStatusChange: setStatus,
        });
      }
    } else {
      // PrivacyCash uses withdraw()
      await provider.withdraw({
        destination: { address: destinationAddress },
        amount: baseUnits.toString(),
        onStatusChange: setStatus,
      });
    }
  };

  // Transfer with swap via NEAR Intents (SOL -> target asset, supports cross-chain)
  const handleSwapTransfer = async () => {
    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;
    if (!jwtToken) {
      throw new Error('NEAR Intents not configured');
    }

    if (!provider) {
      throw new Error('Provider not initialized');
    }
    if (!account) {
      throw new Error('Account not connected');
    }

    // Debug: log available tokens
    console.log('[TransferForm] Available tokens:', nearIntentsTokens.length);
    console.log('[TransferForm] Looking for SOL on sol, and', assetSymbol, 'on', assetChain);

    // Find SOL asset
    const solAsset = nearIntentsTokens.find(
      (t) => t.symbol === 'SOL' && t.blockchain === 'sol'
    );
    console.log('[TransferForm] SOL asset:', solAsset);
    if (!solAsset) {
      throw new Error('SOL asset not found in NEAR Intents');
    }

    // Find target asset (can be on Solana or another chain)
    const targetAsset = nearIntentsTokens.find(
      (t) => t.symbol === assetSymbol && t.blockchain === assetChain
    );
    console.log('[TransferForm] Target asset:', targetAsset);
    if (!targetAsset) {
      // Debug: show available assets on the requested chain
      const assetsOnChain = nearIntentsTokens.filter((t) => t.blockchain === assetChain);
      console.log('[TransferForm] Available assets on', assetChain, ':', assetsOnChain.map(t => t.symbol));
      throw new Error(`Target asset ${asset} not found in NEAR Intents`);
    }

    // Convert target amount to SOL amount
    const solAmount = convertAmount?.(assetSymbol, 'SOL', amount);
    if (!solAmount) {
      throw new Error('Could not convert amount to SOL');
    }

    // Calculate amounts:
    // 1. solAmountForSwap = SOL that arrives at NEAR Intents deposit address (with price buffer)
    // 2. solAmountToWithdraw = SOL to withdraw from pool (adds pool fee on top)
    //
    // Flow: Pool → (minus fee) → Deposit Address → NEAR Intents Swap → Destination
    //
    const priceBuffer = 1.02; // 2% buffer for price fluctuation during swap

    // Detect provider type by name
    const providerName = (provider as { name?: string }).name;
    const isPrivacyCash = providerName === 'privacy-cash';
    const isShadowWire = providerName?.toLowerCase() === 'shadowwire' || 'transfer' in provider;

    // Amount that should arrive at NEAR Intents (what we tell the API)
    const solAmountForSwap = (parseFloat(solAmount) * priceBuffer).toFixed(9);
    const solBaseUnitsForQuote = account.assetToBaseUnits(solAmountForSwap);

    // Calculate amount to withdraw using provider's fee estimation
    let solBaseUnitsToWithdraw: bigint;
    const feeInfo: { feeRate?: number; rentFee?: number; totalFee?: bigint } = {};

    if (isPrivacyCash) {
      // PrivacyCash: has both percentage fee AND fixed rent fee
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const privacyCashProvider = provider as any;

      const feeConfig = await privacyCashProvider.getFeeConfig();
      feeInfo.feeRate = feeConfig.withdrawFeeRate;
      feeInfo.rentFee = feeConfig.withdrawRentFee;

      const { withdrawAmount, fee } = await privacyCashProvider.calculateWithdrawAmount(solBaseUnitsForQuote);
      solBaseUnitsToWithdraw = withdrawAmount as bigint;
      feeInfo.totalFee = fee as bigint;

      console.log('[TransferForm] PrivacyCash fee calculation:', {
        desiredNet: solBaseUnitsForQuote.toString(),
        withdrawAmount: withdrawAmount.toString(),
        fee: fee.toString(),
        feeRate: feeConfig.withdrawFeeRate,
        rentFee: feeConfig.withdrawRentFee,
      });
    } else if (isShadowWire) {
      // ShadowWire: use SDK's calculateFee for accurate fee calculation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const swProvider = provider as any;

      // Get the desired net amount (what should arrive at NEAR Intents)
      const desiredNetSol = parseFloat(solAmountForSwap);

      // getFeePercentage() returns decimal directly (0.005 for 0.5%, NOT 0.5)
      const baseFeeRate = swProvider.getFeePercentage();
      const feeBuffer = 0.001; // Add 0.1% buffer for safety
      const feeRate = baseFeeRate + feeBuffer;
      let withdrawAmountSol = desiredNetSol / (1 - feeRate);

      // Verify with calculateFee and adjust if needed
      let feeBreakdown = swProvider.calculateFee(withdrawAmountSol);

      // If netAmount is less than desired, increase withdrawal amount
      while (feeBreakdown.netAmount < desiredNetSol) {
        withdrawAmountSol += 0.0001; // Add 0.0001 SOL and recalculate
        feeBreakdown = swProvider.calculateFee(withdrawAmountSol);
      }

      solBaseUnitsToWithdraw = account.assetToBaseUnits(withdrawAmountSol.toFixed(9));
      feeInfo.feeRate = feeRate;
      feeInfo.totalFee = account.assetToBaseUnits(feeBreakdown.fee.toFixed(9));

      // Check minimum amount
      const minimumAmount = swProvider.getMinimumAmount();
      if (withdrawAmountSol < minimumAmount) {
        throw new Error(`Amount ${withdrawAmountSol.toFixed(4)} SOL is below ShadowWire minimum of ${minimumAmount} SOL`);
      }

      // eslint-disable-next-line no-console
      console.log('[TransferForm] ShadowWire fee calculation:', {
        feeRate,
        feeRatePercent: feeRate * 100,
        desiredNet: desiredNetSol,
        withdrawAmount: withdrawAmountSol,
        fee: feeBreakdown.fee,
        netAmount: feeBreakdown.netAmount,
        minimumAmount,
      });
    } else {
      // Fallback: no fee adjustment
      console.warn('[TransferForm] Unknown provider type, no fee adjustment');
      solBaseUnitsToWithdraw = solBaseUnitsForQuote;
    }

    const solAmountToWithdraw = (Number(solBaseUnitsToWithdraw) / 1e9).toFixed(9);

    console.log('[TransferForm] SOL conversion:', {
      targetAmount: amount,
      targetAsset: assetSymbol,
      solAmount,
      priceBuffer,
      isShadowWire,
      solAmountForSwap,
      solAmountToWithdraw,
      solBaseUnitsForQuote: solBaseUnitsForQuote.toString(),
      solBaseUnitsToWithdraw: solBaseUnitsToWithdraw.toString(),
      feeInfo,
    });

    setSwapStatus({ stage: 'getting_quote' });

    const api = OneClickApi({ jwtToken });

    const senderAddress = await account.getAddress();
    // For cross-chain swaps, use a longer deadline (30 minutes instead of 3)
    const deadlineMs = assetChain !== 'sol' ? 30 * 60 * 1000 : 3 * 60 * 1000;
    const quoteParams = {
      dry: false,
      senderAddress, // Solana address for refunds
      recipientAddress: destinationAddress, // Where to send the swapped asset (can be any chain)
      originAsset: solAsset.assetId,
      destinationAsset: targetAsset.assetId,
      amount: solBaseUnitsForQuote.toString(), // Amount that will arrive at deposit address (after pool fee)
      slippageTolerance: 100, // 1% in basis points
      deadline: new Date(Date.now() + deadlineMs).toISOString(),
    };
    console.log('[TransferForm] Quote request params:', quoteParams);

    // Get quote: SOL -> target asset
    // For cross-chain: recipientAddress is on the target chain (e.g., Cardano address)
    // For Solana swaps: recipientAddress is a Solana address
    let quoteResponse;
    try {
      quoteResponse = await api.getQuote(quoteParams);
      console.log('[TransferForm] Quote response:', quoteResponse);
    } catch (quoteErr) {
      console.error('[TransferForm] Quote error details:', quoteErr);
      throw quoteErr;
    }

    const depositAddress = quoteResponse.quote?.depositAddress;
    if (!depositAddress) {
      throw new Error('No deposit address received from quote');
    }

    setSwapStatus({ stage: 'transferring', depositAddress });

    // Check private balance before transfer
    const currentPrivateBalance = await provider.getPrivateBalance();
    const hasSufficientBalance = currentPrivateBalance >= solBaseUnitsToWithdraw;

    console.log('[TransferForm] Pre-transfer state:', {
      depositAddress,
      privateBalance: currentPrivateBalance.toString(),
      privateBalanceSOL: Number(currentPrivateBalance) / 1e9,
      amountToWithdraw: solBaseUnitsToWithdraw.toString(),
      amountToWithdrawSOL: Number(solBaseUnitsToWithdraw) / 1e9,
      expectedNetAmount: solBaseUnitsForQuote.toString(),
      expectedNetAmountSOL: Number(solBaseUnitsForQuote) / 1e9,
      sufficientBalance: hasSufficientBalance,
    });

    // Warn if insufficient balance - PrivacyCash will do a partial withdrawal!
    if (!hasSufficientBalance) {
      const shortfall = Number(solBaseUnitsToWithdraw - currentPrivateBalance) / 1e9;
      console.warn(`[TransferForm] WARNING: Insufficient balance! Need ${Number(solBaseUnitsToWithdraw) / 1e9} SOL but only have ${Number(currentPrivateBalance) / 1e9} SOL. Short by ${shortfall} SOL. This will result in a partial withdrawal.`);
    }

    // Transfer SOL from privacy pool to the deposit address
    // We withdraw solBaseUnitsToWithdraw (includes pool fee compensation)
    // so that solBaseUnitsForQuote arrives at the deposit address
    if ('transfer' in provider) {
      await provider.transfer({
        recipient: depositAddress,
        amount: solBaseUnitsToWithdraw.toString(),
        type: 'external',
        onStatusChange: setStatus,
      });
    } else {
      await provider.withdraw({
        destination: { address: depositAddress },
        amount: solBaseUnitsToWithdraw.toString(),
        onStatusChange: setStatus,
      });
    }

    // Start polling for swap status
    setSwapStatus({ stage: 'swapping', status: 'PENDING' });

    const handleStatusChange = (event: SwapStateChangeEvent) => {
      // eslint-disable-next-line no-console
      console.log('[TransferForm] Swap status:', event);

      // Check for end states
      if (event.status === 'SUCCESS') {
        setSwapStatus({ stage: 'completed' });
      } else if (event.status === 'FAILED' || event.status === 'REFUNDED') {
        setSwapStatus({ stage: 'failed', error: `Swap ${event.status.toLowerCase()}` });
      } else {
        setSwapStatus({ stage: 'swapping', status: event.status });
      }
    };

    // Poll in background
    api.pollStatus({
      depositAddress,
      maxAttempts: 120,
      pollingInterval: 5000,
      initialDelay: 3000,
      onStatusChange: handleStatusChange,
    }).catch((err) => {
      console.error('[TransferForm] Polling error:', err);
    });
  };

  const handleTransfer = async () => {
    console.log('[TransferForm] handleTransfer called', {
      destinationAddress,
      amount,
      provider: provider ? (provider as { name?: string }).name : null,
      needsSwap,
      asset,
    });

    if (!destinationAddress) {
      setError('Please enter a destination address');
      return;
    }
    if (!amount) {
      setError('Please enter an amount');
      return;
    }
    if (!provider) {
      setError('Provider not initialized');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus({ stage: 'preparing' });
    setSwapStatus({ stage: 'idle' });
    lastSubmittedAmountRef.current = { amount, asset };

    try {
      if (needsSwap) {
        // Transfer with swap: SOL -> target asset
        await handleSwapTransfer();
      } else {
        // Direct SOL transfer
        await handleDirectTransfer(amount);
        setAmount('');
        setDestinationAddress('');
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus({ stage: 'failed', error: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!status) return 'info';
    switch (status.stage) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'info';
    }
  };

  const getStatusText = () => {
    if (!status) return '';
    switch (status.stage) {
      case 'preparing':
        return 'Preparing transfer...';
      case 'processing':
        return 'Processing through privacy pool...';
      case 'confirming':
        return 'Confirming transaction...';
      case 'completed':
        return needsSwap ? 'Transfer sent, waiting for swap...' : `Transfer completed! TX: ${status.txHash?.slice(0, 8)}...`;
      case 'failed':
        return `Failed: ${status.error}`;
      default:
        return '';
    }
  };

  const getSwapStatusText = () => {
    switch (swapStatus.stage) {
      case 'getting_quote':
        return 'Getting swap quote...';
      case 'transferring':
        return 'Transferring SOL from privacy pool...';
      case 'swapping':
        return `Swapping SOL → ${asset}: ${swapStatus.status}`;
      case 'completed':
        return `Swap completed! ${asset} sent to destination.`;
      case 'failed':
        return `Swap failed: ${swapStatus.error}`;
      default:
        return '';
    }
  };

  const getSwapStatusColor = () => {
    switch (swapStatus.stage) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'info';
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, position: 'relative' }}>
      {/* Success notification */}
      {successNotification && (
        <Box
          sx={{
            position: 'absolute',
            top: 60,
            right: 16,
            background: 'rgba(20, 241, 149, 0.1)',
            border: '1px solid rgba(20, 241, 149, 0.3)',
            color: '#fff',
            px: 2.5,
            py: 1.5,
            borderRadius: '12px',
            opacity: successNotification.visible ? 1 : 0,
            transition: 'opacity 0.5s ease-out',
            zIndex: 10,
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', mb: 0.5 }}>
            Withdrawn
          </Typography>
          <Typography sx={{ fontWeight: 600, color: '#14F195' }}>
            {successNotification.message}
          </Typography>
        </Box>
      )}

      <Box display="flex" alignItems="center" gap={1} mb={3} mt={0}>
        <ArrowUpwardIcon sx={{ color: '#9945FF', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={600}>
          Withdraw
        </Typography>
      </Box>

      <Box component="form" noValidate autoComplete="off">
        {/* Combined Amount + Asset Selector */}
        <Box
          sx={{
            mb: 2,
            p: 3,
            bgcolor: '#000000',
            borderRadius: '32px',
            border: '1px solid rgba(255,255,255,0.1)',
            minHeight: 120,
            position: 'relative',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Amount
          </Typography>
          <Box>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                }
              }}
              placeholder="0"
              disabled={loading}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '36px',
                fontWeight: 600,
                color: '#ffffff',
                width: '100%',
                fontFamily: 'inherit',
              }}
            />
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {amount && formatUsdValue ? (formatUsdValue(assetSymbol, amount) ?? '$0') : '$0'}
              </Typography>
              <Typography
                variant="body2"
                onClick={() => {
                  if (loading || !maxSolAfterFees) return;
                  // Use fee-adjusted max amount
                  if (asset === 'SOL') {
                    setAmount(maxSolAfterFees);
                  } else if (convertAmount) {
                    const converted = convertAmount('SOL', assetSymbol, maxSolAfterFees);
                    setAmount(converted ?? maxSolAfterFees);
                  } else {
                    setAmount(maxSolAfterFees);
                  }
                }}
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  cursor: (loading || !maxSolAfterFees) ? 'default' : 'pointer',
                  mr: 1,
                  '&:hover': {
                    color: (loading || !maxSolAfterFees) ? 'rgba(255,255,255,0.5)' : 'primary.main',
                  },
                }}
              >
                MAX: {(privateBalanceLoading || !maxSolAfterFees) ? '...' : (() => {
                  if (asset === 'SOL') {
                    return `${maxSolAfterFees} SOL`;
                  } else if (convertAmount) {
                    return `${convertAmount('SOL', assetSymbol, maxSolAfterFees) ?? maxSolAfterFees} ${assetSymbol}`;
                  } else {
                    return `${maxSolAfterFees} SOL`;
                  }
                })()}
              </Typography>
            </Box>
          </Box>
          <Box
            onClick={() => !loading && setTokenSelectorOpen(true)}
            sx={{
              position: 'absolute',
              right: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
              '&:hover': {
                opacity: loading ? 0.5 : 0.8,
              },
            }}
          >
            {getAssetIcon(asset) && (
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  bgcolor: 'transparent',
                  flexShrink: 0,
                }}
              >
                <img
                  src={getAssetIcon(asset)!}
                  alt={getAssetDisplayName(asset)}
                  style={{ width: 36, height: 36, objectFit: 'cover' }}
                />
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Typography sx={{ fontSize: '18px', fontWeight: 600, lineHeight: 1 }}>
                {getAssetDisplayName(asset)}
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  bgcolor: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  px: 0.5,
                  width: 'fit-content',
                }}
              >
                <Typography sx={{ fontSize: '10px', color: 'text.secondary', lineHeight: 1.4 }}>
                  {CHAIN_NAMES[assetChain] ?? assetChain.toUpperCase()}
                </Typography>
              </Box>
            </Box>
            <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
          </Box>
        </Box>

        <TokenSelector
          open={tokenSelectorOpen}
          onClose={() => setTokenSelectorOpen(false)}
          onSelect={(newAsset) => onAssetChange(newAsset)}
          availableAssets={availableAssets}
          currentAsset={asset}
        />

        <TextField
          fullWidth
          label={assetChain === 'sol' ? 'Destination Address' : `${assetChain.toUpperCase()} Address`}
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder={assetChain === 'sol' ? 'Enter Solana address' : `Enter ${assetChain.toUpperCase()} address`}
          disabled={loading}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              bgcolor: '#000000',
              pl: 2,
              '& fieldset': {
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: '1px',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: '1px',
              },
              '&.Mui-focused fieldset': {
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: '1px',
              },
            },
            '& .MuiInputLabel-root': {
              color: 'rgba(255,255,255,0.3)',
              '&:not(.MuiInputLabel-shrink)': {
                transform: 'translate(24px, 16px) scale(1)',
              },
            },
            '& .MuiOutlinedInput-input::placeholder': {
              color: 'rgba(255,255,255,0.2)',
              opacity: 1,
            },
          }}
        />

        {/* Fee preview */}
        {(feePreview || feeLoading || feeError) && amount && parseFloat(amount) > 0 && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              bgcolor: feeError ? 'error.dark' : feePreview?.sufficient === false ? 'error.dark' : 'action.hover',
              borderRadius: 1,
              opacity: feeLoading ? 0.7 : 1,
            }}
          >
            {feeLoading ? (
              <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Calculating fees...
                </Typography>
              </Box>
            ) : feeError ? (
              <Typography variant="body2" color="error.light">
                Fee calculation error: {feeError}
              </Typography>
            ) : feePreview ? (
              <Box>
                {needsSwap && (
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" color="text.secondary">
                      {amount} {assetSymbol} ≈
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {feePreview.solAmount} SOL
                    </Typography>
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Pool fee:
                  </Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={500}>
                    ~{feePreview.fee} SOL {formatUsdValue ? `(${formatUsdValue('SOL', feePreview.fee) ?? ''})` : ''}
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  pt={0.5}
                  sx={{ borderTop: 1, borderColor: 'divider' }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    Total from pool:
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {feePreview.totalWithdraw} SOL
                  </Typography>
                </Box>
                {!feePreview.sufficient && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                    <Typography variant="caption">
                      Insufficient balance! You have {solBalanceFormatted} SOL
                    </Typography>
                  </Alert>
                )}
                {feePreview.belowMinimum && (
                  <Alert severity="error" sx={{ mt: 1, py: 0 }}>
                    <Typography variant="caption">
                      Below minimum! ShadowWire requires at least {feePreview.minimumAmount} SOL per transfer
                    </Typography>
                  </Alert>
                )}
              </Box>
            ) : null}
          </Box>
        )}

        {/* Info about swap when non-SOL asset selected */}
        {needsSwap && swapStatus.stage === 'idle' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              SOL will be transferred from your private balance and swapped to {assetSymbol}
              {assetChain !== 'sol' ? ` on ${assetChain.toUpperCase()}` : ''} via NEAR Intents.
            </Typography>
          </Alert>
        )}

        {error && status?.stage !== 'failed' && swapStatus.stage !== 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && !needsSwap && (
          <Alert severity={getStatusColor()} sx={{ mb: 2 }}>
            {getStatusText()}
          </Alert>
        )}

        {/* Swap status display */}
        {needsSwap && swapStatus.stage !== 'idle' && (
          <Alert severity={getSwapStatusColor()} sx={{ mb: 2 }}>
            {getSwapStatusText()}
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => {
            if (!account && onConnectClick) {
              onConnectClick();
            } else {
              void handleTransfer();
            }
          }}
          disabled={account ? (loading || !destinationAddress || !amount || !provider || (needsSwap && swapStatus.stage !== 'idle' && swapStatus.stage !== 'completed' && swapStatus.stage !== 'failed') || (feePreview && (!feePreview.sufficient || feePreview.belowMinimum))) : false}
          sx={{
            py: 1.5,
            background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #8739E6 0%, #12D986 100%)',
            },
          }}
        >
          {!account ? (
            'Connect Wallet'
          ) : loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : needsSwap ? (
            `Withdraw SOL → ${assetSymbol}${assetChain !== 'sol' ? ` (${assetChain.toUpperCase()})` : ''}`
          ) : (
            `Withdraw ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
