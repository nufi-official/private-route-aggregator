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
  ListSubheader,
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
        senderAddress: originAddress, // Origin chain address for refunds
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
                Swap {assetSymbol} from {assetChain.toUpperCase()} → SOL on Solana via NEAR Intents.
                The SOL will be deposited to your wallet for funding the privacy pool.
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
        {(crossChainStatus.stage === 'awaiting_deposit' || crossChainStatus.stage === 'processing') && 'depositAddress' in crossChainStatus && (
          <Alert severity={crossChainStatus.stage === 'processing' ? 'info' : 'warning'} sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={500} mb={1}>
              {crossChainStatus.stage === 'processing'
                ? `Processing swap: ${crossChainStatus.status}`
                : `Send ${amount} ${(crossChainStatus as { originAsset: SwapApiAsset }).originAsset.symbol} on ${(crossChainStatus as { originAsset: SwapApiAsset }).originAsset.blockchain.toUpperCase()} to this address:`
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
