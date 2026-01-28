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

type ProviderType = PrivacyCashProvider | ShadowWireProvider;

interface WithdrawFormProps {
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
}

export function WithdrawForm({
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
}: WithdrawFormProps) {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<WithdrawStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toBaseUnits = (value: string): bigint => {
    const [whole = '0', decimal = ''] = value.split('.');
    const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedDecimal);
  };

  const formatBalance = (amount: bigint): string => {
    const divisor = Math.pow(10, decimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  const handleWithdraw = async () => {
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

    try {
      // Convert to base units
      const baseUnits = asset === 'SOL' ? account.assetToBaseUnits(amount) : toBaseUnits(amount);

      await provider.withdraw({
        destination: { address: destinationAddress },
        amount: baseUnits.toString(),
        onStatusChange: setStatus,
      });

      setAmount('');
      setDestinationAddress('');
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
        return 'Preparing withdrawal...';
      case 'processing':
        return 'Processing through privacy pool...';
      case 'confirming':
        return 'Confirming transaction...';
      case 'completed':
        return `Withdrawal completed! TX: ${status.txHash?.slice(0, 8)}...`;
      case 'failed':
        return `Failed: ${status.error}`;
      default:
        return '';
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={2}>
        Withdraw
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
          <Box display="flex" alignItems="baseline" gap={1}>
            <Typography variant="h6" fontWeight={600} color="secondary">
              {privateBalanceLoading ? '...' : `${formatBalance(privateBalance)} ${asset}`}
            </Typography>
            {!privateBalanceLoading && formatUsdValue && (
              <Typography variant="body2" color="text.secondary">
                {formatUsdValue(asset, formatBalance(privateBalance)) ?? ''}
              </Typography>
            )}
          </Box>
        </Box>

        <TextField
          fullWidth
          label="Destination Address"
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder="Enter Solana address"
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
          helperText={amount && formatUsdValue ? formatUsdValue(asset, amount) : undefined}
        />

        {error && status?.stage !== 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && (
          <Alert severity={getStatusColor()} sx={{ mb: 2 }}>
            {getStatusText()}
          </Alert>
        )}

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => void handleWithdraw()}
          disabled={loading || !destinationAddress || !amount || !provider}
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
            `Withdraw ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
