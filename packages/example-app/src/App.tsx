import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Container, Typography, Box, Grid2 as Grid, Alert, Tabs, Tab } from '@mui/material';
import { WalletProvider } from './providers/WalletProvider';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { BalanceDisplay } from './components/BalanceDisplay';
import { CrossChainFundForm } from './components/CrossChainFundForm';
import { PrivacyAggregatorProvider } from '@privacy-router-sdk/privacy-aggregator';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { WalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
import type { Account } from '@privacy-router-sdk/signers-core';

type AccountType = SolanaAccount | WalletAdapterAccount;

// Type guard to check if account has getSecretKey (is SolanaAccount with mnemonic)
function isMnemonicAccount(account: AccountType): account is SolanaAccount {
  return 'getSecretKey' in account && typeof account.getSecretKey === 'function';
}

// Type guard to check if account is a wallet adapter account
function isWalletAdapterAccount(account: AccountType): account is WalletAdapterAccount {
  return 'getWallet' in account && typeof account.getWallet === 'function';
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
  const [accountAddress, setAccountAddress] = useState<string>('');
  const [provider, setProvider] = useState<PrivacyAggregatorProvider | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(false);
  const [fundTab, setFundTab] = useState(0);

  const handleLogin = async (acc: AccountType) => {
    setAccount(acc);

    try {
      // Get account address
      const address = await acc.getAddress();
      setAccountAddress(address);

      let privacyProvider: PrivacyAggregatorProvider;

      if (isMnemonicAccount(acc)) {
        // Mnemonic-based account - use private key directly
        privacyProvider = new PrivacyAggregatorProvider({
          rpcUrl: acc.getRpcUrl(),
          owner: acc.getSecretKey(),
        });
      } else if (isWalletAdapterAccount(acc)) {
        // Browser wallet - use wallet signer mode (derives keys from signature)
        privacyProvider = new PrivacyAggregatorProvider({
          rpcUrl: acc.getRpcUrl(),
          walletSigner: acc.getWalletSigner(),
        });
      } else {
        throw new Error('Unknown account type');
      }

      setProvider(privacyProvider);
      setIsPrivacyEnabled(true);
    } catch (err) {
      console.error('Failed to create privacy provider:', err);
      setProvider(null);
      setIsPrivacyEnabled(false);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    setAccountAddress('');
    setProvider(null);
    setPrivateBalance(0n);
    setIsPrivacyEnabled(false);
    setFundTab(0);
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
            <Alert severity="warning" sx={{ mb: 4 }}>
              Privacy features unavailable. Please reconnect your wallet.
            </Alert>
          )}

          <Grid container spacing={4} justifyContent="center" mt={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs
                  value={fundTab}
                  onChange={(_, v) => setFundTab(v)}
                  variant="fullWidth"
                >
                  <Tab label="Direct (SOL)" />
                  <Tab label="Cross-Chain" />
                </Tabs>
              </Box>
              {fundTab === 0 ? (
                <FundForm
                  account={account as Account}
                  provider={provider?.getPrivacyCashProvider() ?? null}
                  onSuccess={refreshBalance}
                />
              ) : (
                <CrossChainFundForm
                  provider={provider}
                  senderAddress={accountAddress}
                  onSuccess={refreshBalance}
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <WithdrawForm
                account={account as Account}
                provider={provider?.getPrivacyCashProvider() ?? null}
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
