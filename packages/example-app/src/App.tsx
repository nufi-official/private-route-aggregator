import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import {
  Container,
  Typography,
  Box,
  Grid2 as Grid,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
} from '@mui/material';
import { WalletProvider } from './providers/WalletProvider';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { BalanceDisplay } from './components/BalanceDisplay';
import { PrivacyCashProvider } from '@privacy-router-sdk/privacy-cash';
import { ShadowWireProvider } from '@privacy-router-sdk/shadowwire';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { WalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
import type { LedgerAccount } from '@privacy-router-sdk/solana-ledger';
import type { Account } from '@privacy-router-sdk/signers-core';

type AccountType = SolanaAccount | WalletAdapterAccount | LedgerAccount;
type ProviderType = PrivacyCashProvider | ShadowWireProvider;
type ProviderName = 'privacy-cash' | 'shadowwire';

// Type guard to check if account has getSecretKey (is SolanaAccount with mnemonic)
function isMnemonicAccount(account: AccountType): account is SolanaAccount {
  return 'getSecretKey' in account && typeof account.getSecretKey === 'function';
}

// Type guard to check if account is a wallet adapter account
function isWalletAdapterAccount(account: AccountType): account is WalletAdapterAccount {
  return 'getWallet' in account && typeof account.getWallet === 'function';
}

// Type guard to check if account is a Ledger account
function isLedgerAccount(account: AccountType): account is LedgerAccount {
  return 'getDerivationPath' in account && typeof account.getDerivationPath === 'function';
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
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('shadowwire');
  const [provider, setProvider] = useState<ProviderType | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Create provider based on selection
  const createProvider = useCallback((acc: AccountType, providerName: ProviderName): ProviderType | null => {
    try {
      setProviderError(null);

      if (providerName === 'privacy-cash') {
        if (isMnemonicAccount(acc)) {
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            owner: acc.getSecretKey(),
          });
        } else if (isWalletAdapterAccount(acc)) {
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            walletSigner: acc.getWalletSigner(),
          });
        } else if (isLedgerAccount(acc)) {
          // Note: PrivacyCash may have issues with Ledger due to message signing limitations
          // Ledger's off-chain message signing has strict format requirements
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            walletSigner: acc.getWalletSigner(),
          });
        }
      } else if (providerName === 'shadowwire') {
        // ShadowWire only supports wallet signer mode
        if (isWalletAdapterAccount(acc)) {
          return new ShadowWireProvider({
            walletSigner: acc.getWalletSigner(),
            rpcUrl: acc.getRpcUrl(),
            token: 'SOL',
            enableDebug: true,
          });
        } else if (isLedgerAccount(acc)) {
          return new ShadowWireProvider({
            walletSigner: acc.getWalletSigner(),
            rpcUrl: acc.getRpcUrl(),
            token: 'SOL',
            enableDebug: true,
          });
        } else if (isMnemonicAccount(acc)) {
          // For mnemonic accounts, we need to create a mock wallet signer
          // ShadowWire requires signMessage capability
          setProviderError('ShadowWire requires a browser wallet or Ledger. Please connect using a wallet adapter or Ledger.');
          return null;
        }
      }

      throw new Error('Unknown account or provider type');
    } catch (err) {
      console.error('Failed to create privacy provider:', err);
      setProviderError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const handleLogin = (acc: AccountType) => {
    setAccount(acc);
    const newProvider = createProvider(acc, selectedProvider);
    setProvider(newProvider);
    setIsPrivacyEnabled(newProvider !== null);
  };

  const handleProviderChange = (_: React.MouseEvent<HTMLElement>, newProvider: ProviderName | null) => {
    if (newProvider && account) {
      setSelectedProvider(newProvider);
      setPrivateBalance(0n);
      const newProviderInstance = createProvider(account, newProvider);
      setProvider(newProviderInstance);
      setIsPrivacyEnabled(newProviderInstance !== null);
    }
  };

  const handleLogout = () => {
    setAccount(null);
    setProvider(null);
    setPrivateBalance(0n);
    setIsPrivacyEnabled(false);
    setProviderError(null);
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
          {/* Provider Selector */}
          <Box display="flex" justifyContent="center" alignItems="center" mb={4} gap={2}>
            <Typography variant="body2" color="text.secondary">
              Privacy Provider:
            </Typography>
            <ToggleButtonGroup
              value={selectedProvider}
              exclusive
              onChange={handleProviderChange}
              size="small"
            >
              <ToggleButton value="shadowwire" sx={{ px: 3 }}>
                <Box display="flex" alignItems="center" gap={1}>
                  ShadowWire
                  <Chip label="Simple" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
              </ToggleButton>
              <ToggleButton value="privacy-cash" sx={{ px: 3 }}>
                <Box display="flex" alignItems="center" gap={1}>
                  PrivacyCash
                  <Chip label="Trustless" size="small" color="secondary" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Provider Info */}
          <Box textAlign="center" mb={3}>
            {selectedProvider === 'shadowwire' ? (
              <Typography variant="caption" color="text.secondary">
                API-based privacy pool (custodial) - 0.5% fee - Supports 22 tokens
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                On-chain ZK proofs (non-custodial) - Trustless privacy
              </Typography>
            )}
          </Box>

          <BalanceDisplay
            account={account as Account}
            privateBalance={privateBalance}
            balanceLoading={balanceLoading}
            onLogout={handleLogout}
            onRefresh={refreshBalance}
            providerName={provider?.name}
          />

          {providerError && (
            <Alert severity="error" sx={{ mb: 4 }}>
              {providerError}
            </Alert>
          )}

          {!isPrivacyEnabled && !providerError && (
            <Alert severity="warning" sx={{ mb: 4 }}>
              Privacy features unavailable. Please reconnect your wallet.
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
