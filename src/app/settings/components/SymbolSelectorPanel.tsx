// SymbolSelectorPanel.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, TrendingUp, Star, Loader2 } from 'lucide-react';

interface SymbolData {
  symbol: string;
  name: string;
  category: string;
  volume: string;
  price: string;
  change24h: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Major': 'bg-primary/10 text-primary',
  'Meme': 'bg-warning-subtle text-warning',
  'Alt': 'bg-info-subtle text-info',
  'L2': 'bg-positive-subtle text-positive',
};

const DEFAULT_SELECTED = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export default function SymbolSelectorPanel() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const [symbols, setSymbols] = useState<SymbolData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSymbols = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
        const data = await response.json();
        
        if (data.retCode === 0 && data.result?.list) {
          const tickers = data.result.list;
          
          const mappedSymbols: SymbolData[] = tickers.map((ticker: any) => {
            const volume = parseFloat(ticker.volume24h) || 0;
            const price = parseFloat(ticker.lastPrice) || 0;
            const change24h = parseFloat(ticker.price24hPcnt) * 100 || 0;
            
            let category = 'Alt';
            const symbol = ticker.symbol;
            if (['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].includes(symbol)) {
              category = 'Major';
            } else if (['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT'].includes(symbol)) {
              category = 'Meme';
            } else if (['ARBUSDT', 'OPUSDT'].includes(symbol)) {
              category = 'L2';
            }
            
            return {
              symbol: symbol,
              name: symbol.replace('USDT', '').replace('USDC', ''),
              category: category,
              volume: `$${(volume / 1e6).toFixed(1)}M`,
              price: price.toFixed(2),
              change24h: change24h.toFixed(2) + '%',
            };
          });
          
          const usdtPairs = mappedSymbols
            .filter(s => s.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume))
            .slice(0, 50);
          
          setSymbols(usdtPairs);
        } else {
          throw new Error(data.retMsg || 'Failed to fetch symbols');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load symbols');
        setSymbols([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSymbols();
  }, []);

  const filtered = symbols.filter(
    (s) =>
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (symbol: string) => {
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
    setTimeout(() => setSaved(false), 2500);
  };

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
          <p className="text-muted-foreground text-xs mt-0.5">Select up to 20 futures pairs to scan</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground">
          <Star size={11} className="text-warning" />
          {selected.length}/20
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-negative-subtle border border-negative/20 text-negative text-xs">
          ⚠️ {error}
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
              <button onClick={() => toggle(sym)} className="hover:text-negative transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbols..."
          className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Symbol grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
        {filtered.length > 0 ? (
          filtered.map((item) => {
            const isSelected = selected.includes(item.symbol);
            return (
              <button
                key={item.symbol}
                onClick={() => toggle(item.symbol)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all duration-100 ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30 text-foreground'
                    : 'bg-background border-border text-secondary-foreground hover:border-primary/20 hover:bg-muted'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-primary border-primary' : 'border-border'
                }`}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground truncate">{item.symbol}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.name}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || 'bg-muted text-muted-foreground'}`}>
                    {item.category}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">{item.volume}</span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">
            No symbols found
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        className={`mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved
            ? 'bg-positive text-white' :'bg-primary hover:bg-primary/90 text-white'
        }`}
      >
        {saved ? '✓ Symbols Saved' : `Save ${selected.length} Symbol${selected.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}