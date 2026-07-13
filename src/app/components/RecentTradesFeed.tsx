// RecentTradesFeed.tsx
import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Target, Clock, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

interface Trade {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  outcome: 'tp1_hit' | 'tp2_hit' | 'sl_hit' | 'expired';
  pnl: number;
  pnlPct: number;
  holdMins: number;
  confidence: number;
  closedAt: string;
}

const OUTCOME_ICON = {
  tp1_hit: CheckCircle2,
  tp2_hit: Target,
  sl_hit: XCircle,
  expired: Clock,
};

const OUTCOME_COLOR = {
  tp1_hit: 'text-positive',
  tp2_hit: 'text-positive',
  sl_hit: 'text-negative',
  expired: 'text-muted-foreground',
};

export default function RecentTradesFeed() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrades = async () => {
    try {
      // In a real app, fetch from your backend
      // For demo, generate realistic trade data
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
      const outcomes: Trade['outcome'][] = ['tp1_hit', 'tp2_hit', 'sl_hit', 'expired'];
      
      const generatedTrades: Trade[] = [];
      const now = new Date();
      
      for (let i = 0; i < 7; i++) {
        const time = new Date(now);
        time.setMinutes(time.getMinutes() - (i * 15 + Math.random() * 10));
        
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const direction = Math.random() > 0.4 ? 'long' : 'short';
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        const pnl = (Math.random() * 80 - 20) * (outcome === 'sl_hit' ? -1 : 1);
        const pnlPct = pnl / 1000 * 100;
        
        generatedTrades.push({
          id: `trade-${symbol.toLowerCase()}-${i}`,
          symbol,
          direction,
          outcome,
          pnl,
          pnlPct,
          holdMins: Math.floor(Math.random() * 60) + 10,
          confidence: 70 + Math.random() * 25,
          closedAt: time.toLocaleTimeString(),
        });
      }
      
      // Sort by time descending
      generatedTrades.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
      setTrades(generatedTrades);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 60000);
    return () => clearInterval(interval);
  }, []);

  const wins = trades.filter(
    (t) => t.outcome === 'tp1_hit' || t.outcome === 'tp2_hit'
  ).length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  if (isLoading) {
    return (
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading trades...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Recent Trades
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {wins}/{trades.length} wins
          </span>
          <span
            className={`font-semibold font-tabular ${
              totalPnl >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}
          </span>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <p className="text-sm font-semibold text-foreground">No recent trades</p>
          <p className="text-xs text-muted-foreground mt-1">Trades will appear here as they execute</p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs" aria-label="Recent trades">
            <thead>
              <tr className="border-b border-border/50">
                {['Time', 'Symbol', 'Dir.', 'Outcome', 'P&L', 'Hold', 'Conf.'].map(
                  (h, i) => (
                    <th
                      key={`th-recent-${i}`}
                      className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const Icon = OUTCOME_ICON[trade.outcome];
                const color = OUTCOME_COLOR[trade.outcome];
                return (
                  <tr
                    key={trade.id}
                    className="border-b border-border/30 hover:bg-muted/20 transition-colors duration-100"
                  >
                    <td className="px-4 py-2.5 font-mono text-muted-foreground font-tabular">
                      {trade.closedAt}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-foreground">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge variant={trade.direction} size="sm" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className={`flex items-center gap-1.5 ${color}`}>
                        <Icon size={12} />
                        <StatusBadge variant={trade.outcome} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-semibold font-tabular ${
                          trade.pnl >= 0 ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {trade.pnl >= 0 ? '+' : ''}${Math.abs(trade.pnl).toFixed(1)}
                      </span>
                      <span
                        className={`ml-1 text-[10px] font-tabular ${
                          trade.pnlPct >= 0 ? 'text-positive/70' : 'text-negative/70'
                        }`}
                      >
                        ({trade.pnlPct >= 0 ? '+' : ''}
                        {trade.pnlPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground font-tabular">
                      {trade.holdMins}m
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-semibold font-tabular text-xs ${
                          trade.confidence >= 85
                            ? 'text-positive'
                            : trade.confidence >= 80
                            ? 'text-info' : 'text-warning'
                        }`}
                      >
                        {Math.round(trade.confidence)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}