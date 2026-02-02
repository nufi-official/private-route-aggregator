import { useState, useEffect, useCallback } from 'react';
import { OneClickApi, type SwapApiAsset } from '@privacy-router-sdk/near-intents';

type TokenPrices = Record<string, number>;

// CoinGecko ID mapping for common tokens
const COINGECKO_IDS: Record<string, string> = {
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  BONK: 'bonk',
  JUP: 'jupiter-exchange-solana',
  RAY: 'raydium',
  ORCA: 'orca',
  MNGO: 'mango-markets',
  SRM: 'serum',
  STEP: 'step-finance',
};

async function fetchFromCoinGecko(): Promise<TokenPrices> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  // console.log('[useTokenPrices] Fetching from CoinGecko:', url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data = await response.json() as Record<string, { usd: number }>;
  // console.log('[useTokenPrices] CoinGecko response:', data);

  // Map back to symbols
  const priceMap: TokenPrices = {};
  for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
    if (data[geckoId]?.usd) {
      priceMap[symbol] = data[geckoId].usd;
    }
  }

  // console.log('[useTokenPrices] Price map:', priceMap);
  return priceMap;
}

async function fetchFromNearIntents(jwtToken: string): Promise<{ prices: TokenPrices; tokens: SwapApiAsset[] }> {
  const api = OneClickApi({ jwtToken });
  const tokenList = await api.getTokens();

  // Build price map by symbol
  const priceMap: TokenPrices = {};
  for (const token of tokenList) {
    if (token.symbol && token.price) {
      // Prefer Solana blockchain prices
      if (!priceMap[token.symbol] || token.blockchain === 'sol') {
        priceMap[token.symbol] = token.price;
      }
    }
  }

  return { prices: priceMap, tokens: tokenList };
}

export function useTokenPrices() {
  const [prices, setPrices] = useState<TokenPrices>({});
  const [tokens, setTokens] = useState<SwapApiAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'near-intents' | 'coingecko' | null>(null);

  const fetchPrices = useCallback(async () => {
    // console.log('[useTokenPrices] fetchPrices called');
    setLoading(true);
    setError(null);

    // Try NEAR Intents first if JWT is configured
    const jwtToken = import.meta.env.VITE_NEAR_INTENTS_JWT_TOKEN as string | undefined;
    // console.log('[useTokenPrices] JWT token configured:', !!jwtToken);

    if (jwtToken) {
      // console.log('[useTokenPrices] Trying NEAR Intents...');
      try {
        const result = await fetchFromNearIntents(jwtToken);
        // console.log('[useTokenPrices] NEAR Intents success:', result.prices);
        setPrices(result.prices);
        setTokens(result.tokens);
        setSource('near-intents');
        setLoading(false);
        return;
      } catch (err) {
        console.warn('[useTokenPrices] NEAR Intents API failed, falling back to CoinGecko:', err);
      }
    } else {
      // console.log('[useTokenPrices] No JWT token, using CoinGecko directly');
    }

    // Fallback to CoinGecko
    try {
      const priceMap = await fetchFromCoinGecko();
      // console.log('[useTokenPrices] Setting prices from CoinGecko:', priceMap);
      setPrices(priceMap);
      setTokens([]);
      setSource('coingecko');
    } catch (err) {
      console.error('[useTokenPrices] Failed to fetch token prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // console.log('[useTokenPrices] useEffect running, fetching prices...');
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
    // console.log('[useTokenPrices] formatUsdValue called:', { symbol, amount, price, allPrices: prices });
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
  }, [getPrice, prices]);

  // Convert amount from one token to another using USD prices
  const convertAmount = useCallback((fromSymbol: string, toSymbol: string, amount: string): string | null => {
    const fromPrice = getPrice(fromSymbol);
    const toPrice = getPrice(toSymbol);
    if (fromPrice === null || toPrice === null || !amount || isNaN(parseFloat(amount)) || toPrice === 0) {
      return null;
    }
    const usdValue = parseFloat(amount) * fromPrice;
    const converted = usdValue / toPrice;
    return converted.toFixed(6);
  }, [getPrice]);

  return {
    prices,
    tokens,
    loading,
    error,
    source,
    getPrice,
    formatUsdValue,
    convertAmount,
    refresh: fetchPrices,
  };
}
