import { useState, useEffect, useCallback } from 'react';
import { OneClickApi, type SwapApiAsset } from '@privacy-router-sdk/near-intents';

type TokenPrices = Record<string, number>;

export function useTokenPrices() {
  const [prices, setPrices] = useState<TokenPrices>({});
  const [tokens, setTokens] = useState<SwapApiAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    // Get JWT token from Vite env
    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;
    if (!jwtToken) {
      setError('VITE_NEAR_INTENTS_JWT_TOKEN not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = OneClickApi({ jwtToken });
      const tokenList = await api.getTokens();
      setTokens(tokenList);

      // Build price map by symbol
      const priceMap: TokenPrices = {};
      for (const token of tokenList) {
        // Use symbol as key, store the price
        if (token.symbol && token.price) {
          // If we already have this symbol, prefer Solana blockchain
          if (!priceMap[token.symbol] || token.blockchain === 'sol') {
            priceMap[token.symbol] = token.price;
          }
        }
      }

      setPrices(priceMap);
    } catch (err) {
      console.error('Failed to fetch token prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const getPrice = useCallback((symbol: string): number | null => {
    return prices[symbol] ?? null;
  }, [prices]);

  const formatUsdValue = useCallback((symbol: string, amount: string): string | null => {
    const price = getPrice(symbol);
    if (price === null || !amount || isNaN(parseFloat(amount))) {
      return null;
    }
    const value = parseFloat(amount) * price;
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [getPrice]);

  return {
    prices,
    tokens,
    loading,
    error,
    getPrice,
    formatUsdValue,
    refresh: fetchPrices,
  };
}
