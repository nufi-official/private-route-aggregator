import { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { TokenSelector } from './TokenSelector';
import { getAssetIcon } from '../utils/tokenIcons';
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

// Get display name for an asset (just the symbol, without chain suffix)
function getAssetDisplayName(asset: string): string {
  if (asset.includes(':')) {
    return asset.split(':')[0] ?? asset;
  }
  return asset;
}

// Cross-chain deposit status
type CrossChainStatus =
  | { stage: 'idle' }
  | { stage: 'getting_quote' }
  | { stage: 'awaiting_deposit'; depositAddress: string; originAsset: SwapApiAsset }
  | { stage: 'processing'; status: string; depositAddress: string }
  | { stage: 'completed'; txHash?: string }
  | { stage: 'failed'; error: string };

interface FundFormProps {
  account: Account | null;
  provider: ProviderType | null;
  onSuccess: () => void;
  asset: string;
  decimals: number;
  availableAssets: string[];
  onAssetChange: (asset: string) => void;
  formatUsdValue?: (symbol: string, amount: string) => string | null;
  nearIntentsTokens?: SwapApiAsset[];
  onConnectClick?: () => void;
  walletBalance?: bigint;
  walletBalanceLoading?: boolean;
}

// Helper to parse asset string - returns { symbol, chain } for cross-chain or { symbol, chain: 'sol' } for Solana
function parseAsset(asset: string): { symbol: string; chain: string } {
  if (asset.includes(':')) {
    const [symbol = '', chain = 'sol'] = asset.split(':');
    return { symbol, chain };
  }
  return { symbol: asset, chain: 'sol' };
}

// Helper to format asset for display
function formatAssetDisplay(asset: string): string {
  if (asset.includes(':')) {
    const [symbol = '', chain = ''] = asset.split(':');
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
  formatUsdValue,
  nearIntentsTokens = [],
  onConnectClick,
  walletBalance = 0n,
  walletBalanceLoading = false,
}: FundFormProps) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FundingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);

  // Cross-chain deposit state
  const [crossChainStatus, setCrossChainStatus] = useState<CrossChainStatus>({ stage: 'idle' });
  const [originAddress, setOriginAddress] = useState('');

  // Check if current asset needs swapping to SOL
  const { symbol: assetSymbol, chain: assetChain } = parseAsset(asset);
  const isCrossChainAsset = assetChain !== 'sol'; // Non-Solana chain
  const isSolanaToken = assetChain === 'sol' && asset !== 'SOL'; // Solana SPL token (not SOL)
  const needsSwapToSol = asset !== 'SOL'; // Any non-SOL asset needs swap

  const toBaseUnits = (value: string): bigint => {
    const [whole = '0', decimal = ''] = value.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedDecimal);
  };

  const formatBalance = (amount: bigint): string => {
    const divisor = Math.pow(10, decimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  const handleSwapToSol = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    // For cross-chain assets, require refund address
    // For Solana tokens, use the user's Solana address
    const refundAddress = isCrossChainAsset ? originAddress : await account.getAddress();

    if (isCrossChainAsset && !originAddress) {
      setError(`Please enter your ${assetChain.toUpperCase()} address for refunds`);
      return;
    }

    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;
    if (!jwtToken) {
      setError('NEAR Intents not configured');
      return;
    }

    // Find the origin asset
    const originAsset = nearIntentsTokens.find(
      (t) => t.symbol === assetSymbol && t.blockchain === assetChain
    );

    if (!originAsset) {
      setError(`Origin asset not found: ${asset}`);
      return;
    }

    // Find SOL on Solana as destination (always swap to SOL for funding)
    const solAsset = nearIntentsTokens.find(
      (t) => t.symbol === 'SOL' && t.blockchain === 'sol'
    );

    if (!solAsset) {
      setError('SOL asset not found');
      return;
    }

    setLoading(true);
    setError(null);
    setCrossChainStatus({ stage: 'getting_quote' });

    try {
      const api = OneClickApi({ jwtToken });
      const solanaAddress = await account.getAddress();

      // Get quote: swap from origin asset to SOL
      const quoteResponse = await api.getQuote({
        dry: false,
        senderAddress: refundAddress, // Address for refunds (origin chain or Solana)
        recipientAddress: solanaAddress, // Solana address for receiving SOL
        originAsset: originAsset.assetId,
        destinationAsset: solAsset.assetId, // Always swap to SOL
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
        // eslint-disable-next-line no-console
        console.log('[FundForm] Cross-chain status:', event);

        if (event.status === 'QUOTE_RECEIVED' || event.status === 'DEPOSIT_SENT') {
          return;
        }

        if (SWAP_END_STATES.has(event.status)) {
          if (event.status === 'SUCCESS') {
            setCrossChainStatus({ stage: 'completed' });
            setLoading(false);
            setAmount('');
            setOriginAddress('');
            // Switch to SOL asset and refresh balance
            onAssetChange('SOL');
            onSuccess();
          } else {
            setCrossChainStatus({
              stage: 'failed',
              error: `Swap ${event.status.toLowerCase()}`,
            });
            setLoading(false);
          }
        } else {
          // Keep deposit address visible during processing
          setCrossChainStatus({ stage: 'processing', status: event.status, depositAddress });
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
    // If not SOL, use NEAR Intents to swap to SOL first
    if (needsSwapToSol) {
      return handleSwapToSol();
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
                variant="caption"
                onClick={() => !loading && setAmount(formatBalance(walletBalance))}
                sx={{
                  color: 'rgba(255,255,255,0.3)',
                  cursor: loading ? 'default' : 'pointer',
                  mr: 1,
                  '&:hover': {
                    color: loading ? 'rgba(255,255,255,0.3)' : 'primary.main',
                  },
                }}
              >
                MAX: {walletBalanceLoading ? '...' : `${formatBalance(walletBalance)} ${assetSymbol}`}
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
          onSelect={(newAsset) => {
            onAssetChange(newAsset);
            setCrossChainStatus({ stage: 'idle' });
            setStatus(null);
            setError(null);
          }}
          availableAssets={availableAssets}
          currentAsset={asset}
        />

        {/* Swap info for non-SOL assets */}
        {needsSwapToSol && crossChainStatus.stage === 'idle' && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {isCrossChainAsset
                  ? `Swap ${assetSymbol} from ${assetChain.toUpperCase()} → SOL on Solana via NEAR Intents.`
                  : `Swap ${assetSymbol} → SOL on Solana via NEAR Intents.`
                }
                {' '}The SOL will be deposited to your wallet for funding the privacy pool.
              </Typography>
            </Alert>
            {/* Only show refund address for cross-chain assets */}
            {isCrossChainAsset && (
              <TextField
                fullWidth
                label={`Your ${assetChain.toUpperCase()} Address (for refunds)`}
                value={originAddress}
                onChange={(e) => setOriginAddress(e.target.value)}
                placeholder={assetChain === 'eth' || assetChain === 'base' || assetChain === 'arb' ? '0x...' : 'Enter your address'}
                disabled={loading}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#000000',
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
                }}
                helperText="Required in case the deposit needs to be refunded"
              />
            )}
          </>
        )}

        {/* Cross-chain deposit address */}
        {(crossChainStatus.stage === 'awaiting_deposit' || crossChainStatus.stage === 'processing') && 'depositAddress' in crossChainStatus && (
          <Alert severity={crossChainStatus.stage === 'processing' ? 'info' : 'warning'} sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={500} mb={1}>
              {crossChainStatus.stage === 'processing'
                ? `Processing swap: ${crossChainStatus.status}`
                : isCrossChainAsset
                  ? `Send ${amount} ${(crossChainStatus as { originAsset: SwapApiAsset }).originAsset.symbol} on ${(crossChainStatus as { originAsset: SwapApiAsset }).originAsset.blockchain.toUpperCase()} to this address:`
                  : `Send ${amount} ${(crossChainStatus as { originAsset: SwapApiAsset }).originAsset.symbol} to this Solana address:`
              }
            </Typography>
            <Typography variant="caption" color="text.secondary" mb={1} display="block">
              You will receive SOL on Solana after the swap completes.
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
              {crossChainStatus.stage === 'processing'
                ? 'Swap in progress... This page will update automatically.'
                : 'Waiting for deposit... This page will update automatically.'
              }
            </Typography>
          </Alert>
        )}

        {/* Cross-chain status (only show for completed/failed, processing is shown with deposit address) */}
        {(crossChainStatus.stage === 'completed' || crossChainStatus.stage === 'failed' || crossChainStatus.stage === 'getting_quote') && (
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

        {error && status?.stage !== 'failed' && crossChainStatus.stage !== 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && !needsSwapToSol && (
          <Alert severity={getStatusColor()} sx={{ mb: 2 }}>
            {getStatusText()}
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
              void handleFund();
            }
          }}
          disabled={account ? (loading || !amount || (!provider && !needsSwapToSol) || (isCrossChainAsset && !originAddress)) : false}
          sx={{
            py: 1.5,
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
            },
          }}
        >
          {!account ? (
            'Connect Wallet'
          ) : loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : needsSwapToSol ? (
            isCrossChainAsset
              ? `Deposit ${assetSymbol} from ${assetChain.toUpperCase()}`
              : `Swap ${assetSymbol} → SOL`
          ) : (
            `Fund ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
