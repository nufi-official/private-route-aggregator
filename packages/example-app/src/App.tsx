import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Container, Typography, Box, Grid2 as Grid } from '@mui/material';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';

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

function App() {
  const [account, setAccount] = useState<SolanaAccount | null>(null);
  const [provider, setProvider] = useState<PrivacyCashProvider | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const handleLogin = (acc: SolanaAccount) => {
    setAccount(acc);

    // Create privacy cash provider with the account's secret key
    const privacyProvider = new PrivacyCashProvider({
      rpcUrl: acc.getRpcUrl(),
      owner: acc.getSecretKey(),
    });
    setProvider(privacyProvider);
  };

  const handleLogout = () => {
    setAccount(null);
    setProvider(null);
    setPrivateBalance(0n);
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
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
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
              account={account}
              privateBalance={privateBalance}
              balanceLoading={balanceLoading}
              onLogout={handleLogout}
              onRefresh={refreshBalance}
            />

            <Grid container spacing={4} justifyContent="center" mt={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FundForm
                  account={account}
                  provider={provider}
                  onSuccess={refreshBalance}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <WithdrawForm
                  account={account}
                  provider={provider}
                  privateBalance={privateBalance}
                  onSuccess={refreshBalance}
                />
              </Grid>
            </Grid>
          </>
        )}
      </Container>
    </ThemeProvider>
  );
}

export default App;
