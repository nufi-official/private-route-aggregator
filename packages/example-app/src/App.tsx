import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Container, Typography, Box, Grid2 as Grid, Alert } from '@mui/material';
import { WalletProvider } from './providers/WalletProvider';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { WalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
import type { Account } from '@privacy-router-sdk/signers-core';

type AccountType = SolanaAccount | WalletAdapterAccount;

// Type guard to check if account has getSecretKey (is SolanaAccount with mnemonic)
function isMnemonicAccount(account: AccountType): account is SolanaAccount {
  return 'getSecretKey' in account && typeof account.getSecretKey === 'function';
}

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#14F195',
    },
    secondary: {
      main: '#9945FF',
    },
    background: {
      default: '#1a1a2e',
      paper: '#16213e',
    },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

function AppContent() {
  const [account, setAccount] = useState<AccountType | null>(null);
  const [provider, setProvider] = useState<PrivacyCashProvider | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(false);

  const handleLogin = (acc: AccountType) => {
    setAccount(acc);

    // Only create privacy provider if account has secret key (mnemonic-based)
    if (isMnemonicAccount(acc)) {
      try {
        const privacyProvider = new PrivacyCashProvider({
          rpcUrl: acc.getRpcUrl(),
          owner: acc.getSecretKey(),
        });
        setProvider(privacyProvider);
        setIsPrivacyEnabled(true);
      } catch (err) {
        console.error('Failed to create privacy provider:', err);
        setIsPrivacyEnabled(false);
      }
    } else {
      // Browser wallet - no privacy features
      setProvider(null);
      setIsPrivacyEnabled(false);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    setProvider(null);
    setPrivateBalance(0n);
    setIsPrivacyEnabled(false);
  };

  const refreshBalance = useCallback(async () => {
    if (!provider) return;

    setBalanceLoading(true);
    try {
      const balance = await provider.getPrivateBalance();
      setPrivateBalance(balance);
    } catch (err) {
      console.error('Failed to fetch private balance:', err);
    } finally {
      setBalanceLoading(false);
    }
  }, [provider]);

  // Fetch private balance when provider is ready
  useEffect(() => {
    if (provider) {
      refreshBalance();
    }
  }, [provider, refreshBalance]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box textAlign="center" mb={6}>
        <Typography
          variant="h3"
          component="h1"
          fontWeight={700}
          sx={{
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1,
          }}
        >
          Privacy Router
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Fund and withdraw through privacy pools
        </Typography>
      </Box>

      {!account ? (
        <Box maxWidth="sm" mx="auto">
          <LoginForm onLogin={handleLogin} />
        </Box>
      ) : (
        <>
          <BalanceDisplay
            account={account as Account}
            privateBalance={privateBalance}
            balanceLoading={balanceLoading}
            onLogout={handleLogout}
            onRefresh={refreshBalance}
          />

          {!isPrivacyEnabled && (
            <Alert severity="info" sx={{ mb: 4 }}>
              Privacy features require mnemonic login. Browser wallets can only view balance.
            </Alert>
          )}

          <Grid container spacing={4} justifyContent="center" mt={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FundForm
                account={account as Account}
                provider={provider}
                onSuccess={refreshBalance}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <WithdrawForm
                account={account as Account}
                provider={provider}
                privateBalance={privateBalance}
                onSuccess={refreshBalance}
              />
            </Grid>
          </Grid>
        </>
      )}
    </Container>
  );
}

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
