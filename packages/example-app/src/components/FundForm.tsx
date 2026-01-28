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
import type { FundingStatus } from '@privacy-router-sdk/private-routers-core';
import type { Account } from '@privacy-router-sdk/signers-core';
import type { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import type { ShadowWireProvider } from '@privacy-router-sdk/shadowwire';

type ProviderType = PrivacyCashProvider | ShadowWireProvider;

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
}: FundFormProps) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FundingStatus | null>(null);
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

  const handleFund = async () => {
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
            Wallet Balance
          </Typography>
          <Typography variant="h6" fontWeight={600} color="primary">
            {walletBalanceLoading ? '...' : `${formatBalance(walletBalance)} ${asset}`}
          </Typography>
        </Box>

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
          onClick={() => void handleFund()}
          disabled={loading || !amount || !provider}
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
          ) : (
            `Fund ${asset}`
          )}
        </Button>
      </Box>
    </Paper>
  );
}
