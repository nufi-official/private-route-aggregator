import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  CircularProgress,
  Chip,
} from '@mui/material';
import type { Account } from '@privacy-router-sdk/signers-core';

interface BalanceDisplayProps {
  account: Account;
  privateBalance: bigint;
  balanceLoading?: boolean;
  onLogout: () => void;
  onRefresh: () => void;
}

export function BalanceDisplay({
  account,
  privateBalance,
  balanceLoading,
  onLogout,
  onRefresh,
}: BalanceDisplayProps) {
  const [address, setAddress] = useState<string>('');
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const addr = await account.getAddress();
      setAddress(addr);

      const balance = await account.getBalance();
      setWalletBalance(balance);
    } catch (err) {
      console.error('Failed to fetch account data:', err);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData();
    onRefresh();
  };

  const formatSol = (lamports: bigint): string => {
    const sol = Number(lamports) / 1_000_000_000;
    return sol.toFixed(4);
  };

  const shortenAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Typography variant="body2" color="text.secondary">
              Connected:
            </Typography>
            {loading ? (
              <CircularProgress size={16} />
            ) : (
              <Chip
                label={shortenAddress(address)}
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(address);
                }}
                sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
                title="Click to copy full address"
              />
            )}
          </Box>

          <Box display="flex" gap={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Wallet Balance
              </Typography>
              <Typography variant="h6" fontWeight={600} color="primary">
                {loading ? '...' : `${formatSol(walletBalance)} SOL`}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary">
                Private Balance
              </Typography>
              <Typography variant="h6" fontWeight={600} color="secondary">
                {balanceLoading ? '...' : `${formatSol(privateBalance)} SOL`}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleRefresh}
            disabled={loading || balanceLoading}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={onLogout}
          >
            Logout
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
