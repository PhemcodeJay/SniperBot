'use client';

import React, { useState } from 'react';
import { Search, X, TrendingUp, Star } from 'lucide-react';

const ALL_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Major', volume: '$4.2B' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Major', volume: '$1.8B' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'Major', volume: '$890M' },
  { symbol: 'BNBUSDT', name: 'BNB', category: 'Major', volume: '$620M' },
  { symbol: 'XRPUSDT', name: 'XRP', category: 'Major', volume: '$540M' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', category: 'Meme', volume: '$480M' },
  { symbol: 'ADAUSDT', name: 'Cardano', category: 'Alt', volume: '$320M' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', category: 'Alt', volume: '$290M' },
  { symbol: 'LINKUSDT', name: 'Chainlink', category: 'Alt', volume: '$260M' },
  { symbol: 'DOTUSDT', name: 'Polkadot', category: 'Alt', volume: '$210M' },
  { symbol: 'MATICUSDT', name: 'Polygon', category: 'Alt', volume: '$195M' },
  { symbol: 'LTCUSDT', name: 'Litecoin', category: 'Alt', volume: '$180M' },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', category: 'Alt', volume: '$165M' },
  { symbol: 'APTUSDT', name: 'Aptos', category: 'Alt', volume: '$155M' },
  { symbol: 'ARBUSDT', name: 'Arbitrum', category: 'L2', volume: '$140M' },
  { symbol: 'OPUSDT', name: 'Optimism', category: 'L2', volume: '$130M' },
  { symbol: 'SUIUSDT', name: 'Sui', category: 'Alt', volume: '$125M' },
  { symbol: 'INJUSDT', name: 'Injective', category: 'Alt', volume: '$115M' },
  { symbol: 'SEIUSDT', name: 'Sei', category: 'Alt', volume: '$105M' },
  { symbol: 'TIAUSDT', name: 'Celestia', category: 'Alt', volume: '$98M' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Major: 'bg-primary/10 text-primary',
  Meme: 'bg-warning-subtle text-warning',
  Alt: 'bg-info-subtle text-info',
  L2: 'bg-positive-subtle text-positive',
};

const DEFAULT_SELECTED = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export default function SymbolSelectorPanel() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const filtered = ALL_SYMBOLS.filter(
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
        {filtered.map((item) => {
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
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}>
                  {item.category}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">{item.volume}</span>
              </div>
            </button>
          );
        })}
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
