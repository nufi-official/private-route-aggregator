import { useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Container, Typography, Box, Grid2 as Grid } from '@mui/material';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { BalanceDisplay } from './components/BalanceDisplay';
import type { Account } from '@privacy-router-sdk/signers-core';

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
  const [account, setAccount] = useState<Account | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);

  const handleLogin = (acc: Account) => {
    setAccount(acc);
  };

  const handleLogout = () => {
    setAccount(null);
    setPrivateBalance(0n);
  };

  const refreshBalance = async () => {
    // TODO: Implement actual balance refresh from privacy provider
    // For now this is a placeholder
  };

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
              onLogout={handleLogout}
              onRefresh={refreshBalance}
            />

            <Grid container spacing={4} justifyContent="center" mt={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FundForm account={account} onSuccess={refreshBalance} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <WithdrawForm
                  account={account}
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
