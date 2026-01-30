import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { getAssetIcon } from '../utils/tokenIcons';

// Chain display names
const CHAIN_NAMES: Record<string, string> = {
  sol: 'Solana',
  eth: 'Ethereum',
  base: 'Base',
  arb: 'Arbitrum',
  btc: 'Bitcoin',
  near: 'NEAR',
  ton: 'TON',
  doge: 'Dogecoin',
  xrp: 'XRP',
  zec: 'Zcash',
  gnosis: 'Gnosis',
  bera: 'Berachain',
  bsc: 'BNB Chain',
  pol: 'Polygon',
  tron: 'TRON',
  sui: 'Sui',
  op: 'Optimism',
  avax: 'Avalanche',
  cardano: 'Cardano',
  ltc: 'Litecoin',
  xlayer: 'X Layer',
  monad: 'Monad',
  bch: 'Bitcoin Cash',
  starknet: 'Starknet',
};

// Popular tokens to show as quick select chips
const POPULAR_TOKENS = ['SOL', 'USDC', 'USDT', 'ETH:eth', 'BTC:btc'];

interface TokenSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: string) => void;
  availableAssets: string[];
  currentAsset: string;
}

// Get display name for an asset (just the symbol, without chain suffix)
function getAssetDisplayName(asset: string): string {
  if (asset.includes(':')) {
    return asset.split(':')[0] ?? asset;
  }
  return asset;
}

// Get chain from asset
function getAssetChain(asset: string): string {
  if (asset.includes(':')) {
    return asset.split(':')[1] ?? 'sol';
  }
  return 'sol';
}

export function TokenSelector({
  open,
  onClose,
  onSelect,
  availableAssets,
  currentAsset,
}: TokenSelectorProps) {
  const [search, setSearch] = useState('');

  // Filter and group assets
  const filteredAssets = useMemo(() => {
    const searchLower = search.toLowerCase();
    return availableAssets.filter((asset) => {
      const symbol = getAssetDisplayName(asset).toLowerCase();
      const chain = getAssetChain(asset).toLowerCase();
      const chainName = (CHAIN_NAMES[chain] ?? chain).toLowerCase();
      return (
        symbol.includes(searchLower) ||
        chain.includes(searchLower) ||
        chainName.includes(searchLower)
      );
    });
  }, [availableAssets, search]);

  // Group by chain for display
  const groupedAssets = useMemo(() => {
    const groups = new Map<string, string[]>();

    for (const asset of filteredAssets) {
      const chain = getAssetChain(asset);
      if (!groups.has(chain)) {
        groups.set(chain, []);
      }
      groups.get(chain)!.push(asset);
    }

    // Sort: Solana first, then alphabetically
    const sortedGroups = new Map<string, string[]>();
    if (groups.has('sol')) {
      sortedGroups.set('sol', groups.get('sol')!);
    }
    const otherChains = [...groups.keys()]
      .filter((c) => c !== 'sol')
      .sort((a, b) => (CHAIN_NAMES[a] ?? a).localeCompare(CHAIN_NAMES[b] ?? b));
    for (const chain of otherChains) {
      sortedGroups.set(chain, groups.get(chain)!);
    }

    return sortedGroups;
  }, [filteredAssets]);

  // Popular tokens that are available
  const popularAvailable = POPULAR_TOKENS.filter((t) =>
    availableAssets.includes(t)
  );

  const handleSelect = (asset: string) => {
    onSelect(asset);
    onClose();
    setSearch('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#111111',
          backgroundImage: 'none',
          borderRadius: '32px',
          height: '70vh',
          maxHeight: 600,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Select a token
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search field */}
        <TextField
          fullWidth
          placeholder="Search tokens"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              bgcolor: '#000000',
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />

        {/* Popular tokens chips */}
        {popularAvailable.length > 0 && (
          <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
            {popularAvailable.map((asset) => (
              <Chip
                key={asset}
                label={getAssetDisplayName(asset)}
                onClick={() => handleSelect(asset)}
                sx={{
                  bgcolor: currentAsset === asset ? 'primary.main' : '#1a1a1a',
                  color: currentAsset === asset ? '#000' : '#fff',
                  fontWeight: 600,
                  '&:hover': {
                    bgcolor: currentAsset === asset ? 'primary.dark' : '#2a2a2a',
                  },
                }}
              />
            ))}
          </Box>
        )}

        {/* Token list */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            '&::-webkit-scrollbar': {
              width: 6,
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'rgba(255,255,255,0.2)',
              borderRadius: 3,
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.3)',
              },
            },
          }}
        >
          {Array.from(groupedAssets.entries()).map(([chain, assets]) => (
            <Box key={chain} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 1, px: 1 }}
              >
                {CHAIN_NAMES[chain] ?? chain.toUpperCase()}
              </Typography>
              {assets.map((asset) => {
                const symbol = getAssetDisplayName(asset);
                const isSelected = asset === currentAsset;
                return (
                  <Box
                    key={asset}
                    onClick={() => handleSelect(asset)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      p: 1.5,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'rgba(20, 241, 149, 0.1)' : 'transparent',
                      '&:hover': {
                        bgcolor: isSelected
                          ? 'rgba(20, 241, 149, 0.15)'
                          : 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                  >
                    {/* Token icon */}
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '14px',
                        color: 'primary.main',
                        overflow: 'hidden',
                      }}
                    >
                      {getAssetIcon(asset) ? (
                        <img
                          src={getAssetIcon(asset)!}
                          alt={symbol}
                          style={{ width: 40, height: 40, objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerText = symbol.slice(0, 2);
                          }}
                        />
                      ) : (
                        symbol.slice(0, 2)
                      )}
                    </Box>
                    <Box flex={1}>
                      <Typography fontWeight={600}>{symbol}</Typography>
                      {chain !== 'sol' && (
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            bgcolor: 'rgba(255,255,255,0.1)',
                            borderRadius: '6px',
                            px: 0.75,
                            py: 0.25,
                            mt: 0.5,
                          }}
                        >
                          <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary' }}>
                            {CHAIN_NAMES[chain] ?? chain.toUpperCase()}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    {isSelected && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
