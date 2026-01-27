import { useState, useEffect } from 'react';
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
import type { CrossChainFundingStatus, SwapApiAsset } from '@privacy-router-sdk/privacy-aggregator';
import type { PrivacyAggregatorProvider } from '@privacy-router-sdk/privacy-aggregator';

interface CrossChainFundFormProps {
  provider: PrivacyAggregatorProvider | null;
  senderAddress: string;
  onSuccess: () => void;
}

export function CrossChainFundForm({
  provider,
  senderAddress,
  onSuccess,
}: CrossChainFundFormProps) {
  const [amount, setAmount] = useState('');
  const [sourceAsset, setSourceAsset] = useState('');
  const [availableAssets, setAvailableAssets] = useState<SwapApiAsset[]>([]);
  const [status, setStatus] = useState<CrossChainFundingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);

  // Load available assets on mount
  useEffect(() => {
    if (!provider) return;

    const loadAssets = async () => {
      setAssetsLoading(true);
      try {
        const assets = await provider.getAvailableSourceAssets();
        // Filter to show useful assets (exclude Solana native since that's direct)
        const filteredAssets = assets.filter(
          (a) => a.blockchain !== 'solana' || a.symbol !== 'SOL'
        );
        setAvailableAssets(filteredAssets);
        if (filteredAssets.length > 0 && filteredAssets[0]) {
          setSourceAsset(filteredAssets[0].assetId);
        }
      } catch (err) {
        console.error('Failed to load assets:', err);
      } finally {
        setAssetsLoading(false);
      }
    };

    loadAssets();
  }, [provider]);

  const handleFund = async () => {
    if (!amount || !sourceAsset) {
      setError('Please enter an amount and select a source asset');
      return;
    }
    if (!provider) {
      setError('Provider not initialized');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus({ stage: 'preparing' });
    setDepositAddress(null);

    try {
      // Find the selected asset to get decimals
      const asset = availableAssets.find((a) => a.assetId === sourceAsset);
      if (!asset) {
        throw new Error('Selected asset not found');
      }

      // Convert amount to base units
      const amountFloat = parseFloat(amount);
      const baseUnits = Math.floor(amountFloat * Math.pow(10, asset.decimals));

      await provider.fundCrossChain({
        sourceAsset,
        amount: baseUnits.toString(),
        senderAddress,
        sendDeposit: async ({ address }) => {
          // This is where the user would send the deposit on the source chain
          // For now, we show the deposit address and wait for manual deposit
          setDepositAddress(address);

          // In a real implementation, this would trigger the wallet to sign
          // and send the transaction on the source chain
          // For demo, we'll prompt the user to send manually
          throw new Error(
            `Please send ${amount} ${asset.symbol} to ${address} on ${asset.blockchain}`
          );
        },
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
          if (newStatus.stage === 'awaiting_deposit') {
            setDepositAddress(newStatus.depositAddress);
          }
        },
      });

      setAmount('');
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      // Don't show as error if it's the deposit instruction
      if (errorMessage.includes('Please send')) {
        setStatus({ stage: 'awaiting_deposit', depositAddress: depositAddress || '' });
      } else {
        setError(errorMessage);
        setStatus({ stage: 'failed', error: errorMessage });
      }
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
      case 'awaiting_deposit':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getStatusText = () => {
    if (!status) return '';
    switch (status.stage) {
      case 'preparing':
        return 'Preparing cross-chain swap...';
      case 'getting_quote':
        return `Getting quote: ${status.sourceAsset} → ${status.destinationAsset}`;
      case 'awaiting_deposit':
        return `Awaiting deposit to: ${status.depositAddress.slice(0, 8)}...`;
      case 'deposit_sent':
        return `Deposit sent! TX: ${status.txHash.slice(0, 8)}...`;
      case 'swapping':
        return `Swapping... (${status.status})`;
      case 'swap_completed':
        return 'Swap completed! Depositing to privacy pool...';
      case 'depositing_to_pool':
        return 'Depositing to privacy pool...';
      case 'completed':
        return `Completed! TX: ${status.txHash.slice(0, 8)}...`;
      case 'failed':
        return `Failed: ${status.error}`;
      default:
        return '';
    }
  };

  const selectedAsset = availableAssets.find((a) => a.assetId === sourceAsset);

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Cross-Chain Fund
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Swap any asset to SOL and deposit to privacy pool via NEAR Intents
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Source Asset</InputLabel>
          <Select
            value={sourceAsset}
            label="Source Asset"
            onChange={(e) => setSourceAsset(e.target.value)}
            disabled={loading || assetsLoading}
          >
            {assetsLoading ? (
              <MenuItem value="">Loading assets...</MenuItem>
            ) : (
              availableAssets.map((asset) => (
                <MenuItem key={asset.assetId} value={asset.assetId}>
                  {asset.symbol} ({asset.blockchain})
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label={`Amount (${selectedAsset?.symbol || 'Select asset'})`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={loading || !sourceAsset}
          sx={{ mb: 3 }}
          slotProps={{
            input: {
              inputProps: { min: 0, step: 0.001 },
            },
          }}
        />

        {depositAddress && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              Send your deposit to:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                mt: 1,
              }}
            >
              {depositAddress}
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && !error && (
          <Alert severity={getStatusColor()} sx={{ mb: 2 }}>
            {getStatusText()}
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleFund}
          disabled={loading || !amount || !sourceAsset || !provider}
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
          ) : (
            'Get Deposit Address'
          )}
        </Button>
      </Box>
    </Paper>
  );
}
