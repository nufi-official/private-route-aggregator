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
import { createSolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { Account } from '@privacy-router-sdk/signers-core';

interface LoginFormProps {
  onLogin: (account: Account) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!mnemonic.trim()) {
      setError('Please enter your mnemonic phrase');
      return;
    }

    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 15 && words.length !== 24) {
      setError('Mnemonic must be 12, 15, or 24 words');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const account = createSolanaAccount({
        mnemonic: mnemonic.trim(),
        accountIndex: 0,
        network: 'mainnet',
      });

      // Verify we can get the address
      await account.getAddress();

      onLogin(account);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={1}>
        Login with Mnemonic
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Enter your 12, 15, or 24 word seed phrase to access your wallet
      </Typography>

      <Box component="form" noValidate autoComplete="off">
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Mnemonic Phrase"
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="Enter your 12, 15, or 24 word mnemonic..."
          disabled={loading}
          sx={{ mb: 3 }}
          type="password"
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="warning" sx={{ mb: 3 }}>
          Never enter your real mnemonic on untrusted sites. This is a demo app.
        </Alert>

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleLogin}
          disabled={loading || !mnemonic.trim()}
          sx={{
            py: 1.5,
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
            },
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'Connect Wallet'}
        </Button>
      </Box>
    </Paper>
  );
}
