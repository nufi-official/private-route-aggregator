import { useState, useEffect } from 'react';
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
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
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
  | { stage: 'completed'; depositAddress: string; amountIn: string; amountOut: string; originSymbol: string; txHash?: string }
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
  onProgressVisibleChange?: (visible: boolean) => void;
}

// Helper to parse asset string - returns { symbol, chain } for cross-chain or { symbol, chain: 'sol' } for Solana
function parseAsset(asset: string): { symbol: string; chain: string } {
  if (asset.includes(':')) {
    const [symbol, chain] = asset.split(':');
    return { symbol: symbol ?? asset, chain: chain ?? 'sol' };
  }
  return { symbol: asset, chain: 'sol' };
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
  onProgressVisibleChange,
}: FundFormProps) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FundingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const [fundingStage, setFundingStage] = useState<'idle' | 'signing' | 'submitting'>('idle');

  // Cross-chain deposit state
  const [crossChainStatus, setCrossChainStatus] = useState<CrossChainStatus>({ stage: 'idle' });
  const [originAddress, setOriginAddress] = useState('');

  // Track progress visibility for animation
  const [progressVisible, setProgressVisible] = useState(false);

  // Show/hide progress stepper
  useEffect(() => {
    const showProgress = crossChainStatus.stage !== 'idle' && crossChainStatus.stage !== 'failed';
    setProgressVisible(showProgress);
    onProgressVisibleChange?.(showProgress);
  }, [crossChainStatus.stage, onProgressVisibleChange]);

  // Check if current asset needs swapping to SOL
  const { symbol: assetSymbol, chain: assetChain } = parseAsset(asset);
  const isCrossChainAsset = assetChain !== 'sol'; // Non-Solana chain
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

  // Mock swap flow for testing - simulates the entire swap process
  const handleMockSwapToSol = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    setLoading(true);
    setError(null);

    // Find or create a mock origin asset
    const mockOriginAsset: SwapApiAsset = nearIntentsTokens.find(
      (t) => t.symbol === assetSymbol && t.blockchain === assetChain
    ) ?? {
      assetId: `mock-${assetSymbol}-${assetChain}`,
      symbol: assetSymbol,
      blockchain: assetChain,
      decimals: decimals,
      price: 0,
      priceUpdatedAt: new Date().toISOString(),
      contractAddress: '0x0000000000000000000000000000000000000000',
    };

    const mockDepositAddress = assetChain === 'eth' || assetChain === 'base' || assetChain === 'arb'
      ? '0x742d35Cc6634C0532925a3b844Bc9e7595f8bE2E'
      : assetChain === 'btc'
        ? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
        : 'mock-deposit-address-' + Math.random().toString(36).substring(7);

    // Real NEAR Intents statuses from SWAP_HAPPY_PATH_TIMELINE
    const mockStatuses = [
      'PENDING_DEPOSIT',
      'KNOWN_DEPOSIT_TX',
      'PROCESSING',
    ];

    // Stage 1: Getting quote (5 seconds)
    setCrossChainStatus({ stage: 'getting_quote' });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Stage 2: Awaiting deposit (5 seconds)
    setCrossChainStatus({
      stage: 'awaiting_deposit',
      depositAddress: mockDepositAddress,
      originAsset: mockOriginAsset,
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Stage 3-5: Processing through various statuses (5 seconds each)
    for (const mockStatus of mockStatuses) {
      setCrossChainStatus({
        stage: 'processing',
        status: mockStatus,
        depositAddress: mockDepositAddress,
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Stage 6: Completed - keep form as-is, ready for user to click again to fund SOL
    // Mock: calculate a fake SOL output (roughly 1 SOL per $150 worth)
    const mockSolOutput = (parseFloat(amount) * 0.8).toFixed(4); // Mock conversion rate
    setCrossChainStatus({
      stage: 'completed',
      depositAddress: mockDepositAddress,
      amountIn: amount,
      amountOut: mockSolOutput,
      originSymbol: assetSymbol,
    });
    setLoading(false);
    // Don't reset - user will click again to fund the SOL they received
  };

  const handleSwapToSol = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    // For cross-chain assets, require refund address
    // For Solana tokens, use the user's Solana address
    const refundAddress = isCrossChainAsset ? originAddress : await account?.getAddress();

    if (isCrossChainAsset && !originAddress) {
      setError(`Please enter your ${assetChain.toUpperCase()} address for refunds`);
      return;
    }

    // TODO: Revert to real API later - always use mock for now
    return handleMockSwapToSol();

    /* eslint-disable @typescript-eslint/no-unreachable */
    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;

    // Use mock mode if no JWT token configured
    if (!jwtToken) {
      return handleMockSwapToSol();
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
      const solanaAddress = await account?.getAddress();

      if (!refundAddress || !solanaAddress) {
        throw new Error('Missing address');
      }

      // Get quote: swap from origin asset to SOL
      const quoteResponse = await api.getQuote({
        dry: false,
        senderAddress: refundAddress!, // Address for refunds (origin chain or Solana)
        recipientAddress: solanaAddress!, // Solana address for receiving SOL
        originAsset: originAsset!.assetId,
        destinationAsset: solAsset!.assetId, // Always swap to SOL
        amount: toBaseUnits(amount).toString(),
        slippageTolerance: 100, // 1% in basis points
      });

      const depositAddress = quoteResponse.quote?.depositAddress;
      if (!depositAddress) {
        throw new Error('No deposit address received');
      }

      setCrossChainStatus({
        stage: 'awaiting_deposit',
        depositAddress: depositAddress!,
        originAsset: originAsset!,
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
            // TODO: Get actual amounts from API response
            setCrossChainStatus({
              stage: 'completed',
              depositAddress: depositAddress!,
              amountIn: amount,
              amountOut: '0', // Would come from API
              originSymbol: assetSymbol,
            });
            setLoading(false);
          } else {
            setCrossChainStatus({
              stage: 'failed',
              error: `Swap ${event.status.toLowerCase()}`,
            });
            setLoading(false);
          }
        } else {
          // Keep deposit address visible during processing
          setCrossChainStatus({ stage: 'processing', status: event.status, depositAddress: depositAddress! });
        }
      };

      // Poll for status in background
      api.pollStatus({
        depositAddress: depositAddress!,
        maxAttempts: 120,
        pollingInterval: 5000,
        initialDelay: 1000,
        onStatusChange: handleStatusChange,
      }).catch((pollErr: unknown) => {
        console.error('[FundForm] Polling error:', pollErr);
      });

    } catch (e) {
      const error = e as Error | undefined;
      const errorMessage = error?.message ?? 'Unknown error';
      setError(errorMessage);
      setCrossChainStatus({ stage: 'failed', error: errorMessage });
      setLoading(false);
    }
    /* eslint-enable @typescript-eslint/no-unreachable */
  };

  // Fund SOL to privacy pool (after swap completed)
  const handleFundSolAfterSwap = async () => {
    if (!provider) {
      setError('Provider not initialized');
      return;
    }
    if (!account) {
      setError('Account not connected');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus({ stage: 'preparing' });
    setFundingStage('signing');

    try {
      // Use the wallet's SOL balance - fund all available SOL
      // In real implementation, we'd know the exact amount from the swap
      const solBalance = await account.getBalance();
      // Leave some SOL for fees (0.01 SOL)
      const amountToFund = solBalance - BigInt(10_000_000);

      if (amountToFund <= 0) {
        throw new Error('Insufficient SOL balance after swap');
      }

      await provider.fund({
        sourceAccount: account,
        amount: amountToFund.toString(),
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
          // Only move to submitting stage when confirming (tx is on-chain, so signature is done)
          if (newStatus.stage === 'confirming' || newStatus.stage === 'completed') {
            setFundingStage('submitting');
          }
        },
      });

      // Reset everything after successful funding
      setAmount('');
      setOriginAddress('');
      setCrossChainStatus({ stage: 'idle' });
      setFundingStage('idle');
      onAssetChange('SOL');
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus({ stage: 'failed', error: errorMessage });
      setFundingStage('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleFund = async () => {
    // If swap already completed, fund the SOL to privacy pool
    if (crossChainStatus.stage === 'completed') {
      return handleFundSolAfterSwap();
    }

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
    if (!account) {
      setError('Account not connected');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus({ stage: 'preparing' });

    try {
      // Convert to base units
      const baseUnits = asset === 'SOL' ? account?.assetToBaseUnits(amount) : toBaseUnits(amount);

      await provider.fund({
        sourceAccount: account,
        amount: baseUnits?.toString() ?? '0',
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
        return 'Swap complete! Click the button below to fund the privacy pool.';
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
      <Box display="flex" alignItems="center" gap={1} mb={3} mt={0}>
        <ArrowDownwardIcon sx={{ color: '#14F195', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={600}>
          Deposit
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
              disabled={loading || crossChainStatus.stage === 'completed'}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '36px',
                fontWeight: 600,
                color: crossChainStatus.stage === 'completed' ? 'rgba(255,255,255,0.5)' : '#ffffff',
                width: '100%',
                fontFamily: 'inherit',
              }}
            />
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {amount && formatUsdValue ? (formatUsdValue(assetSymbol, amount) ?? '$0') : '$0'}
              </Typography>
              {/* Only show MAX for native SOL where we know the wallet balance */}
              {asset === 'SOL' && (
                <Typography
                  variant="body2"
                  onClick={() => !loading && crossChainStatus.stage !== 'completed' && setAmount(formatBalance(walletBalance))}
                  sx={{
                    color: 'rgba(255,255,255,0.5)',
                    cursor: loading || crossChainStatus.stage === 'completed' ? 'default' : 'pointer',
                    mr: 1,
                    '&:hover': {
                      color: loading || crossChainStatus.stage === 'completed' ? 'rgba(255,255,255,0.5)' : 'primary.main',
                    },
                  }}
                >
                  MAX: {walletBalanceLoading ? '...' : `${formatBalance(walletBalance)} ${assetSymbol}`}
                </Typography>
              )}
            </Box>
          </Box>
          <Box
            onClick={() => !loading && crossChainStatus.stage !== 'completed' && setTokenSelectorOpen(true)}
            sx={{
              position: 'absolute',
              right: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: loading || crossChainStatus.stage === 'completed' ? 'default' : 'pointer',
              opacity: loading || crossChainStatus.stage === 'completed' ? 0.5 : 1,
              '&:hover': {
                opacity: loading || crossChainStatus.stage === 'completed' ? 0.5 : 0.8,
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
        {needsSwapToSol && crossChainStatus.stage !== 'failed' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Swap & Fund</strong> — 2-step process: You will need to send {assetSymbol} to be swapped to SOL. Then, the SOL will need to be deposited to your private balance.
            </Typography>
          </Alert>
        )}

        {/* Refund address for cross-chain assets - stays visible throughout the process */}
        {isCrossChainAsset && needsSwapToSol && (
          <TextField
            fullWidth
            label={`Your ${assetChain.toUpperCase()} Address (for refunds)`}
            value={originAddress}
            onChange={(e) => setOriginAddress(e.target.value)}
            placeholder={assetChain === 'eth' || assetChain === 'base' || assetChain === 'arb' ? '0x...' : 'Enter your address'}
            disabled={loading || crossChainStatus.stage === 'completed'}
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
                '&.Mui-disabled fieldset': {
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
            helperText="Required in case the deposit needs to be refunded"
          />
        )}

        {/* Cross-chain status for failed */}
        {crossChainStatus.stage === 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
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

        {/* Swap progress stepper - animates in when swap starts */}
        {(crossChainStatus.stage !== 'idle' && crossChainStatus.stage !== 'failed') && (
          <>
            <Box
              sx={{
                width: '100%',
                borderRadius: '32px',
                background: 'linear-gradient(135deg, rgba(20, 241, 149, 0.05) 0%, rgba(153, 69, 255, 0.05) 100%)',
                border: progressVisible ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                px: 4,
                py: progressVisible ? 3 : 0,
                maxHeight: progressVisible ? '600px' : '0px',
                opacity: progressVisible ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 1s ease-out, opacity 0.5s ease-out, padding 1s ease-out, border 0.5s ease-out',
              }}
            >
            {/* Step 1: Deposit address */}
            <Box display="flex" alignItems="flex-start" gap={2} sx={{ minHeight: 56, position: 'relative' }}>
              {/* Connector line - behind circle */}
              <Box sx={{ position: 'absolute', left: 10, top: 30, width: 2, height: 'calc(100% + 8px)', bgcolor: (crossChainStatus.stage === 'getting_quote' || crossChainStatus.stage === 'awaiting_deposit') ? 'rgba(255,255,255,0.3)' : '#14F195', zIndex: 0 }} />
              <Box sx={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d0d0d', borderRadius: '50%', zIndex: 1, mt: '8px' }}>
                {(crossChainStatus.stage === 'getting_quote' || crossChainStatus.stage === 'awaiting_deposit') ? (
                  <CircularProgress size={18} sx={{ color: '#14F195' }} />
                ) : (
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#14F195', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: '12px', color: '#000' }}>✓</Typography>
                  </Box>
                )}
              </Box>
              <Box flex={1} sx={{ pt: 1 }}>
                {crossChainStatus.stage === 'getting_quote' ? (
                  <Typography sx={{ color: '#fff', fontWeight: 600 }}>
                    Getting deposit address
                  </Typography>
                ) : (
                  <>
                    <Typography sx={{
                      color: crossChainStatus.stage === 'awaiting_deposit' ? '#fff' : '#14F195',
                      fontWeight: crossChainStatus.stage === 'awaiting_deposit' ? 600 : 400
                    }}>
                      Send {amount} {assetSymbol} to
                    </Typography>
                    <Box
                      sx={{
                        bgcolor: 'rgba(0,0,0,0.3)',
                        p: 1.5,
                        borderRadius: '12px',
                        mt: 1,
                      }}
                    >
                      <Box display="flex" alignItems="center">
                        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', flex: 1, color: '#fff', minHeight: '2.4em' }}>
                          {'depositAddress' in crossChainStatus ? crossChainStatus.depositAddress : ''}
                        </Typography>
                        {'depositAddress' in crossChainStatus && (
                          <Tooltip title="Copy address">
                            <IconButton size="small" onClick={() => copyToClipboard(crossChainStatus.depositAddress)} sx={{ ml: 1, color: '#14F195' }}>
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            {/* Step 2: Swap progress */}
            <Box display="flex" alignItems="center" gap={2} sx={{ height: 56, position: 'relative' }}>
              {/* Connector line - behind circle */}
              <Box sx={{ position: 'absolute', left: 10, top: 37, width: 2, height: 38, bgcolor: crossChainStatus.stage === 'completed' ? '#14F195' : 'rgba(255,255,255,0.3)', zIndex: 0 }} />
              <Box sx={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d0d0d', borderRadius: '50%', zIndex: 1 }}>
                {(crossChainStatus.stage === 'getting_quote' || crossChainStatus.stage === 'awaiting_deposit') ? (
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.3)' }} />
                ) : crossChainStatus.stage === 'processing' ? (
                  <CircularProgress size={18} sx={{ color: '#14F195' }} />
                ) : (
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#14F195', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: '12px', color: '#000' }}>✓</Typography>
                  </Box>
                )}
              </Box>
              <Box flex={1} display="flex" alignItems="center" justifyContent="space-between">
                <Typography sx={{
                  color: (crossChainStatus.stage === 'getting_quote' || crossChainStatus.stage === 'awaiting_deposit') ? 'rgba(255,255,255,0.3)' : crossChainStatus.stage === 'processing' ? '#fff' : '#14F195',
                  fontWeight: (crossChainStatus.stage === 'processing' || crossChainStatus.stage === 'completed') ? 600 : 400
                }}>
                  {crossChainStatus.stage === 'completed'
                    ? `Swapped ${crossChainStatus.amountIn} ${crossChainStatus.originSymbol} to ${crossChainStatus.amountOut} SOL`
                    : crossChainStatus.stage === 'processing'
                      ? `Processing: ${crossChainStatus.status}`
                      : 'Processing swap'}
                </Typography>
                {(crossChainStatus.stage === 'processing' || crossChainStatus.stage === 'completed') && 'depositAddress' in crossChainStatus && (
                  <Typography
                    component="a"
                    href={`https://explorer.defuse.org/intents/${crossChainStatus.depositAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ fontSize: '0.75rem', color: '#14F195', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, flexShrink: 0, ml: 1 }}
                  >
                    View on Explorer →
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Step 3: Fund to Privacy Pool button */}
            <Box display="flex" alignItems="center" gap={2} sx={{ height: 56, position: 'relative' }}>
              <Box sx={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d0d0d', borderRadius: '50%', zIndex: 1 }}>
                {crossChainStatus.stage === 'completed' && loading ? (
                  <CircularProgress size={18} sx={{ color: '#14F195' }} />
                ) : (
                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.3)' }} />
                )}
              </Box>
              {crossChainStatus.stage === 'completed' && loading ? (
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>
                  {fundingStage === 'submitting'
                    ? 'Submitting to private balance...'
                    : 'Waiting for signature...'}
                </Typography>
              ) : (
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={() => void handleFund()}
                  disabled={crossChainStatus.stage !== 'completed' || loading}
                  sx={{
                    py: 1.25,
                    borderRadius: '32px',
                    background: '#14F195',
                    color: '#000',
                    fontWeight: 600,
                    '&:hover': {
                      background: '#12D986',
                    },
                    '&.Mui-disabled': {
                      background: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.3)',
                    },
                  }}
                >
                  Fund to Private Balance
                </Button>
              )}
            </Box>
          </Box>
          </>
        )}

        {(crossChainStatus.stage === 'idle' || crossChainStatus.stage === 'failed') && (
          /* Button - shown when idle */
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
            disabled={account ? (loading || (!amount || (!provider && !needsSwapToSol) || (isCrossChainAsset && !originAddress))) : false}
            sx={{
              py: 1.5,
              borderRadius: '32px',
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
                ? `Get ${assetSymbol} deposit address`
                : `Swap ${assetSymbol} → SOL`
            ) : (
              `Fund ${asset}`
            )}
          </Button>
        )}
      </Box>
    </Paper>
  );
}
