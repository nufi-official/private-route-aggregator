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
  Dialog,
  DialogContent,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { WalletProvider } from './providers/WalletProvider';
import { LoginForm } from './components/LoginForm';
import { FundForm } from './components/FundForm';
import { TransferForm } from './components/TransferForm';
import { useTokenPrices } from './hooks/useTokenPrices';
import { PrivacyCashProvider, SPL_MINTS } from '@privacy-router-sdk/privacy-cash';
import { ShadowWireProvider, TOKEN_MINTS, initWASM } from '@privacy-router-sdk/shadowwire';
import type { ShadowWireToken } from '@privacy-router-sdk/shadowwire';
import { Connection, PublicKey } from '@solana/web3.js';
import type { PrivacyCashAsset } from '@privacy-router-sdk/privacy-cash';
import type { SolanaAccount } from '@privacy-router-sdk/solana-mnemonic';
import type { WalletAdapterAccount } from '@privacy-router-sdk/solana-wallet-adapter';
import type { LedgerAccount } from '@privacy-router-sdk/solana-ledger';

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
      default: '#000000',
      paper: '#111111',
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
          borderRadius: 24,
        },
        contained: {
          background: '#000000',
          color: '#ffffff',
          '&:hover': {
            background: '#1a1a1a',
          },
          '&:disabled': {
            background: '#333333',
            color: '#666666',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 24,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          background: '#111111',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-15px -15px 30px rgba(20, 241, 149, 0.15), 15px 15px 30px rgba(153, 69, 255, 0.15), 0 0 20px rgba(20, 241, 149, 0.1), 0 0 40px rgba(153, 69, 255, 0.08)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
        grouped: {
          '&:first-of-type': {
            borderRadius: '24px 0 0 24px',
          },
          '&:last-of-type': {
            borderRadius: '0 24px 24px 0',
          },
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

  // Token prices and tokens from NEAR Intents
  const { formatUsdValue, convertAmount, tokens: nearIntentsTokens, loading: pricesLoading } = useTokenPrices();

  // All NEAR Intents tokens: Solana tokens by symbol, cross-chain as "SYMBOL:CHAIN"
  // Always include SOL as fallback
  const nearIntentsAssets = nearIntentsTokens.length > 0
    ? [
        // Solana tokens (just symbol)
        ...new Set(
          nearIntentsTokens
            .filter((t) => t.blockchain === 'sol')
            .map((t) => t.symbol)
        ),
        // Cross-chain tokens (SYMBOL:CHAIN format)
        ...nearIntentsTokens
          .filter((t) => t.blockchain !== 'sol')
          .map((t) => `${t.symbol}:${t.blockchain}`),
      ]
    : ['SOL', 'USDC', 'USDT']; // Fallback if tokens haven't loaded

  // Separate state for Fund form
  const [fundAsset, setFundAsset] = useState<string>('SOL');
  const [fundProvider, setFundProvider] = useState<ProviderType | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);

  // Separate state for Transfer form
  const [withdrawAsset, setWithdrawAsset] = useState<string>('SOL');
  const [withdrawProvider, setWithdrawProvider] = useState<ProviderType | null>(null);
  const [solProvider, setSolProvider] = useState<ProviderType | null>(null); // Always SOL for balance
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n); // Always SOL balance
  const [privateBalanceLoading, setPrivateBalanceLoading] = useState(false);

  // Initialize WASM for ShadowWire on mount
  useEffect(() => {
    initWASM('/wasm/settler_wasm_bg.wasm').catch((err) => {
      console.warn('Failed to initialize ShadowWire WASM:', err);
    });
  }, []);

  // Available assets for both forms - just NEAR Intents tokens
  const availableAssets = nearIntentsAssets;

  // Get decimals for an asset (handles both "SYMBOL" and "SYMBOL:CHAIN" formats)
  const getDecimals = (asset: string) => {
    if (asset === 'SOL') return 9;

    // Check if it's a cross-chain asset (SYMBOL:CHAIN format)
    if (asset.includes(':')) {
      const [symbol, chain] = asset.split(':');
      const nearToken = nearIntentsTokens.find(
        (t) => t.symbol === symbol && t.blockchain === chain
      );
      if (nearToken?.decimals) return nearToken.decimals;
    }

    // Check NEAR Intents tokens for decimals (Solana)
    const nearToken = nearIntentsTokens.find(
      (t) => t.symbol === asset && t.blockchain === 'sol'
    );
    if (nearToken?.decimals) return nearToken.decimals;
    return 6; // USDC, USDT, and most SPL tokens default
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
    const newSolProvider = createProvider(acc, selectedProvider, 'SOL'); // Always SOL for balance
    setFundProvider(newFundProvider);
    setWithdrawProvider(newWithdrawProvider);
    setSolProvider(newSolProvider);
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
        setSolProvider(null);
        return;
      }

      // Reset to SOL if current asset not in NEAR Intents
      const newFundAsset = nearIntentsAssets.includes(fundAsset) ? fundAsset : 'SOL';
      const newWithdrawAsset = nearIntentsAssets.includes(withdrawAsset) ? withdrawAsset : 'SOL';

      setFundAsset(newFundAsset);
      setWithdrawAsset(newWithdrawAsset);
      // Only reset private balance (different pools per provider)
      // Wallet balance is independent of provider - don't reset it
      setPrivateBalance(0n);

      // Recreate providers with new provider type
      const newFundProvider = createProvider(account, newProviderName, newFundAsset);
      const newWithdrawProvider = createProvider(account, newProviderName, newWithdrawAsset);
      const newSolProvider = createProvider(account, newProviderName, 'SOL');
      setFundProvider(newFundProvider);
      setWithdrawProvider(newWithdrawProvider);
      setSolProvider(newSolProvider);
    }
  };

  const handleFundAssetChange = async (newAsset: string) => {
    setFundAsset(newAsset);
    setWalletBalance(0n);

    // Cross-chain assets (format: SYMBOL:CHAIN) don't need a provider
    // They use NEAR Intents directly
    if (newAsset.includes(':')) {
      return;
    }

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

  const handleWithdrawAssetChange = (newAsset: string) => {
    setWithdrawAsset(newAsset);
    // SOL balance stays the same - just update the selected asset for conversion display
  };

  const handleLogout = () => {
    setAccount(null);
    setAddress('');
    setFundProvider(null);
    setWithdrawProvider(null);
    setSolProvider(null);
    setPrivateBalance(0n);
    setWalletBalance(0n);
    setProviderError(null);
  };

  // Fetch wallet balance for fund form
  const refreshWalletBalance = useCallback(async () => {
    if (!account) return;

    // Skip balance fetch for cross-chain assets (not on Solana)
    if (fundAsset.includes(':')) {
      setWalletBalance(0n);
      return;
    }

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

        // Get mint address from ShadowWire, PrivacyCash, or NEAR Intents tokens
        let mintAddress: string | undefined = TOKEN_MINTS[fundAsset as ShadowWireToken] || (SPL_MINTS as Record<string, string>)[fundAsset];

        // If not found in provider mints, try NEAR Intents tokens
        if (!mintAddress) {
          const nearIntentsToken = nearIntentsTokens.find(
            (t) => t.symbol === fundAsset && t.blockchain === 'sol'
          );
          mintAddress = nearIntentsToken?.contractAddress;
        }

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
          const accountInfo = tokenAccounts.value[0]!.account;
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
  }, [account, fundAsset, nearIntentsTokens]);

  // Fetch private SOL balance (always SOL, used for conversions)
  const refreshPrivateBalance = useCallback(async () => {
    if (!solProvider) return;

    setPrivateBalanceLoading(true);
    try {
      const balance = await solProvider.getPrivateBalance();
      setPrivateBalance(balance);
    } catch (err) {
      console.error('Failed to fetch private balance:', err);
    } finally {
      setPrivateBalanceLoading(false);
    }
  }, [solProvider]);

  // Fetch balances when providers change
  useEffect(() => {
    if (account) {
      refreshWalletBalance();
    }
  }, [account, fundAsset, refreshWalletBalance]);

  useEffect(() => {
    if (solProvider) {
      refreshPrivateBalance();
    }
  }, [solProvider, refreshPrivateBalance]);

  const shortenAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const [showLoginDialog, setShowLoginDialog] = useState(false);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Top header bar */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Typography
          variant="h5"
          component="h1"
          fontWeight={700}
          sx={{
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Privacy Router
        </Typography>

        {!account ? (
          <Button
            variant="contained"
            onClick={() => setShowLoginDialog(true)}
            sx={{
              background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
              color: '#000',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
              },
            }}
          >
            Connect
          </Button>
        ) : (
          <Box display="flex" alignItems="center" gap={2}>
            <Chip
              label={shortenAddress(address)}
              size="small"
              onClick={() => navigator.clipboard.writeText(address)}
              sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
              title="Click to copy"
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                refreshWalletBalance();
                refreshPrivateBalance();
              }}
              disabled={walletBalanceLoading || privateBalanceLoading}
            >
              {walletBalanceLoading || privateBalanceLoading ? '...' : 'Refresh'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={handleLogout}
            >
              Disconnect
            </Button>
          </Box>
        )}
      </Box>

      {/* Login Dialog */}
      <Dialog
        open={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#111111',
            backgroundImage: 'none',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      >
        <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
          <IconButton onClick={() => setShowLoginDialog(false)} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ p: 0 }}>
          <LoginForm
            onLogin={(acc) => {
              handleLogin(acc);
              setShowLoginDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Provider Selector */}
      {account && (
        <Box display="flex" justifyContent="center" alignItems="center" mb={3} gap={2}>
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
      )}

      {providerError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {providerError}
        </Alert>
      )}

      {/* Forms */}
      <Box sx={{ position: 'relative' }}>
        {!account && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(0,0,0,0.6)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '24px',
              backdropFilter: 'blur(4px)',
              gap: 2,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Connect wallet to continue
            </Typography>
            <Button
              variant="contained"
              onClick={() => setShowLoginDialog(true)}
              sx={{
                background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
                color: '#000',
                fontWeight: 600,
                '&:hover': {
                  background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
                },
              }}
            >
              Connect Wallet
            </Button>
          </Box>
        )}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            {account ? (
              <FundForm
                account={account}
                provider={fundProvider}
                onSuccess={refreshPrivateBalance}
                asset={fundAsset}
                decimals={getDecimals(fundAsset)}
                availableAssets={availableAssets}
                onAssetChange={handleFundAssetChange}
                walletBalance={walletBalance}
                walletBalanceLoading={walletBalanceLoading}
                formatUsdValue={formatUsdValue}
                nearIntentsTokens={nearIntentsTokens}
              />
            ) : (
              <Paper elevation={2} sx={{ p: 4, minHeight: 350 }}>
                <Typography variant="h5" fontWeight={600} mb={2}>
                  Fund Privacy Pool
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Deposit assets into the privacy pool
                </Typography>
              </Paper>
            )}
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            {account ? (
              <TransferForm
                account={account}
                provider={withdrawProvider}
                privateBalance={privateBalance}
                privateBalanceLoading={privateBalanceLoading}
                onSuccess={refreshWalletBalance}
                asset={withdrawAsset}
                decimals={getDecimals(withdrawAsset)}
                availableAssets={availableAssets}
                onAssetChange={handleWithdrawAssetChange}
                formatUsdValue={formatUsdValue}
                convertAmount={convertAmount}
                nearIntentsTokens={nearIntentsTokens}
                pricesLoading={pricesLoading}
              />
            ) : (
              <Paper elevation={2} sx={{ p: 4, minHeight: 350 }}>
                <Typography variant="h5" fontWeight={600} mb={2}>
                  Transfer
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Withdraw assets from the privacy pool
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      </Box>
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
