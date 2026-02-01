import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import {
  Container,
  Typography,
  Box,
  Grid2 as Grid,
  Alert,
  Chip,
  Button,
  Dialog,
  DialogContent,
  Tooltip,
  Link,
} from '@mui/material';
import { WalletProvider } from './providers/WalletProvider';
import { useWallet } from '@solana/wallet-adapter-react';
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

type AccountType = SolanaAccount | WalletAdapterAccount;
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
    fontFamily: "'DM Sans', sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 32,
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
            borderRadius: 32,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 32,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 32,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 32,
          background: '#111111',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-15px -15px 30px rgba(20, 241, 149, 0.15), 15px 15px 30px rgba(153, 69, 255, 0.15), 0 0 20px rgba(20, 241, 149, 0.1), 0 0 40px rgba(153, 69, 255, 0.08)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          border: 'none',
          alignItems: 'center',
        },
        icon: {
          alignItems: 'center',
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
  const wallet = useWallet();

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
  const [walletBalance, setWalletBalance] = useState<bigint>(0n); // Balance for selected asset
  const [solWalletBalance, setSolWalletBalance] = useState<bigint>(0n); // Always SOL for top bar
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);

  // Separate state for Transfer form
  const [withdrawAsset, setWithdrawAsset] = useState<string>('SOL');
  const [withdrawProvider, setWithdrawProvider] = useState<ProviderType | null>(null);
  const [solProvider, setSolProvider] = useState<ProviderType | null>(null); // Always SOL for balance
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n); // Always SOL balance
  const [privateBalanceLoading, setPrivateBalanceLoading] = useState(false);

  // Separate balance tracking for each provider
  const [shadowWireBalance, setShadowWireBalance] = useState<bigint | null>(null);
  const [privacyCashBalance, setPrivacyCashBalance] = useState<bigint | null>(null);
  const [shadowWireProvider, setShadowWireProvider] = useState<ShadowWireProvider | null>(null);

  // Cached PrivacyCash provider to avoid re-signing (signature cached per session)
  const [cachedPrivacyCashProvider, setCachedPrivacyCashProvider] = useState<PrivacyCashProvider | null>(null);

  // Title visibility - hide when progress is visible
  const [progressVisible, setProgressVisible] = useState(false);

  // Splash screen animation
  const [splashComplete, setSplashComplete] = useState(false);

  const handleProgressVisibleChange = useCallback((visible: boolean) => {
    setProgressVisible(visible);
  }, []);

  // Trigger splash animation after mount - hide HTML splash
  useEffect(() => {
    const timer = setTimeout(() => {
      const splash = document.getElementById('splash');
      const splashContent = document.getElementById('splash-content');
      if (splash && splashContent) {
        // Stop pulse and start shrink animation
        splashContent.style.animation = 'shrink-away 0.6s ease-in forwards';
        // Fade background after logo shrinks
        setTimeout(() => {
          splash.style.opacity = '0';
        }, 400);
        // Remove from DOM after animation
        setTimeout(() => splash.remove(), 1000);
      }
      setSplashComplete(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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
        }
      } else if (providerName === 'shadowwire') {
        if (isWalletAdapterAccount(acc)) {
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

    // Always start with ShadowWire to avoid PrivacyCash signing on login
    setSelectedProvider('shadowwire');

    // Check if provider supports the account type
    if (isMnemonicAccount(acc)) {
      setProviderError('ShadowWire requires a browser wallet. Please connect using a wallet adapter.');
    }

    // Create initial providers using ShadowWire (PrivacyCash requires signing, so user must select it explicitly)
    const newFundProvider = createProvider(acc, 'shadowwire', fundAsset);
    const newWithdrawProvider = createProvider(acc, 'shadowwire', withdrawAsset);
    const newSolProvider = createProvider(acc, 'shadowwire', 'SOL') as ShadowWireProvider | null;
    setFundProvider(newFundProvider);
    setWithdrawProvider(newWithdrawProvider);
    setSolProvider(newSolProvider);
    setShadowWireProvider(newSolProvider);
  };

  const handleProviderChange = (_: React.MouseEvent<HTMLElement> | null, newProviderName: ProviderName | null) => {
    if (newProviderName && account) {
      setSelectedProvider(newProviderName);
      setProviderError(null);

      // Check if new provider supports the account type
      if (newProviderName === 'shadowwire' && isMnemonicAccount(account)) {
        setProviderError('ShadowWire requires a browser wallet. Please connect using a wallet adapter.');
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

      if (newProviderName === 'privacy-cash') {
        // For PrivacyCash, reuse cached provider to avoid re-signing
        let pcProvider = cachedPrivacyCashProvider;

        if (!pcProvider) {
          // First time - create and cache the provider (this triggers signing once)
          pcProvider = createProvider(account, 'privacy-cash', 'SOL') as PrivacyCashProvider | null;
          if (pcProvider) {
            setCachedPrivacyCashProvider(pcProvider);
          }
        }

        if (pcProvider) {
          // Reuse the same provider instance - use setAsset to change asset
          pcProvider.setAsset(newFundAsset as PrivacyCashAsset);
          setFundProvider(pcProvider);
          setWithdrawProvider(pcProvider);
          setSolProvider(pcProvider);
        }
      } else {
        // For ShadowWire, create new providers (they don't require signing)
        const newFundProvider = createProvider(account, newProviderName, newFundAsset);
        const newWithdrawProvider = createProvider(account, newProviderName, newWithdrawAsset);
        const newSolProvider = createProvider(account, newProviderName, 'SOL') as ShadowWireProvider | null;
        setFundProvider(newFundProvider);
        setWithdrawProvider(newWithdrawProvider);
        setSolProvider(newSolProvider);
        setShadowWireProvider(newSolProvider);
      }
    }
  };

  const handleFundAssetChange = (newAsset: string) => {
    setFundAsset(newAsset);

    // Cross-chain assets (format: SYMBOL:CHAIN) don't need a provider
    // They use NEAR Intents directly
    if (newAsset.includes(':')) {
      setWalletBalance(0n);
      return;
    }

    if (account) {
      // For PrivacyCash, reuse the cached provider and just change the asset
      // This avoids requiring a new signature
      if (selectedProvider === 'privacy-cash' && cachedPrivacyCashProvider) {
        cachedPrivacyCashProvider.setAsset(newAsset as PrivacyCashAsset);
        setFundProvider(cachedPrivacyCashProvider);
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
    void wallet.disconnect();
    setAccount(null);
    setAddress('');
    setSelectedProvider('shadowwire'); // Reset to ShadowWire so next login doesn't trigger PrivacyCash signing
    setFundProvider(null);
    setWithdrawProvider(null);
    setSolProvider(null);
    setShadowWireProvider(null);
    setCachedPrivacyCashProvider(null); // Clear cached provider so next login starts fresh
    setPrivateBalance(0n);
    setShadowWireBalance(null);
    setPrivacyCashBalance(null);
    setWalletBalance(0n);
    setSolWalletBalance(0n);
    setProviderError(null);
  };

  // Fetch wallet balance for fund form
  const refreshWalletBalance = useCallback(async () => {
    if (!account) return;

    setWalletBalanceLoading(true);
    try {
      // Always fetch SOL balance for top bar
      const solBalance = await account.getBalance();
      setSolWalletBalance(solBalance);

      // Skip selected asset balance fetch for cross-chain assets (not on Solana)
      if (fundAsset.includes(':')) {
        setWalletBalance(0n);
        setWalletBalanceLoading(false);
        return;
      }

      if (fundAsset === 'SOL') {
        setWalletBalance(solBalance);
      } else {
        // Fetch SPL token balance
        const walletAddress = await account.getAddress();
        const rpcUrl: string = import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        // Get mint address from ShadowWire, PrivacyCash, or NEAR Intents tokens
        let mintAddress: string | undefined = (TOKEN_MINTS as Record<string, string>)[fundAsset] || (SPL_MINTS as Record<string, string>)[fundAsset];

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

        const tokenAccount = tokenAccounts.value[0];
        if (!tokenAccount) {
          setWalletBalance(0n);
        } else {
          // Parse the token account data to get balance
          const accountInfo = tokenAccount.account;
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
      // Ensure we're fetching SOL balance (PrivacyCash provider may have different asset set)
      if ('setAsset' in solProvider && typeof solProvider.setAsset === 'function') {
        solProvider.setAsset('SOL');
      }
      const balance = await solProvider.getPrivateBalance();
      setPrivateBalance(balance);

      // Update the specific provider balance based on current selection
      if (selectedProvider === 'shadowwire') {
        setShadowWireBalance(balance);
      } else if (selectedProvider === 'privacy-cash') {
        setPrivacyCashBalance(balance);
      }
    } catch (err) {
      console.error('Failed to fetch Private balance:', err);
    } finally {
      setPrivateBalanceLoading(false);
    }
  }, [solProvider, selectedProvider]);

  // Fetch balances when providers change
  useEffect(() => {
    if (account) {
      void refreshWalletBalance();
    }
  }, [account, fundAsset, refreshWalletBalance]);

  useEffect(() => {
    if (solProvider) {
      void refreshPrivateBalance();
    }
  }, [solProvider, refreshPrivateBalance]);

  // Fetch ShadowWire balance when it exists but is not selected
  useEffect(() => {
    if (shadowWireProvider && selectedProvider === 'privacy-cash') {
      shadowWireProvider.getPrivateBalance().then(setShadowWireBalance).catch(console.error);
    }
  }, [shadowWireProvider, selectedProvider]);

  // Fetch PrivacyCash balance when it exists but is not selected
  useEffect(() => {
    if (cachedPrivacyCashProvider && selectedProvider === 'shadowwire') {
      cachedPrivacyCashProvider.setAsset('SOL');
      cachedPrivacyCashProvider.getPrivateBalance().then(setPrivacyCashBalance).catch(console.error);
    }
  }, [cachedPrivacyCashProvider, selectedProvider]);

  const shortenAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  return (
    <>
      {/* Fixed top left Logo */}
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 1000,
          opacity: splashComplete ? 1 : 0,
          transition: 'opacity 0.3s ease-out 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Box
          component="img"
          src="/favicon.svg"
          alt="FUNDX"
          sx={{ width: 36, height: 36 }}
        />
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '1.6rem',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          FUNDX
        </Typography>
      </Box>

      {/* Fixed bottom left About link */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 1000,
          opacity: splashComplete ? 1 : 0,
          transition: 'opacity 0.3s ease-out 0.2s',
        }}
      >
        <Typography
          component="span"
          onClick={() => setShowAboutDialog(true)}
          sx={{
            color: 'text.secondary',
            fontSize: '0.85rem',
            cursor: 'pointer',
            '&:hover': {
              color: '#14F195',
            },
          }}
        >
          About
        </Typography>
      </Box>

      {/* About Dialog */}
      <Dialog
        open={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
        maxWidth="sm"
        PaperProps={{
          sx: {
            bgcolor: '#111111',
            backgroundImage: 'none',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            p: 2,
          },
        }}
      >
        <DialogContent>
          <Typography variant="h5" fontWeight={600} sx={{ mb: 2, background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            About FUNDX
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            This prototype enables users to seamlessly exchange assets between shielded Solana accounts and major currencies across leading blockchain networks, as well as to fund shielded Solana accounts from external blockchains. Outbound swaps from shielded accounts are executed through a streamlined, single-transaction flow.
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Inbound funding of shielded accounts involves a more complex, two-step process: first, the originating asset is swapped into the user's unshielded Solana wallet balance; subsequently, the funds can be deposited into the user's shielded balance.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            The system supports both the Privacy Cash and ShadowWire privacy protocols, providing robust privacy guarantees and interoperability across supported networks.
          </Typography>
          <Box display="flex" justifyContent="flex-end" mt={3}>
            <Button
              variant="contained"
              onClick={() => setShowAboutDialog(false)}
              sx={{
                background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
                color: '#000',
                fontWeight: 600,
                '&:hover': {
                  background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
                },
              }}
            >
              Close
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Fixed top right connect/wallet - outside scaled container */}
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          opacity: splashComplete ? 1 : 0,
          transition: 'opacity 0.3s ease-out 0.2s',
        }}
      >
        {!account ? (
          <Button
            variant="contained"
            onClick={() => setShowLoginDialog(true)}
            sx={{
              background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
              color: '#000',
              fontWeight: 600,
              transition: 'box-shadow 0.2s ease-out',
              '&:hover': {
                background: 'linear-gradient(135deg, #12D986 0%, #8739E6 100%)',
                boxShadow: '0 0 20px rgba(20, 241, 149, 0.5), 0 0 40px rgba(153, 69, 255, 0.3)',
              },
            }}
          >
            Connect
          </Button>
        ) : (
          <Box display="flex" flexDirection="column" alignItems="flex-end" gap={1.5}>
            {/* Top row: wallet info and controls */}
            <Box display="flex" alignItems="center" gap={1.5}>
              {/* Wallet Balance */}
              <Box display="flex" alignItems="baseline" gap={0.5}>
                <Typography sx={{ color: '#14F195', fontWeight: 600, fontSize: '0.9rem' }}>
                  {(Number(solWalletBalance) / 1e9).toFixed(4)} SOL
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {formatUsdValue('SOL', (Number(solWalletBalance) / 1e9).toString())}
                </Typography>
              </Box>
              <Chip
                label={shortenAddress(address)}
                size="small"
                onClick={() => void navigator.clipboard.writeText(address)}
                sx={{ fontFamily: 'monospace', cursor: 'pointer', bgcolor: '#111', fontSize: '0.75rem', height: 26 }}
                title="Click to copy"
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  void refreshWalletBalance();
                  void refreshPrivateBalance();
                }}
                disabled={walletBalanceLoading || privateBalanceLoading}
                sx={{ minWidth: 'auto', px: 1, fontSize: '0.85rem', height: 26 }}
              >
                {walletBalanceLoading || privateBalanceLoading ? '...' : '↻'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={handleLogout}
                sx={{ minWidth: 'auto', px: 1, fontSize: '0.85rem', height: 26 }}
              >
                ✕
              </Button>
            </Box>

            {/* Provider Selector */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                bgcolor: '#0a0a0a',
                borderRadius: '12px',
                p: 0.5,
                mt: 1,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Box
                onClick={() => handleProviderChange(null, 'shadowwire')}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: selectedProvider === 'shadowwire'
                    ? 'linear-gradient(135deg, rgba(20, 241, 149, 0.2) 0%, rgba(153, 69, 255, 0.2) 100%)'
                    : 'transparent',
                  border: selectedProvider === 'shadowwire'
                    ? '1px solid rgba(20, 241, 149, 0.3)'
                    : '1px solid transparent',
                  '&:hover': {
                    bgcolor: selectedProvider === 'shadowwire' ? undefined : 'rgba(255,255,255,0.05)',
                  },
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box
                    component="img"
                    src="https://www.radrlabs.io/favicon.png"
                    alt="ShadowWire"
                    sx={{ width: 32, height: 32, borderRadius: '6px' }}
                  />
                  <Box>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography
                        sx={{
                          fontWeight: 600,
                          fontSize: '1rem',
                          color: selectedProvider === 'shadowwire' ? '#14F195' : 'text.secondary',
                        }}
                      >
                        ShadowWire
                      </Typography>
                      <Tooltip
                        title={
                          <Link
                            href="https://www.radrlabs.io/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            sx={{ color: '#14F195', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                          >
                            Learn more →
                          </Link>
                        }
                        arrow
                        placement="top"
                      >
                        <Box
                          component="span"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: '1px solid',
                            borderColor: 'rgba(255,255,255,0.3)',
                            fontSize: '0.6rem',
                            color: 'rgba(255,255,255,0.4)',
                            cursor: 'help',
                            '&:hover': { borderColor: '#14F195', color: '#14F195' },
                          }}
                        >
                          ?
                        </Box>
                      </Tooltip>
                    </Box>
                    <Typography
                      sx={{
                        color: '#14F195',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                      }}
                    >
                      {shadowWireBalance !== null ? `${(Number(shadowWireBalance) / 1e9).toFixed(4)} SOL` : '...'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Box
                onClick={() => selectedProvider !== 'privacy-cash' && handleProviderChange(null, 'privacy-cash')}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: '10px',
                  cursor: selectedProvider === 'privacy-cash' ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  background: selectedProvider === 'privacy-cash'
                    ? 'linear-gradient(135deg, rgba(20, 241, 149, 0.2) 0%, rgba(153, 69, 255, 0.2) 100%)'
                    : 'transparent',
                  border: selectedProvider === 'privacy-cash'
                    ? '1px solid rgba(20, 241, 149, 0.3)'
                    : '1px solid transparent',
                  '&:hover': {
                    bgcolor: selectedProvider === 'privacy-cash' ? undefined : 'rgba(255,255,255,0.05)',
                  },
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box
                    component="img"
                    src="https://www.privacycash.org/logo.png"
                    alt="PrivacyCash"
                    sx={{ width: 32, height: 32, borderRadius: '6px' }}
                  />
                  <Box>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography
                        sx={{
                          fontWeight: 600,
                          fontSize: '1rem',
                          color: selectedProvider === 'privacy-cash' ? '#14F195' : 'text.secondary',
                        }}
                      >
                        PrivacyCash
                      </Typography>
                      <Tooltip
                        title={
                          <Link
                            href="https://www.privacycash.org/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            sx={{ color: '#14F195', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                          >
                            Learn more →
                          </Link>
                        }
                        arrow
                        placement="top"
                      >
                        <Box
                          component="span"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: '1px solid',
                            borderColor: 'rgba(255,255,255,0.3)',
                            fontSize: '0.6rem',
                            color: 'rgba(255,255,255,0.4)',
                            cursor: 'help',
                            '&:hover': { borderColor: '#14F195', color: '#14F195' },
                          }}
                        >
                          ?
                        </Box>
                      </Tooltip>
                    </Box>
                    {cachedPrivacyCashProvider ? (
                      <Typography
                        sx={{
                          color: '#14F195',
                          fontSize: '0.9rem',
                          fontWeight: 500,
                        }}
                      >
                        {privacyCashBalance !== null ? `${(Number(privacyCashBalance) / 1e9).toFixed(4)} SOL` : '...'}
                      </Typography>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProviderChange(null, 'privacy-cash');
                        }}
                        sx={{
                          fontSize: '0.75rem',
                          py: 0,
                          px: 1,
                          minWidth: 'auto',
                          borderColor: '#9945FF',
                          color: '#9945FF',
                          '&:hover': {
                            borderColor: '#9945FF',
                            bgcolor: 'rgba(153, 69, 255, 0.1)',
                          },
                        }}
                      >
                        Connect
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* Scaled main content */}
      <Box
        sx={{
          transform: 'scale(0.8)',
          transformOrigin: 'top center',
          height: 'fit-content',
          opacity: splashComplete ? 1 : 0,
          transition: 'opacity 0.3s ease-out 0.3s',
        }}
      >
        <Container maxWidth="lg" sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          pt: 4,
          pb: 2
        }}>
        {/* Title - hides when progress is visible */}
        <Box
          sx={{
            height: progressVisible ? 0 : 120,
            mt: progressVisible ? '10px' : 6,
            mb: progressVisible ? 0 : 4,
            opacity: progressVisible ? 0 : 1,
            overflow: 'hidden',
            transition: 'height 1s ease-out, margin-top 1s ease-out, margin-bottom 1s ease-out, opacity 1s ease-out',
          }}
        >
          <Box textAlign="center">
            <Typography
              variant="h2"
              component="h1"
              fontWeight={800}
              sx={{
                background: 'linear-gradient(135deg, #14F195 0%, #9945FF 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 1,
                letterSpacing: '-0.02em',
                filter: 'drop-shadow(0 0 20px rgba(20, 241, 149, 0.5)) drop-shadow(0 0 40px rgba(153, 69, 255, 0.3))',
              }}
            >
              Fund privately
            </Typography>
            <Typography
              variant="h6"
              color="text.secondary"
              fontWeight={400}
            >
              Any chain. Zero trace.
            </Typography>
          </Box>
        </Box>

      {/* Login Dialog - positioned on right */}
      <Dialog
        open={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        maxWidth={false}
        sx={{
          '& .MuiDialog-container': {
            justifyContent: 'flex-end',
            alignItems: 'flex-start',
          },
        }}
        PaperProps={{
          sx: {
            bgcolor: '#111111',
            backgroundImage: 'none',
            borderRadius: '32px',
            border: '1px solid rgba(255,255,255,0.1)',
            m: 2,
            mt: 2,
            width: 360,
            height: 'auto',
            maxHeight: '95vh',
          },
        }}
      >
        <DialogContent sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
          <LoginForm
            onLogin={(acc) => {
              handleLogin(acc);
              setShowLoginDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {providerError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {providerError}
        </Alert>
      )}

      {/* Forms */}
      <Grid container spacing={3} sx={{ mt: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FundForm
            account={account}
            provider={fundProvider}
            solProvider={solProvider}
            providerName={selectedProvider}
            onSuccess={() => setTimeout(() => {
              void refreshPrivateBalance();
              void refreshWalletBalance();
            }, 10000)}
            asset={fundAsset}
            decimals={getDecimals(fundAsset)}
            availableAssets={availableAssets}
            onAssetChange={handleFundAssetChange}
            formatUsdValue={formatUsdValue}
            nearIntentsTokens={nearIntentsTokens}
            onConnectClick={() => setShowLoginDialog(true)}
            walletBalance={walletBalance}
            walletBalanceLoading={walletBalanceLoading}
            onProgressVisibleChange={handleProgressVisibleChange}
            onSwapComplete={() => {
              void refreshWalletBalance();
              void refreshPrivateBalance();
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TransferForm
            account={account}
            provider={withdrawProvider}
            privateBalance={privateBalance}
            privateBalanceLoading={privateBalanceLoading}
            onSuccess={() => setTimeout(() => {
              void refreshPrivateBalance();
              void refreshWalletBalance();
            }, 10000)}
            asset={withdrawAsset}
            decimals={getDecimals(withdrawAsset)}
            availableAssets={availableAssets}
            onAssetChange={handleWithdrawAssetChange}
            formatUsdValue={formatUsdValue}
            convertAmount={convertAmount}
            nearIntentsTokens={nearIntentsTokens}
            pricesLoading={pricesLoading}
            onConnectClick={() => setShowLoginDialog(true)}
            onProgressVisibleChange={handleProgressVisibleChange}
          />
        </Grid>
      </Grid>
    </Container>
    </Box>
    </>
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
