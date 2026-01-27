import { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { createSolanaAccount, SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import {
  createWalletAdapterAccount,
  WalletAdapterAccount,
} from '@privacy-router-sdk/solana-wallet-adapter';

type AccountType = SolanaAccount | WalletAdapterAccount;

interface LoginFormProps {
  onLogin: (account: AccountType) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [tab, setTab] = useState(0);
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = useWallet();

  const handleMnemonicLogin = async () => {
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

  const handleWalletLogin = () => {
    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setError(null);

    try {
      const account = createWalletAdapterAccount(wallet, {
        network: 'mainnet',
      });

      onLogin(account);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMessage);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={600} mb={1}>
        Connect Wallet
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Choose how to connect your Solana wallet
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, newValue) => {
          setTab(newValue);
          setError(null);
        }}
        sx={{ mb: 3 }}
      >
        <Tab label="Browser Wallet" />
        <Tab label="Mnemonic" />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {tab === 0 && (
        <Box>
          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
            <WalletMultiButton />

            {wallet.connected && (
              <>
                <Typography variant="body2" color="success.main">
                  Wallet connected: {wallet.publicKey?.toBase58().slice(0, 8)}...
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleWalletLogin}
                  sx={{
                    py: 1.5,
                    background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
                    },
                  }}
                >
                  Continue with Connected Wallet
                </Button>
              </>
            )}
          </Box>
        </Box>
      )}

      {tab === 1 && (
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

          <Alert severity="warning" sx={{ mb: 3 }}>
            Never enter your real mnemonic on untrusted sites. This is a demo app.
          </Alert>

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleMnemonicLogin}
            disabled={loading || !mnemonic.trim()}
            sx={{
              py: 1.5,
              background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
              },
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Connect with Mnemonic'}
          </Button>
        </Box>
      )}
    </Paper>
  );
}
