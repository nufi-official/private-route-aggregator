import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListSubheader,
} from '@mui/material';
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
  zec: 'Zcash',
  gnosis: 'Gnosis',
  bera: 'Berachain',
  bsc: 'BNB Chain',
  pol: 'Polygon',
  tron: 'TRON',
  sui: 'Sui',
  op: 'Optimism',
  avax: 'Avalanche',
  cardano: 'Cardano',
  ltc: 'Litecoin',
  xlayer: 'X Layer',
  monad: 'Monad',
  bch: 'Bitcoin Cash',
  starknet: 'Starknet',
};

// Group assets by chain
function groupAssetsByChain(assets: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const asset of assets) {
    const chain = asset.includes(':') ? asset.split(':')[1] ?? 'sol' : 'sol';
    if (!groups.has(chain)) {
      groups.set(chain, []);
    }
    groups.get(chain)!.push(asset);
  }

  // Sort: Solana first, then alphabetically by chain name
  const sortedGroups = new Map<string, string[]>();
  if (groups.has('sol')) {
    sortedGroups.set('sol', groups.get('sol')!);
  }
  const otherChains = [...groups.keys()].filter(c => c !== 'sol').sort((a, b) =>
    (CHAIN_NAMES[a] ?? a).localeCompare(CHAIN_NAMES[b] ?? b)
  );
  for (const chain of otherChains) {
    sortedGroups.set(chain, groups.get(chain)!);
  }

  return sortedGroups;
}

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
  account: Account;
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
  pricesLoading = false,
}: TransferFormProps) {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<WithdrawStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapTransferStatus>({ stage: 'idle' });

  // Fee preview state
  const [feePreview, setFeePreview] = useState<{
    solAmount: string;
    fee: string;
    feePercent: string;
    rentFee: string;
    totalWithdraw: string;
    sufficient: boolean;
  } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

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
    if (!amount || !provider || parseFloat(amount) <= 0) {
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
      const isShadowWire = providerName === 'shadowwire' || 'transfer' in provider;

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
        console.log('[TransferForm] Calling getFeeConfig...');
        const config = await pcProvider.getFeeConfig();
        console.log('[TransferForm] PrivacyCash fee config:', config);
        feePercent = config.withdrawFeeRate;
        rentFee = config.withdrawRentFee;
        console.log('[TransferForm] Calling calculateWithdrawAmount with', solBaseUnits.toString());
        const result = await pcProvider.calculateWithdrawAmount(solBaseUnits);
        console.log('[TransferForm] PrivacyCash calculateWithdrawAmount result:', result);
        totalWithdraw = result.withdrawAmount as bigint;
        fee = result.fee as bigint;
      } else if (isShadowWire) {
        // ShadowWire: percentage-based fee
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const swProvider = provider as any;
        feePercent = swProvider.getFeePercentage() / 100;
        const withdrawAmount = parseFloat(solAmountWithBuffer) / (1 - feePercent);
        totalWithdraw = account.assetToBaseUnits(withdrawAmount.toFixed(9));
        fee = totalWithdraw - solBaseUnits;
      } else {
        // Fallback: no fee
        console.warn('[TransferForm] Unknown provider type, no fee calculation');
        totalWithdraw = solBaseUnits;
        fee = 0n;
      }

      const sufficient = privateBalance >= totalWithdraw;

      setFeePreview({
        solAmount: solAmountWithBuffer,
        fee: (Number(fee) / 1e9).toFixed(6),
        feePercent: (feePercent * 100).toFixed(2),
        rentFee: rentFee.toFixed(4),
        totalWithdraw: (Number(totalWithdraw) / 1e9).toFixed(6),
        sufficient,
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
      calculateFeePreview();
    }, 300); // Debounce
    return () => clearTimeout(timer);
  }, [calculateFeePreview]);

  // Direct SOL transfer (no swap needed)
  const handleDirectTransfer = async (solAmount: string) => {
    if (!provider) {
      throw new Error('Provider not initialized');
    }

    const baseUnits = account.assetToBaseUnits(solAmount);

    // ShadowWire uses transfer(), PrivacyCash uses withdraw()
    if ('transfer' in provider) {
      await provider.transfer({
        recipient: destinationAddress,
        amount: baseUnits.toString(),
        type: 'external',
        onStatusChange: setStatus,
      });
    } else {
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
    const isShadowWire = providerName === 'shadowwire' || 'transfer' in provider;

    // Amount that should arrive at NEAR Intents (what we tell the API)
    const solAmountForSwap = (parseFloat(solAmount) * priceBuffer).toFixed(9);
    const solBaseUnitsForQuote = account.assetToBaseUnits(solAmountForSwap);

    // Calculate amount to withdraw using provider's fee estimation
    let solBaseUnitsToWithdraw: bigint;
    let feeInfo: { feeRate?: number; rentFee?: number; totalFee?: bigint } = {};

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
      // ShadowWire: percentage-based fee only
      const calcFee = (provider as { calculateFee: (amount: number) => { fee: number; netAmount: number } }).calculateFee;
      const getFeePercent = (provider as { getFeePercentage: () => number }).getFeePercentage;
      const feePercent = getFeePercent();
      feeInfo.feeRate = feePercent / 100;

      // To receive X after fee: withdraw X / (1 - feeRate)
      const withdrawAmount = parseFloat(solAmountForSwap) / (1 - feeInfo.feeRate);
      solBaseUnitsToWithdraw = account.assetToBaseUnits(withdrawAmount.toFixed(9));

      // Verify
      const verification = calcFee(withdrawAmount);
      console.log('[TransferForm] ShadowWire fee verification:', {
        withdrawAmount,
        expectedNet: parseFloat(solAmountForSwap),
        actualNet: verification.netAmount,
        fee: verification.fee,
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
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={2}>
        Transfer
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Asset</InputLabel>
          <Select
            value={asset}
            label="Asset"
            onChange={(e) => onAssetChange(e.target.value)}
            disabled={loading}
            MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
          >
            {(() => {
              const grouped = groupAssetsByChain(availableAssets);
              const items: React.ReactNode[] = [];

              grouped.forEach((assets, chain) => {
                items.push(
                  <ListSubheader
                    key={`header-${chain}`}
                    sx={{
                      bgcolor: 'background.paper',
                      fontWeight: 600,
                      color: 'primary.main',
                      lineHeight: '32px',
                    }}
                  >
                    {CHAIN_NAMES[chain] ?? chain.toUpperCase()}
                  </ListSubheader>
                );
                assets.forEach((a) => {
                  items.push(
                    <MenuItem key={a} value={a} sx={{ pl: 3 }}>
                      {getAssetDisplayName(a)}
                    </MenuItem>
                  );
                });
              });

              return items;
            })()}
          </Select>
        </FormControl>

        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Private Balance
          </Typography>
          {privateBalanceLoading ? (
            <Typography variant="h6" fontWeight={600} color="secondary">...</Typography>
          ) : (
            <Box display="flex" alignItems="baseline" gap={1}>
              <Typography variant="h6" fontWeight={600} color="secondary">
                {(() => {
                  if (asset === 'SOL') {
                    return `${solBalanceFormatted} SOL`;
                  }
                  // For non-SOL assets, convert the balance
                  const converted = convertAmount?.('SOL', assetSymbol, solBalanceFormatted);
                  if (converted) {
                    return `~${converted} ${assetSymbol}`;
                  }
                  // Show loading or selected asset when conversion not available
                  if (pricesLoading) {
                    return `... ${assetSymbol}`;
                  }
                  return `~? ${assetSymbol}`;
                })()}
              </Typography>
              {formatUsdValue && !pricesLoading && (
                <Typography variant="body2" color="text.secondary">
                  {formatUsdValue('SOL', solBalanceFormatted) ?? ''}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <TextField
          fullWidth
          label={assetChain === 'sol' ? 'Destination Address' : `${assetChain.toUpperCase()} Address`}
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder={assetChain === 'sol' ? 'Enter Solana address' : `Enter ${assetChain.toUpperCase()} address`}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label={`Amount (${asset})`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={loading}
          sx={{ mb: 2 }}
          slotProps={{
            input: {
              inputProps: { min: 0, step: 0.001 },
            },
          }}
          helperText={amount && formatUsdValue ? formatUsdValue(assetSymbol, amount) : undefined}
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
                    Pool fee ({feePreview.feePercent}%{parseFloat(feePreview.rentFee) > 0 ? ` + ${feePreview.rentFee} SOL rent` : ''}):
                  </Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={500}>
                    ~{feePreview.fee} SOL
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
          onClick={() => void handleTransfer()}
          disabled={loading || !destinationAddress || !amount || !provider || (needsSwap && swapStatus.stage !== 'idle' && swapStatus.stage !== 'completed' && swapStatus.stage !== 'failed')}
          sx={{
            py: 1.5,
            background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #8739E6 0%, #12D986 100%)',
            },
          }}
        >
          {loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : needsSwap ? (
            `Transfer SOL → ${assetSymbol}${assetChain !== 'sol' ? ` (${assetChain.toUpperCase()})` : ''}`
          ) : (
            `Transfer ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
