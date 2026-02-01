import { useState, useCallback, useEffect } from 'react';
import {
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useWallet } from '@solana/wallet-adapter-react';
import { createSolanaAccount, SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import {
  createWalletAdapterAccount,
  WalletAdapterAccount,
} from '@privacy-router-sdk/solana-wallet-adapter';

type AccountType = SolanaAccount | WalletAdapterAccount;

interface LoginFormProps {
  onLogin: (account: AccountType) => void;
}

type ViewType = 'main' | 'mnemonic';

export function LoginForm({ onLogin }: LoginFormProps) {
  const [view, setView] = useState<ViewType>('main');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllWallets, setShowAllWallets] = useState(false);

  const walletContext = useWallet();
  const { wallets, select, wallet, connected, publicKey, connecting } = walletContext;

  // Filter wallets by ready state (Installed = 'Installed', Loadable = 'Loadable')
  const installedWallets = wallets.filter(
    (w) => w.readyState === 'Installed' || w.readyState === 'Loadable'
  );
  const otherWallets = wallets.filter(
    (w) => w.readyState !== 'Installed' && w.readyState !== 'Loadable'
  );

  // Auto-login when wallet connects
  useEffect(() => {
    if (connected && publicKey && wallet) {
      try {
        const account = createWalletAdapterAccount(walletContext, {
          network: 'mainnet',
        });
        onLogin(account);
      } catch (err) {
        console.error('Failed to create account:', err);
      }
    }
  }, [connected, publicKey, wallet, walletContext, onLogin]);

  const handleSelectWallet = useCallback((walletName: string) => {
    select(walletName as any);
  }, [select]);

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

      await account.getAddress();
      onLogin(account);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setView('main');
    setError(null);
  };

  // Wallet option component
  const WalletOption = ({
    icon,
    name,
    detected,
    onClick,
    isConnecting,
  }: {
    icon: React.ReactNode;
    name: string;
    detected?: boolean;
    onClick: () => void;
    isConnecting?: boolean;
  }) => (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 1.5,
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        '&:hover': {
          bgcolor: 'rgba(255, 255, 255, 0.05)',
        },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#2a2a2a',
        }}
      >
        {icon}
      </Box>
      <Typography fontWeight={500} flex={1}>
        {name}
      </Typography>
      {isConnecting ? (
        <CircularProgress size={16} />
      ) : detected ? (
        <Typography variant="caption" color="text.secondary">
          Detected
        </Typography>
      ) : null}
    </Box>
  );

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Main wallet selection view */}
      {view === 'main' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This app is for testing purposes only. Use with test funds only.
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: 6,
              },
              '&::-webkit-scrollbar-track': {
                bgcolor: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'rgba(255,255,255,0.2)',
                borderRadius: 3,
              },
            }}
          >
            {/* Installed/Detected Wallets */}
            {installedWallets.map((w) => (
              <WalletOption
                key={w.adapter.name}
                icon={
                  <img
                    src={w.adapter.icon}
                    alt={w.adapter.name}
                    style={{ width: 36, height: 36 }}
                  />
                }
                name={w.adapter.name}
                detected
                onClick={() => handleSelectWallet(w.adapter.name)}
                isConnecting={connecting && wallet?.adapter.name === w.adapter.name}
              />
            ))}

            {/* Recovery phrase option */}
            <WalletOption
              icon={<KeyIcon sx={{ color: 'primary.main' }} />}
              name="Recovery Phrase"
              onClick={() => setView('mnemonic')}
            />

            {/* More options toggle */}
            {otherWallets.length > 0 && (
              <>
                <Box
                  onClick={() => setShowAllWallets(!showAllWallets)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 1.5,
                    cursor: 'pointer',
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'text.primary',
                    },
                  }}
                >
                  <Typography variant="body2">
                    {showAllWallets ? 'Less options' : 'More options'}
                  </Typography>
                  <Typography
                    sx={{
                      transform: showAllWallets ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}
                  >
                    ▼
                  </Typography>
                </Box>

                {showAllWallets && otherWallets.map((w) => (
                  <WalletOption
                    key={w.adapter.name}
                    icon={
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        style={{ width: 36, height: 36 }}
                      />
                    }
                    name={w.adapter.name}
                    onClick={() => handleSelectWallet(w.adapter.name)}
                    isConnecting={connecting && wallet?.adapter.name === w.adapter.name}
                  />
                ))}
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Mnemonic view */}
      {view === 'mnemonic' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box display="flex" alignItems="center" gap={1} mb={3}>
            <IconButton onClick={goBack} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={600}>
              Recovery Phrase
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Alert severity="warning" sx={{ mb: 3 }}>
            Never enter your real mnemonic on untrusted sites. This is for testing only.
          </Alert>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Enter your 12, 15, or 24 word phrase"
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder="word1 word2 word3..."
            disabled={loading}
            sx={{ mb: 3 }}
            type="password"
          />

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
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Connect'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
