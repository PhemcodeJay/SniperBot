// InstrumentPerformanceTable.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

interface InstrumentRow {
  id: string;
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  netPnl: number;
  avgHoldMins: number;
  bestTrade: number;
  worstTrade: number;
  regime: 'trending' | 'ranging' | 'volatile';
  price: number;
  change24h: number;
}

type SortKey = keyof InstrumentRow;

export default function InstrumentPerformanceTable() {
  const [data, setData] = useState<InstrumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('netPnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT'];
      const promises = symbols.map(s => 
        fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`)
          .then(r => r.json())
      );
      
      const results = await Promise.all(promises);
      
      const instrumentData: InstrumentRow[] = results
        .map((result: any) => {
          if (result.retCode === 0 && result.result?.list?.length > 0) {
            const ticker = result.result.list[0];
            const price = parseFloat(ticker.lastPrice);
            const change24h = parseFloat(ticker.price24hPcnt) * 100;
            const volume = parseFloat(ticker.volume24h);
            
            // Simulate trade metrics based on market data
            const tradeCount = Math.floor(Math.random() * 8) + 2;
            const winRate = 50 + Math.abs(change24h) * 2 + Math.random() * 10;
            const wins = Math.round(tradeCount * winRate / 100);
            const losses = tradeCount - wins;
            const avgProfit = Math.abs(change24h) * 2 + Math.random() * 30;
            const avgLoss = 20 + Math.random() * 20;
            const netPnl = wins * avgProfit - losses * avgLoss;
            
            return {
              id: `inst-${ticker.symbol.toLowerCase()}`,
              symbol: ticker.symbol,
              trades: tradeCount,
              wins,
              losses,
              winRate: Math.round(winRate * 10) / 10,
              grossProfit: Math.round(wins * avgProfit * 10) / 10,
              grossLoss: Math.round(losses * avgLoss * 10) / 10,
              profitFactor: losses > 0 ? Math.round((wins * avgProfit / (losses * avgLoss)) * 100) / 100 : 3.0,
              avgWin: Math.round(avgProfit * 10) / 10,
              avgLoss: Math.round(avgLoss * 10) / 10,
              netPnl: Math.round(netPnl * 10) / 10,
              avgHoldMins: Math.round(20 + Math.random() * 40),
              bestTrade: Math.round((avgProfit * 2 + Math.random() * 20) * 10) / 10,
              worstTrade: -Math.round((avgLoss * 1.5 + Math.random() * 10) * 10) / 10,
              regime: Math.abs(change24h) > 3 ? 'trending' : Math.abs(change24h) > 1.5 ? 'ranging' : 'volatile',
              price: price,
              change24h: change24h,
            };
          }
          return null;
        })
        .filter((item): item is InstrumentRow => item !== null);
      
      setData(instrumentData);
    } catch (error) {
      console.error('Failed to fetch instrument data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
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

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="inline-flex flex-col ml-1 opacity-40">
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
          <span className="ml-3 text-sm text-muted-foreground">Loading instrument data...</span>
        </div>
      </div>
    );
  }

  const columns: { label: string; key: SortKey; align?: 'right' }[] = [
    { label: 'Symbol', key: 'symbol' },
    { label: 'Trades', key: 'trades', align: 'right' },
    { label: 'Win Rate', key: 'winRate', align: 'right' },
    { label: 'Profit Factor', key: 'profitFactor', align: 'right' },
    { label: 'Net P&L', key: 'netPnl', align: 'right' },
    { label: 'Avg Win', key: 'avgWin', align: 'right' },
    { label: 'Avg Loss', key: 'avgLoss', align: 'right' },
    { label: 'Avg Hold', key: 'avgHoldMins', align: 'right' },
    { label: 'Best', key: 'bestTrade', align: 'right' },
    { label: 'Worst', key: 'worstTrade', align: 'right' },
    { label: 'Regime', key: 'regime' },
  ];

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Instrument Performance Breakdown
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.length} symbols traded · click column headers to sort
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Total Net P&L</p>
          <p className={`text-sm font-bold font-tabular ${data.reduce((s, r) => s + r.netPnl, 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
            {data.reduce((s, r) => s + r.netPnl, 0) >= 0 ? '+' : ''}${data.reduce((s, r) => s + r.netPnl, 0).toFixed(1)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm" aria-label="Instrument performance table">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={`th-inst-${col.key}`}
                  className={`
                    px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground
                    cursor-pointer hover:text-foreground select-none transition-colors
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                  `}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon col={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/40 hover:bg-muted/25 transition-colors duration-100"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-foreground">
                        {row.symbol.replace('USDT', '').slice(0, 3)}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground text-xs font-mono">
                      {row.symbol}
                    </span>
                    <span className={`text-[9px] ${row.change24h >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {row.change24h >= 0 ? '+' : ''}{row.change24h.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-muted-foreground">
                  <span className="text-positive">{row.wins}W</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-negative">{row.losses}L</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.winRate >= 70
                            ? 'bg-positive'
                            : row.winRate >= 60
                            ? 'bg-warning' : 'bg-negative'
                        }`}
                        style={{ width: `${row.winRate}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs font-semibold font-tabular w-10 ${
                        row.winRate >= 70
                          ? 'text-positive'
                          : row.winRate >= 60
                          ? 'text-warning' : 'text-negative'
                      }`}
                    >
                      {row.winRate.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs">
                  <span
                    className={`font-semibold ${
                      row.profitFactor >= 2
                        ? 'text-positive'
                        : row.profitFactor >= 1.5
                        ? 'text-warning' : 'text-negative'
                    }`}
                  >
                    {row.profitFactor.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs">
                  <span
                    className={`font-semibold ${
                      row.netPnl >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {row.netPnl >= 0 ? '+' : ''}${row.netPnl.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-positive">
                  +${row.avgWin.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-negative">
                  -${row.avgLoss.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-muted-foreground">
                  {row.avgHoldMins}m
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-positive">
                  +${row.bestTrade.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-tabular text-xs text-negative">
                  ${row.worstTrade.toFixed(1)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge variant={row.regime} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}