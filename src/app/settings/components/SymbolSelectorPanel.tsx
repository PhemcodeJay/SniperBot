// app/components/SymbolSelectorPanel.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, TrendingUp, Star, Loader2 } from 'lucide-react';

interface SymbolConfig {
  symbol: string;
  enabled: boolean;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  volume24h: string;
  change24h: string;
  volumeRaw: number;
}

// ============== BYBIT API CONFIG ==============
const BYBIT_BASE_URL = 'https://api.bybit.com';

// ============== API HELPERS ==============
const safeJsonParse = async (response: Response) => {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const CATEGORY_COLORS: Record<string, string> = {
  Major: 'bg-primary/10 text-primary',
  Meme: 'bg-warning-subtle text-warning',
  Alt: 'bg-info-subtle text-info',
  L2: 'bg-positive-subtle text-positive',
  DeFi: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  AI: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Gaming: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
};

const DEFAULT_SELECTED = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

const getSymbolCategory = (symbol: string): string => {
  const base = symbol.replace('USDT', '').replace('USDC', '');

  if (['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX'].includes(base)) {
    return 'Major';
  }
  if (['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'MEME'].includes(base)) {
    return 'Meme';
  }
  if (['ARB', 'OP', 'MATIC', 'BASE', 'STRK', 'MNT'].includes(base)) {
    return 'L2';
  }
  if (['UNI', 'AAVE', 'MKR', 'CRV', 'LDO', 'RUNE', 'INJ', 'JUP'].includes(base)) {
    return 'DeFi';
  }
  if (['FET', 'AGIX', 'OCEAN', 'RNDR', 'WLD', 'TAO'].includes(base)) {
    return 'AI';
  }
  if (['GALA', 'SAND', 'MANA', 'AXS', 'IMX', 'FLOW'].includes(base)) {
    return 'Gaming';
  }
  return 'Alt';
};

// ============== API FUNCTIONS ==============

// Fetch ticker data
const fetchTickers = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear`);
    const data = await safeJsonParse(response);
    if (data?.retCode === 0 && data?.result?.list) {
      return data.result.list;
    }
    return [];
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return [];
  }
};

// ============== COMPONENT ==============

export default function SymbolSelectorPanel() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const [symbols, setSymbols] = useState<SymbolConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchSymbols = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tickers = await fetchTickers();

      if (tickers.length === 0) {
        throw new Error('No symbols available');
      }

      const defaultEnabled = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

      const mappedSymbols: SymbolConfig[] = tickers
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .map((t: any) => {
          const volume = parseFloat(t.volume24h) || 0;
          const price = parseFloat(t.lastPrice) || 0;
          const change24h = parseFloat(t.price24hPcnt) * 100 || 0;

          return {
            symbol: t.symbol,
            enabled: defaultEnabled.includes(t.symbol),
            baseAsset: t.symbol.replace('USDT', ''),
            quoteAsset: 'USDT',
            price: price > 1 ? price.toFixed(2) : price.toFixed(4),
            volume24h: `$${(volume / 1e6).toFixed(1)}M`,
            change24h: `${change24h.toFixed(2)}%`,
            volumeRaw: volume,
          };
        })
        .sort((a: SymbolConfig, b: SymbolConfig) => b.volumeRaw - a.volumeRaw);

      const topSymbols = showAll ? mappedSymbols : mappedSymbols.slice(0, 50);
      setSymbols(topSymbols);
    } catch (err: any) {
      setError(err.message || 'Failed to load symbols');
      setSymbols([]);
    } finally {
      setIsLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  // Load saved selections from localStorage
  useEffect(() => {
    const savedSymbols = localStorage.getItem('selected_symbols');
    if (savedSymbols) {
      try {
        const parsed = JSON.parse(savedSymbols);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelected(parsed);
        }
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  const toggleSymbol = (symbol: string) => {
    setSaved(false);
    setSelected((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : prev.length < 20
          ? [...prev, symbol]
          : prev
    );
  };

  const handleSave = () => {
    setSaved(true);
    localStorage.setItem('selected_symbols', JSON.stringify(selected));
    setTimeout(() => setSaved(false), 2500);
  };

  const filteredSymbols = symbols.filter((s) =>
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading symbols...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-info-subtle">
          <TrendingUp size={18} className="text-info" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">Target Symbols</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {showAll ? `All ${symbols.length} pairs` : `Top 50 by volume`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] font-medium px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
          >
            {showAll ? 'Show Top 50' : 'Show All'}
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground">
            <Star size={11} className="text-warning" />
            {selected.length}/20
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-negative-subtle border border-negative/20 text-negative text-xs">
          ⚠️ {error}
          <button onClick={fetchSymbols} className="ml-2 text-blue-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 p-3 bg-muted/50 rounded-lg min-h-[44px]">
          {selected.map((sym) => (
            <span
              key={sym}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-mono font-semibold"
            >
              {sym.replace('USDT', '')}
              <button
                onClick={() => toggleSymbol(sym)}
                className="hover:text-negative transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${symbols.length} symbols...`}
          className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Symbol grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
        {filteredSymbols.length > 0 ? (
          filteredSymbols.map((item) => {
            const isSelected = selected.includes(item.symbol);
            const category = getSymbolCategory(item.symbol);
            return (
              <button
                key={item.symbol}
                onClick={() => toggleSymbol(item.symbol)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all duration-100 ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30 text-foreground'
                    : 'bg-background border-border text-secondary-foreground hover:border-primary/20 hover:bg-muted'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-primary border-primary' : 'border-border'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground truncate">
                    {item.symbol}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.baseAsset}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[category] || 'bg-muted text-muted-foreground'}`}
                  >
                    {category}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {item.volume24h}
                  </span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">
            No symbols found matching "{search}"
          </div>
        )}
      </div>

      {/* Show count */}
      <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground">
        <span>
          Showing {filteredSymbols.length} of {symbols.length} symbols
        </span>
        {!showAll && symbols.length > 50 && (
          <button onClick={() => setShowAll(true)} className="text-primary hover:underline">
            Show all {symbols.length} symbols
          </button>
        )}
      </div>

      <button
        onClick={handleSave}
        className={`mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved ? 'bg-positive text-white' : 'bg-primary hover:bg-primary/90 text-white'
        }`}
      >
        {saved
          ? '✓ Symbols Saved'
          : `Save ${selected.length} Symbol${selected.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
