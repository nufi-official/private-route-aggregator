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
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { FundingStatus } from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import type { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import type { ShadowWireProvider } from '@privacy-router-sdk/shadowwire';
import {
  OneClickApi,
  type SwapApiAsset,
  type SwapStateChangeEvent,
  SWAP_END_STATES,
} from '@privacy-router-sdk/near-intents';

type ProviderType = PrivacyCashProvider | ShadowWireProvider;

// Cross-chain deposit status
type CrossChainStatus =
  | { stage: 'idle' }
  | { stage: 'getting_quote' }
  | { stage: 'awaiting_deposit'; depositAddress: string; originAsset: SwapApiAsset }
  | { stage: 'processing'; status: string }
  | { stage: 'completed'; txHash?: string }
  | { stage: 'failed'; error: string };

interface FundFormProps {
  account: Account;
  provider: ProviderType | null;
  onSuccess: () => void;
  asset: string;
  decimals: number;
  availableAssets: string[];
  onAssetChange: (asset: string) => void;
  walletBalance: bigint;
  walletBalanceLoading?: boolean;
  formatUsdValue?: (symbol: string, amount: string) => string | null;
  nearIntentsTokens?: SwapApiAsset[];
}

// Helper to parse asset string - returns { symbol, chain } for cross-chain or { symbol, chain: 'sol' } for Solana
function parseAsset(asset: string): { symbol: string; chain: string } {
  if (asset.includes(':')) {
    const [symbol, chain] = asset.split(':');
    return { symbol, chain };
  }
  return { symbol: asset, chain: 'sol' };
}

// Helper to format asset for display
function formatAssetDisplay(asset: string): string {
  if (asset.includes(':')) {
    const [symbol, chain] = asset.split(':');
    return `${symbol} (${chain.toUpperCase()})`;
  }
  return asset;
}

export function FundForm({
  account,
  provider,
  onSuccess,
  asset,
  decimals,
  availableAssets,
  onAssetChange,
  walletBalance,
  walletBalanceLoading,
  formatUsdValue,
  nearIntentsTokens = [],
}: FundFormProps) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FundingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cross-chain deposit state
  const [crossChainStatus, setCrossChainStatus] = useState<CrossChainStatus>({ stage: 'idle' });
  const [originAddress, setOriginAddress] = useState('');

  // Check if current asset is cross-chain (non-Solana)
  const { symbol: assetSymbol, chain: assetChain } = parseAsset(asset);
  const isCrossChainAsset = assetChain !== 'sol';

  const toBaseUnits = (value: string): bigint => {
    const [whole = '0', decimal = ''] = value.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedDecimal);
  };

  const formatBalance = (amount: bigint): string => {
    const divisor = Math.pow(10, decimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  const handleCrossChainFund = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    if (!originAddress) {
      setError(`Please enter your ${assetChain.toUpperCase()} address for refunds`);
      return;
    }

    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;
    if (!jwtToken) {
      setError('NEAR Intents not configured');
      return;
    }

    // Find the origin asset (non-Solana)
    const originAsset = nearIntentsTokens.find(
      (t) => t.symbol === assetSymbol && t.blockchain === assetChain
    );

    if (!originAsset) {
      setError(`Origin asset not found: ${asset}`);
      return;
    }

    // Find the destination Solana asset
    const solanaAsset = nearIntentsTokens.find(
      (t) => t.symbol === assetSymbol && t.blockchain === 'sol'
    );

    if (!solanaAsset) {
      setError(`No Solana asset found for ${assetSymbol}`);
      return;
    }

    setLoading(true);
    setError(null);
    setCrossChainStatus({ stage: 'getting_quote' });

    try {
      const api = OneClickApi({ jwtToken });
      const solanaAddress = await account.getAddress();

      // Get quote
      const quoteResponse = await api.getQuote({
        dry: false,
        senderAddress: originAddress, // Origin chain address for refunds
        recipientAddress: solanaAddress, // Solana address for receiving
        originAsset: originAsset.assetId,
        destinationAsset: solanaAsset.assetId,
        amount: toBaseUnits(amount).toString(),
        slippageTolerance: 100, // 1% in basis points
      });

      const depositAddress = quoteResponse.quote?.depositAddress;
      if (!depositAddress) {
        throw new Error('No deposit address received');
      }

      setCrossChainStatus({
        stage: 'awaiting_deposit',
        depositAddress,
        originAsset,
      });

      // Start polling for status
      const handleStatusChange = (event: SwapStateChangeEvent) => {
        console.log('[FundForm] Cross-chain status:', event);

        if (event.status === 'QUOTE_RECEIVED' || event.status === 'DEPOSIT_SENT') {
          return;
        }

        if (SWAP_END_STATES.has(event.status)) {
          if (event.status === 'SUCCESS') {
            setCrossChainStatus({ stage: 'completed' });
            setLoading(false);
            onSuccess();
          } else {
            setCrossChainStatus({
              stage: 'failed',
              error: `Swap ${event.status.toLowerCase()}`,
            });
            setLoading(false);
          }
        } else {
          setCrossChainStatus({ stage: 'processing', status: event.status });
        }
      };

      // Poll for status in background
      api.pollStatus({
        depositAddress,
        maxAttempts: 120,
        pollingInterval: 5000,
        initialDelay: 1000,
        onStatusChange: handleStatusChange,
      }).catch((err) => {
        console.error('[FundForm] Polling error:', err);
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setCrossChainStatus({ stage: 'failed', error: errorMessage });
      setLoading(false);
    }
  };

  const handleFund = async () => {
    // If cross-chain asset, use cross-chain flow
    if (isCrossChainAsset) {
      return handleCrossChainFund();
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

    try {
      // Convert to base units
      const baseUnits = asset === 'SOL' ? account.assetToBaseUnits(amount) : toBaseUnits(amount);

      await provider.fund({
        sourceAccount: account,
        amount: baseUnits.toString(),
        onStatusChange: setStatus,
      });

      setAmount('');
      onSuccess();
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
        return 'Preparing transaction...';
      case 'depositing':
        return 'Depositing to privacy pool...';
      case 'confirming':
        return 'Confirming transaction...';
      case 'completed':
        return `Funding completed! TX: ${status.txHash?.slice(0, 8)}...`;
      case 'failed':
        return `Failed: ${status.error}`;
      default:
        return '';
    }
  };

  const getCrossChainStatusText = () => {
    switch (crossChainStatus.stage) {
      case 'getting_quote':
        return 'Getting quote...';
      case 'awaiting_deposit':
        return `Send ${assetSymbol} to the deposit address below`;
      case 'processing':
        return `Processing: ${crossChainStatus.status}`;
      case 'completed':
        return 'Cross-chain deposit completed!';
      case 'failed':
        return `Failed: ${crossChainStatus.error}`;
      default:
        return '';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={2}>
        Fund Privacy Pool
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Asset</InputLabel>
          <Select
            value={asset}
            label="Asset"
            onChange={(e) => {
              onAssetChange(e.target.value);
              setCrossChainStatus({ stage: 'idle' });
              setStatus(null);
              setError(null);
            }}
            disabled={loading}
          >
            {availableAssets.map((a) => (
              <MenuItem key={a} value={a}>
                {formatAssetDisplay(a)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Show wallet balance only for Solana assets */}
        {!isCrossChainAsset && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Wallet Balance
            </Typography>
            <Box display="flex" alignItems="baseline" gap={1}>
              <Typography variant="h6" fontWeight={600} color="primary">
                {walletBalanceLoading ? '...' : `${formatBalance(walletBalance)} ${asset}`}
              </Typography>
              {!walletBalanceLoading && formatUsdValue && (
                <Typography variant="body2" color="text.secondary">
                  {formatUsdValue(asset, formatBalance(walletBalance)) ?? ''}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Cross-chain info and origin address input */}
        {isCrossChainAsset && crossChainStatus.stage === 'idle' && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Deposit {assetSymbol} from {assetChain.toUpperCase()} to Solana via NEAR Intents
              </Typography>
            </Alert>
            <TextField
              fullWidth
              label={`Your ${assetChain.toUpperCase()} Address (for refunds)`}
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
              placeholder={assetChain === 'eth' ? '0x...' : 'Enter your address'}
              disabled={loading}
              sx={{ mb: 2 }}
              helperText="Required in case the deposit needs to be refunded"
            />
          </>
        )}

        {/* Cross-chain deposit address */}
        {crossChainStatus.stage === 'awaiting_deposit' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={500} mb={1}>
              Send {amount} {crossChainStatus.originAsset.symbol} on {crossChainStatus.originAsset.blockchain.toUpperCase()} to:
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
            >
              {crossChainStatus.depositAddress}
              <Tooltip title="Copy address">
                <IconButton
                  size="small"
                  onClick={() => copyToClipboard(crossChainStatus.depositAddress)}
                  sx={{ ml: 1 }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary" mt={1} display="block">
              Waiting for deposit... This page will update automatically.
            </Typography>
          </Alert>
        )}

        {/* Cross-chain status */}
        {crossChainStatus.stage !== 'idle' && crossChainStatus.stage !== 'awaiting_deposit' && (
          <Alert
            severity={
              crossChainStatus.stage === 'completed' ? 'success' :
              crossChainStatus.stage === 'failed' ? 'error' : 'info'
            }
            sx={{ mb: 2 }}
          >
            {getCrossChainStatusText()}
          </Alert>
        )}

        <TextField
          fullWidth
          label={`Amount (${formatAssetDisplay(asset)})`}
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

        {error && status?.stage !== 'failed' && crossChainStatus.stage !== 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && !isCrossChainAsset && (
          <Alert severity={getStatusColor()} sx={{ mb: 2 }}>
            {getStatusText()}
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => void handleFund()}
          disabled={loading || !amount || (!provider && !isCrossChainAsset) || (isCrossChainAsset && !originAddress)}
          sx={{
            py: 1.5,
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
            },
          }}
        >
          {loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : isCrossChainAsset ? (
            `Deposit ${assetSymbol} from ${assetChain.toUpperCase()}`
          ) : (
            `Fund ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
