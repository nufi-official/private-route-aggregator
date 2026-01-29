import { useState } from 'react';
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

    // Add a small buffer for price fluctuation (2%)
    const solAmountWithBuffer = (parseFloat(solAmount) * 1.02).toFixed(9);
    const solBaseUnits = account.assetToBaseUnits(solAmountWithBuffer);

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
      amount: solBaseUnits.toString(),
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

    // Transfer SOL from privacy pool to the deposit address
    if ('transfer' in provider) {
      await provider.transfer({
        recipient: depositAddress,
        amount: solBaseUnits.toString(),
        type: 'external',
        onStatusChange: setStatus,
      });
    } else {
      await provider.withdraw({
        destination: { address: depositAddress },
        amount: solBaseUnits.toString(),
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
          >
            {availableAssets.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
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
