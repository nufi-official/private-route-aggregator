import { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import type { FundingStatus } from '@privacy-router-sdk/private-routers-core';

export function FundForm() {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FundingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFund = async () => {
    if (!amount) {
      setError('Please enter an amount');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus({ stage: 'preparing' });

    try {
      // TODO: Implement actual funding logic
      // This would use the PrivacyCashProvider or other provider
      setStatus({ stage: 'depositing' });

      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setStatus({ stage: 'completed', txHash: 'demo_tx_hash' });
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
        return 'Funding completed!';
      case 'failed':
        return `Failed: ${status.error}`;
      default:
        return '';
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Fund Privacy Pool
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <TextField
          fullWidth
          label="Amount (SOL)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={loading}
          sx={{ mb: 3 }}
          slotProps={{
            input: {
              inputProps: { min: 0, step: 0.001 },
            },
          }}
        />

        {error && (
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
          onClick={handleFund}
          disabled={loading || !amount}
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
            'Fund'
          )}
        </Button>
      </Box>
    </Paper>
  );
}
