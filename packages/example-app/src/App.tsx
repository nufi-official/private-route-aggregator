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
  Button,
  Paper,
} from '@mui/material';
import { WalletProvider } from './providers/WalletProvider';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { WithdrawForm } from './components/WithdrawForm';
import { useTokenPrices } from './hooks/useTokenPrices';
import { PrivacyCashProvider, SPL_MINTS } from '@privacy-router-sdk/privacy-cash';
import { ShadowWireProvider, SUPPORTED_TOKENS, TOKEN_MINTS } from '@privacy-router-sdk/shadowwire';
import type { ShadowWireToken } from '@privacy-router-sdk/shadowwire';
import { Connection, PublicKey } from '@solana/web3.js';
import type { PrivacyCashAsset } from '@privacy-router-sdk/privacy-cash';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { WalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
import type { LedgerAccount } from '@privacy-router-sdk/solana-ledger';

type AccountType = SolanaAccount | WalletAdapterAccount | LedgerAccount;
type ProviderType = PrivacyCashProvider | ShadowWireProvider;
type ProviderName = 'privacy-cash' | 'shadowwire';

// Assets supported by each provider
const PRIVACY_CASH_ASSETS: PrivacyCashAsset[] = ['SOL', 'USDC', 'USDT'];
const SHADOWWIRE_ASSETS: ShadowWireToken[] = [...SUPPORTED_TOKENS];

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
  const [address, setAddress] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('shadowwire');
  const [providerError, setProviderError] = useState<string | null>(null);

  // Token prices from NEAR Intents
  const { formatUsdValue } = useTokenPrices();

  // Separate state for Fund form
  const [fundAsset, setFundAsset] = useState<string>('SOL');
  const [fundProvider, setFundProvider] = useState<ProviderType | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);

  // Separate state for Withdraw form
  const [withdrawAsset, setWithdrawAsset] = useState<string>('SOL');
  const [withdrawProvider, setWithdrawProvider] = useState<ProviderType | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [privateBalanceLoading, setPrivateBalanceLoading] = useState(false);

  // Get available assets for current provider
  const availableAssets = selectedProvider === 'shadowwire' ? SHADOWWIRE_ASSETS : PRIVACY_CASH_ASSETS;

  // Get decimals for an asset
  const getDecimals = (asset: string) => {
    if (asset === 'SOL') return 9;
    return 6; // USDC, USDT, and most SPL tokens
  };

  // Create provider based on selection
  const createProvider = useCallback((acc: AccountType, providerName: ProviderName, asset: string): ProviderType | null => {
    try {
      if (providerName === 'privacy-cash') {
        if (isMnemonicAccount(acc)) {
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            owner: acc.getSecretKey(),
          }, asset as PrivacyCashAsset);
        } else if (isWalletAdapterAccount(acc)) {
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            walletSigner: acc.getWalletSigner(),
          }, asset as PrivacyCashAsset);
        } else if (isLedgerAccount(acc)) {
          return new PrivacyCashProvider({
            rpcUrl: acc.getRpcUrl(),
            walletSigner: acc.getWalletSigner(),
          }, asset as PrivacyCashAsset);
        }
      } else if (providerName === 'shadowwire') {
        if (isWalletAdapterAccount(acc)) {
          return new ShadowWireProvider({
            walletSigner: acc.getWalletSigner(),
            rpcUrl: acc.getRpcUrl(),
            token: asset as ShadowWireToken,
            enableDebug: true,
          });
        } else if (isLedgerAccount(acc)) {
          return new ShadowWireProvider({
            walletSigner: acc.getWalletSigner(),
            rpcUrl: acc.getRpcUrl(),
            token: asset as ShadowWireToken,
            enableDebug: true,
          });
        } else if (isMnemonicAccount(acc)) {
          return null; // ShadowWire doesn't support mnemonic accounts
        }
      }

      return null;
    } catch (err) {
      console.error('Failed to create privacy provider:', err);
      return null;
    }
  }, []);

  // Fetch wallet address on login
  useEffect(() => {
    if (account) {
      account.getAddress().then(setAddress).catch(console.error);
    }
  }, [account]);

  const handleLogin = (acc: AccountType) => {
    setAccount(acc);
    setProviderError(null);

    // Check if provider supports the account type
    if (selectedProvider === 'shadowwire' && isMnemonicAccount(acc)) {
      setProviderError('ShadowWire requires a browser wallet or Ledger. Please connect using a wallet adapter or Ledger.');
    }

    // Create initial providers for both forms
    const newFundProvider = createProvider(acc, selectedProvider, fundAsset);
    const newWithdrawProvider = createProvider(acc, selectedProvider, withdrawAsset);
    setFundProvider(newFundProvider);
    setWithdrawProvider(newWithdrawProvider);
  };

  const handleProviderChange = (_: React.MouseEvent<HTMLElement>, newProviderName: ProviderName | null) => {
    if (newProviderName && account) {
      setSelectedProvider(newProviderName);
      setProviderError(null);

      // Check if new provider supports the account type
      if (newProviderName === 'shadowwire' && isMnemonicAccount(account)) {
        setProviderError('ShadowWire requires a browser wallet or Ledger. Please connect using a wallet adapter or Ledger.');
        setFundProvider(null);
        setWithdrawProvider(null);
        return;
      }

      // Reset to SOL if current assets not supported by new provider
      const newAssets = newProviderName === 'shadowwire' ? SHADOWWIRE_ASSETS : PRIVACY_CASH_ASSETS;

      const newFundAsset = newAssets.includes(fundAsset as never) ? fundAsset : 'SOL';
      const newWithdrawAsset = newAssets.includes(withdrawAsset as never) ? withdrawAsset : 'SOL';

      setFundAsset(newFundAsset);
      setWithdrawAsset(newWithdrawAsset);
      setPrivateBalance(0n);
      setWalletBalance(0n);

      // Recreate providers with new provider type
      const newFundProvider = createProvider(account, newProviderName, newFundAsset);
      const newWithdrawProvider = createProvider(account, newProviderName, newWithdrawAsset);
      setFundProvider(newFundProvider);
      setWithdrawProvider(newWithdrawProvider);
    }
  };

  const handleFundAssetChange = async (newAsset: string) => {
    setFundAsset(newAsset);
    setWalletBalance(0n);

    if (account) {
      // For PrivacyCash, reuse the existing provider and just change the asset
      // This avoids requiring a new signature
      if (selectedProvider === 'privacy-cash' && fundProvider instanceof PrivacyCashProvider) {
        fundProvider.setAsset(newAsset as PrivacyCashAsset);
      } else {
        // For ShadowWire, we need to create a new provider
        const newProvider = createProvider(account, selectedProvider, newAsset);
        setFundProvider(newProvider);
      }
    }
  };

  const handleWithdrawAssetChange = async (newAsset: string) => {
    setWithdrawAsset(newAsset);
    setPrivateBalance(0n);

    if (account) {
      // For PrivacyCash, reuse the existing provider and just change the asset
      // This avoids requiring a new signature
      if (selectedProvider === 'privacy-cash' && withdrawProvider instanceof PrivacyCashProvider) {
        withdrawProvider.setAsset(newAsset as PrivacyCashAsset);
        // Fetch balance with new asset
        setPrivateBalanceLoading(true);
        try {
          const balance = await withdrawProvider.getPrivateBalance();
          setPrivateBalance(balance);
        } catch (err) {
          console.error('Failed to fetch private balance:', err);
        } finally {
          setPrivateBalanceLoading(false);
        }
      } else {
        // For ShadowWire, we need to create a new provider
        const newProvider = createProvider(account, selectedProvider, newAsset);
        setWithdrawProvider(newProvider);
      }
    }
  };

  const handleLogout = () => {
    setAccount(null);
    setAddress('');
    setFundProvider(null);
    setWithdrawProvider(null);
    setPrivateBalance(0n);
    setWalletBalance(0n);
    setProviderError(null);
  };

  // Fetch wallet balance for fund form
  const refreshWalletBalance = useCallback(async () => {
    if (!account) return;

    setWalletBalanceLoading(true);
    try {
      if (fundAsset === 'SOL') {
        const balance = await account.getBalance();
        setWalletBalance(balance);
      } else {
        // Fetch SPL token balance
        const walletAddress = await account.getAddress();
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL as string || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        // Get mint address from either ShadowWire or PrivacyCash mints
        const mintAddress = TOKEN_MINTS[fundAsset as ShadowWireToken] || SPL_MINTS[fundAsset as PrivacyCashAsset];

        if (!mintAddress) {
          console.warn(`No mint address found for ${fundAsset}`);
          setWalletBalance(0n);
          return;
        }

        const walletPubkey = new PublicKey(walletAddress);
        const mintPubkey = new PublicKey(mintAddress);

        // Find token accounts for this mint owned by the wallet
        const tokenAccounts = await connection.getTokenAccountsByOwner(walletPubkey, {
          mint: mintPubkey,
        });

        if (tokenAccounts.value.length === 0) {
          setWalletBalance(0n);
        } else {
          // Parse the token account data to get balance
          const accountInfo = tokenAccounts.value[0].account;
          // Token account data: first 64 bytes are mint (32) and owner (32), then 8 bytes for amount
          const data = accountInfo.data;
          const amount = data.readBigUInt64LE(64);
          setWalletBalance(amount);
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet balance:', err);
      setWalletBalance(0n);
    } finally {
      setWalletBalanceLoading(false);
    }
  }, [account, fundAsset]);

  // Fetch private balance for withdraw form
  const refreshPrivateBalance = useCallback(async () => {
    if (!withdrawProvider) return;

    setPrivateBalanceLoading(true);
    try {
      const balance = await withdrawProvider.getPrivateBalance();
      setPrivateBalance(balance);
    } catch (err) {
      console.error('Failed to fetch private balance:', err);
    } finally {
      setPrivateBalanceLoading(false);
    }
  }, [withdrawProvider]);

  // Fetch balances when providers change
  useEffect(() => {
    if (account) {
      refreshWalletBalance();
    }
  }, [account, fundAsset, refreshWalletBalance]);

  useEffect(() => {
    if (withdrawProvider) {
      refreshPrivateBalance();
    }
  }, [withdrawProvider, refreshPrivateBalance]);

  const shortenAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

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
          {/* Header with address and logout */}
          <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="body2" color="text.secondary">
                  Connected:
                </Typography>
                <Chip
                  label={shortenAddress(address)}
                  size="small"
                  onClick={() => navigator.clipboard.writeText(address)}
                  sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
                  title="Click to copy"
                />
              </Box>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </Box>
          </Paper>

          {/* Provider Selector */}
          <Box display="flex" justifyContent="center" alignItems="center" mb={2} gap={2}>
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
                  <Chip label="22 tokens" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
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
                API-based privacy pool (custodial) - 0.5% fee
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                On-chain ZK proofs (non-custodial) - Trustless privacy
              </Typography>
            )}
          </Box>

          {providerError && (
            <Alert severity="error" sx={{ mb: 4 }}>
              {providerError}
            </Alert>
          )}

          <Grid container spacing={4} justifyContent="center" mt={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FundForm
                account={account}
                provider={fundProvider}
                onSuccess={refreshPrivateBalance}
                asset={fundAsset}
                decimals={getDecimals(fundAsset)}
                availableAssets={availableAssets as string[]}
                onAssetChange={handleFundAssetChange}
                walletBalance={walletBalance}
                walletBalanceLoading={walletBalanceLoading}
                formatUsdValue={formatUsdValue}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <WithdrawForm
                account={account}
                provider={withdrawProvider}
                privateBalance={privateBalance}
                privateBalanceLoading={privateBalanceLoading}
                onSuccess={refreshWalletBalance}
                asset={withdrawAsset}
                decimals={getDecimals(withdrawAsset)}
                availableAssets={availableAssets as string[]}
                onAssetChange={handleWithdrawAssetChange}
                formatUsdValue={formatUsdValue}
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
