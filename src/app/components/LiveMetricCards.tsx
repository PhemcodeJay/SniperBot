// LiveMetricCards.tsx
import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Activity,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface MetricCardProps {
  id: string;
  title: string;
  value: string;
  subValue?: string;
  change?: string;
  changePositive?: boolean;
  icon: React.ElementType;
  variant?: 'default' | 'positive' | 'negative' | 'warning';
  span?: 1 | 2;
  mono?: boolean;
}

interface LiveMetrics {
  equity: { value: number; balance: number; unrealized: number };
  pnl: { daily: number; pct: number };
  winrate: { rate: number; wins: number; losses: number; total: number };
  heat: { pct: number; positions: number; max: number };
  sharpe: { ratio: number; sortino: number };
  drawdown: { used: number; limit: number; remaining: number };
}

function MetricCard({
  title,
  value,
  subValue,
  change,
  changePositive,
  icon: Icon,
  variant = 'default',
  span = 1,
  mono = false,
}: MetricCardProps) {
  const variantBorder =
    variant === 'positive' ? 'border-positive/30 glow-primary'
      : variant === 'negative' ? 'border-negative/30 glow-negative'
      : variant === 'warning' ? 'border-warning/30 glow-warning' : 'border-border';

  const iconBg =
    variant === 'positive' ? 'bg-positive-subtle text-positive'
      : variant === 'negative' ? 'bg-negative-subtle text-negative'
      : variant === 'warning' ? 'bg-warning-subtle text-warning' : 'bg-muted text-muted-foreground';

  const valueColor =
    variant === 'positive' ? 'text-positive'
      : variant === 'negative' ? 'text-negative'
      : variant === 'warning' ? 'text-warning' : 'text-foreground';

  return (
    <div
      className={`
        card-surface p-5 flex flex-col gap-3
        ${variantBorder}
        ${span === 2 ? 'col-span-2' : ''}
        hover:border-primary/20 transition-colors duration-200
      `}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon size={15} />
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p
            className={`text-2xl font-bold font-tabular leading-none ${valueColor} ${
              mono ? 'font-mono' : ''
            }`}
          >
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-1 font-tabular">
              {subValue}
            </p>
          )}
        </div>

        {change && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold font-tabular px-2 py-1 rounded-full ${
              changePositive
                ? 'bg-positive-subtle text-positive' : 'bg-negative-subtle text-negative'
            }`}
          >
            {changePositive ? (
              <TrendingUp size={11} />
            ) : (
              <TrendingDown size={11} />
            )}
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveMetricCards() {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      // Fetch real data from Bybit
      const [tickerResponse, walletResponse] = await Promise.all([
        fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
        // In real app, you'd need authenticated wallet endpoint
        // For demo, we'll use public data
      ]);

      const tickerData = await tickerResponse.json();
      
      if (tickerData.retCode === 0 && tickerData.result?.list) {
        const ticker = tickerData.result.list[0];
        const price = parseFloat(ticker.lastPrice);
        const change24h = parseFloat(ticker.price24hPcnt) * 100;
        const volume = parseFloat(ticker.volume24h);
        
        // Simulate account metrics based on market data
        const baseEquity = 24831.50;
        const dailyPnl = baseEquity * (change24h / 100) * 0.3;
        
        setMetrics({
          equity: {
            value: baseEquity + dailyPnl,
            balance: 24190,
            unrealized: dailyPnl,
          },
          pnl: {
            daily: dailyPnl,
            pct: (dailyPnl / 24190) * 100,
          },
          winrate: {
            rate: 73.3,
            wins: 11,
            losses: 4,
            total: 15,
          },
          heat: {
            pct: 4.2,
            positions: 3,
            max: 5,
          },
          sharpe: {
            ratio: 2.34,
            sortino: 3.12,
          },
          drawdown: {
            used: 1.2,
            limit: 5.0,
            remaining: 3.8,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card-surface p-5 flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ))}
      </div>
    );
  }

  const metricData: MetricCardProps[] = [
    {
      id: 'metric-equity',
      title: 'Account Equity',
      value: `$${metrics.equity.value.toFixed(2)}`,
      subValue: `Balance: $${metrics.equity.balance.toFixed(2)} · Unrealized: ${metrics.equity.unrealized >= 0 ? '+' : ''}$${metrics.equity.unrealized.toFixed(2)}`,
      change: `${(metrics.equity.value / metrics.equity.balance * 100 - 100).toFixed(2)}%`,
      changePositive: metrics.equity.value >= metrics.equity.balance,
      icon: DollarSign,
      variant: metrics.equity.value >= metrics.equity.balance ? 'positive' : 'negative',
      span: 2,
      mono: true,
    },
    {
      id: 'metric-pnl',
      title: "Today's P&L",
      value: `${metrics.pnl.daily >= 0 ? '+' : ''}$${metrics.pnl.daily.toFixed(2)}`,
      subValue: `${metrics.pnl.pct >= 0 ? '+' : ''}${metrics.pnl.pct.toFixed(2)}% vs open balance`,
      change: `${metrics.pnl.pct >= 0 ? '+' : ''}${metrics.pnl.pct.toFixed(2)}%`,
      changePositive: metrics.pnl.daily >= 0,
      icon: TrendingUp,
      variant: metrics.pnl.daily >= 0 ? 'positive' : 'negative',
      mono: true,
    },
    {
      id: 'metric-winrate',
      title: 'Win Rate (Today)',
      value: `${metrics.winrate.rate}%`,
      subValue: `${metrics.winrate.wins} wins · ${metrics.winrate.losses} losses · ${metrics.winrate.total} trades`,
      change: `+${(metrics.winrate.rate - 70).toFixed(1)}%`,
      changePositive: true,
      icon: Percent,
      variant: 'positive',
    },
    {
      id: 'metric-heat',
      title: 'Portfolio Heat',
      value: `${metrics.heat.pct}%`,
      subValue: `${metrics.heat.positions} open positions · Max ${metrics.heat.max}%`,
      change: `${Math.round((metrics.heat.pct / metrics.heat.max) * 100)}% of limit`,
      changePositive: false,
      icon: ShieldAlert,
      variant: 'warning',
    },
    {
      id: 'metric-sharpe',
      title: 'Sharpe Ratio (30d)',
      value: `${metrics.sharpe.ratio.toFixed(2)}`,
      subValue: `Target > 2.0 · Sortino: ${metrics.sharpe.sortino.toFixed(2)}`,
      change: `+${(metrics.sharpe.ratio - 2.16).toFixed(2)}`,
      changePositive: true,
      icon: Activity,
      variant: 'positive',
    },
    {
      id: 'metric-drawdown',
      title: 'Daily Loss Used',
      value: `${metrics.drawdown.used}%`,
      subValue: `Limit: ${metrics.drawdown.limit}% · Remaining: ${metrics.drawdown.remaining}%`,
      change: `${Math.round((metrics.drawdown.used / metrics.drawdown.limit) * 100)}% used`,
      changePositive: metrics.drawdown.used < metrics.drawdown.limit / 2,
      icon: TrendingDown,
      variant: metrics.drawdown.used > metrics.drawdown.limit * 0.7 ? 'warning' : 'default',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
      {metricData.map((m) => (
        <MetricCard key={m.id} {...m} />
      ))}
    </div>
  );
}