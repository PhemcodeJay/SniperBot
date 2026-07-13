// OpenPositionsTable.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';

interface Position {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  atr: number;
  confidence: number;
  regime: 'trending' | 'ranging' | 'volatile';
  openedAt: string;
  holdMins: number;
}

type SortKey = 'symbol' | 'unrealizedPnl' | 'confidence' | 'holdMins';

export default function OpenPositionsTable() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('unrealizedPnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [portfolioHeat, setPortfolioHeat] = useState(4.2);

  const fetchPositions = async () => {
    try {
      // In a real app, you'd fetch from your backend
      // For demo, fetch market data to simulate positions
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const positionData: Position[] = [];
      
      for (const symbol of symbols) {
        const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
        const data = await response.json();
        
        if (data.retCode === 0 && data.result?.list) {
          const ticker = data.result.list[0];
          const price = parseFloat(ticker.lastPrice);
          const change = parseFloat(ticker.price24hPcnt);
          
          // Simulate position data
          const isLong = Math.random() > 0.3;
          const entryPrice = isLong ? price * (1 - Math.random() * 0.01) : price * (1 + Math.random() * 0.01);
          const pnl = (price - entryPrice) / entryPrice * 100 * (isLong ? 1 : -1);
          
          positionData.push({
            id: `pos-${symbol.toLowerCase()}-${Date.now()}`,
            symbol,
            direction: isLong ? 'long' : 'short',
            entryPrice,
            currentPrice: price,
            size: parseFloat((0.01 + Math.random() * 0.05).toFixed(3)),
            leverage: 5,
            unrealizedPnl: pnl * 100,
            unrealizedPct: pnl,
            stopLoss: isLong ? price * 0.985 : price * 1.015,
            takeProfit1: isLong ? price * 1.025 : price * 0.975,
            takeProfit2: isLong ? price * 1.05 : price * 0.95,
            atr: price * 0.01,
            confidence: 75 + Math.random() * 20,
            regime: Math.random() > 0.5 ? 'trending' : 'ranging',
            openedAt: new Date(Date.now() - Math.random() * 7200000).toLocaleTimeString(),
            holdMins: Math.floor(Math.random() * 120) + 10,
          });
        }
      }
      
      setPositions(positionData);
      setPortfolioHeat(3 + Math.random() * 3);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const handleCloseConfirm = () => {
    if (!closeTarget) return;
    toast.success(`Position closed — ${closeTarget.symbol}`, {
      description: `Market order submitted. Slippage report pending.`,
    });
    setPositions(prev => prev.filter(p => p.id !== closeTarget.id));
    setCloseTarget(null);
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="inline-flex flex-col ml-1 opacity-50">
      <ChevronUp
        size={9}
        className={sortKey === col && sortDir === 'asc' ? 'opacity-100 text-primary' : ''}
      />
      <ChevronDown
        size={9}
        className={sortKey === col && sortDir === 'desc' ? 'opacity-100 text-primary' : ''}
        style={{ marginTop: '-3px' }}
      />
    </span>
  );

  if (isLoading) {
    return (
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading positions...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Open Positions
            </h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-positive-subtle text-positive border border-positive/20">
              {positions.length} active
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Portfolio Heat:</span>
            <span className="text-warning font-semibold font-tabular">{portfolioHeat.toFixed(1)}%</span>
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-warning transition-all duration-500"
                style={{ width: `${(portfolioHeat / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm font-semibold text-foreground">No open positions</p>
            <p className="text-xs text-muted-foreground mt-1">Waiting for new signals to execute</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm" aria-label="Open positions table">
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: 'Symbol', key: 'symbol' as SortKey, sortable: true },
                    { label: 'Dir.', key: null, sortable: false },
                    { label: 'Entry', key: null, sortable: false },
                    { label: 'Current', key: null, sortable: false },
                    { label: 'Size', key: null, sortable: false },
                    { label: 'Unreal. P&L', key: 'unrealizedPnl' as SortKey, sortable: true },
                    { label: 'SL / TP1 / TP2', key: null, sortable: false },
                    { label: 'Confidence', key: 'confidence' as SortKey, sortable: true },
                    { label: 'Regime', key: null, sortable: false },
                    { label: 'Hold', key: 'holdMins' as SortKey, sortable: true },
                    { label: '', key: null, sortable: false },
                  ].map((col, i) => (
                    <th
                      key={`th-pos-${i}`}
                      className={`
                        px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground
                        ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}
                      `}
                      onClick={col.sortable && col.key ? () => handleSort(col.key!) : undefined}
                    >
                      {col.label}
                      {col.sortable && col.key && <SortIcon col={col.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((pos) => (
                  <tr
                    key={pos.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center">
                          <span className="text-[9px] font-bold text-foreground">
                            {pos.symbol.replace('USDT', '').slice(0, 3)}
                          </span>
                        </div>
                        <span className="font-semibold text-foreground text-xs font-mono">
                          {pos.symbol}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={pos.direction} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      ${pos.entryPrice.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-tabular">
                      <span
                        className={
                          pos.currentPrice > pos.entryPrice
                            ? 'text-positive' : 'text-negative'
                        }
                      >
                        ${pos.currentPrice.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      {pos.size} · {pos.leverage}x
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {pos.unrealizedPnl >= 0 ? (
                          <TrendingUp size={12} className="text-positive" />
                        ) : (
                          <TrendingDown size={12} className="text-negative" />
                        )}
                        <div>
                          <p
                            className={`font-semibold font-tabular text-xs ${
                              pos.unrealizedPnl >= 0 ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {pos.unrealizedPnl >= 0 ? '+' : ''}$
                            {Math.abs(pos.unrealizedPnl).toFixed(2)}
                          </p>
                          <p
                            className={`text-[10px] font-tabular ${
                              pos.unrealizedPct >= 0 ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {pos.unrealizedPct >= 0 ? '+' : ''}
                            {pos.unrealizedPct.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[10px] font-mono font-tabular space-y-0.5">
                        <div className="flex gap-1 items-center">
                          <span className="text-negative w-6">SL</span>
                          <span className="text-muted-foreground">
                            ${pos.stopLoss.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T1</span>
                          <span className="text-muted-foreground">
                            ${pos.takeProfit1.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T2</span>
                          <span className="text-muted-foreground">
                            ${pos.takeProfit2.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pos.confidence >= 85
                                ? 'bg-positive'
                                : pos.confidence >= 75
                                ? 'bg-info' : 'bg-warning'
                            }`}
                            style={{ width: `${pos.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold font-tabular text-foreground w-8">
                          {Math.round(pos.confidence)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={pos.regime} size="sm" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      {pos.holdMins}m
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setCloseTarget(pos)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md hover:bg-negative-subtle text-muted-foreground hover:text-negative active:scale-95"
                        title={`Close ${pos.symbol} position — market order`}
                        aria-label={`Close ${pos.symbol} position`}
                      >
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!closeTarget}
        title={`Close ${closeTarget?.symbol} Position`}
        description={`This will submit a market order to close your ${closeTarget?.direction?.toUpperCase()} position in ${closeTarget?.symbol}. Current unrealized P&L: ${closeTarget?.unrealizedPnl && closeTarget.unrealizedPnl >= 0 ? '+' : ''}$${Math.abs(closeTarget?.unrealizedPnl ?? 0).toFixed(2)}. This action cannot be undone.`}
        confirmLabel="Close Position"
        variant="danger"
        onConfirm={handleCloseConfirm}
        onCancel={() => setCloseTarget(null)}
      />
    </>
  );
}