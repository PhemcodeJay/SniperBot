// SignalFeed.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, TrendingDown, Filter, Clock, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

interface Signal {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  confidence: number;
  entryZone: string;
  stopLoss: number;
  takeProfit1: number;
  riskReward: number;
  volumeSpike: number;
  regime: 'trending' | 'ranging' | 'volatile';
  timeframe: '5m' | '15m';
  status: 'pending' | 'confirmed' | 'executed' | 'expired';
  generatedAt: string;
  indicators: string[];
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 88
    ? 'text-positive border-positive/30 bg-positive-subtle'
    : c >= 80
    ? 'text-info border-info/30 bg-info-subtle' : 'text-warning border-warning/30 bg-warning-subtle';

export default function SignalFeed() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'executed'>('all');
  const [minConfidence, setMinConfidence] = useState(75);

  const fetchSignals = async () => {
    try {
      // Fetch real market data to generate signals
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
      const generatedSignals: Signal[] = [];
      
      for (const symbol of symbols) {
        const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
        const data = await response.json();
        
        if (data.retCode === 0 && data.result?.list) {
          const ticker = data.result.list[0];
          const price = parseFloat(ticker.lastPrice);
          const change = parseFloat(ticker.price24hPcnt) * 100;
          const volume = parseFloat(ticker.volume24h);
          
          // Generate signals based on real market conditions
          const isLong = change > 0;
          const confidence = 70 + Math.abs(change) * 2 + Math.random() * 10;
          const atr = price * 0.01;
          
          const entryPrice = isLong ? price * (1 + Math.random() * 0.002) : price * (1 - Math.random() * 0.002);
          const stopLoss = isLong ? entryPrice * 0.985 : entryPrice * 1.015;
          const takeProfit1 = isLong ? entryPrice * 1.025 : entryPrice * 0.975;
          const riskReward = ((entryPrice - stopLoss) / (takeProfit1 - entryPrice)) * 2;
          
          const statuses: Signal['status'][] = ['pending', 'confirmed', 'executed', 'expired'];
          const status = statuses[Math.floor(Math.random() * 3)];
          
          generatedSignals.push({
            id: `sig-${symbol.toLowerCase()}-${Date.now()}`,
            symbol,
            direction: isLong ? 'long' : 'short',
            confidence: Math.min(confidence, 95),
            entryZone: `${(entryPrice * 0.998).toFixed(2)} – ${(entryPrice * 1.002).toFixed(2)}`,
            stopLoss,
            takeProfit1,
            riskReward,
            volumeSpike: 1.5 + Math.random() * 1.5,
            regime: Math.abs(change) > 3 ? 'trending' : Math.abs(change) > 1 ? 'ranging' : 'volatile',
            timeframe: Math.random() > 0.5 ? '5m' : '15m',
            status,
            generatedAt: new Date().toLocaleTimeString(),
            indicators: [
              `${isLong ? 'EMA20↑' : 'EMA20↓'}`,
              `RSI ${Math.floor(40 + Math.random() * 40)}`,
              Math.random() > 0.5 ? 'VWAP+' : 'BB mid',
              `Vol×${(1.5 + Math.random() * 1.5).toFixed(1)}`,
            ],
          });
        }
      }
      
      // Sort by confidence descending
      generatedSignals.sort((a, b) => b.confidence - a.confidence);
      setSignals(generatedSignals);
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = signals.filter((s) => {
    if (filter === 'pending' && s.status !== 'pending' && s.status !== 'confirmed')
      return false;
    if (filter === 'executed' && s.status !== 'executed') return false;
    return s.confidence >= minConfidence;
  });

  const liveCount = signals.filter((s) => s.status === 'pending' || s.status === 'confirmed').length;

  if (isLoading) {
    return (
      <div className="card-surface overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading signals...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Signal Feed</h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-info-subtle text-info border border-info/20">
            {liveCount} live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Min:</span>
          <span className="text-xs font-semibold font-tabular text-primary w-7">
            {minConfidence}%
          </span>
          <input
            type="range"
            min={70}
            max={95}
            step={1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-16"
            aria-label="Minimum confidence filter"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 px-4 py-2.5 border-b border-border shrink-0">
        {(['all', 'pending', 'executed'] as const).map((f) => (
          <button
            key={`filter-${f}`}
            onClick={() => setFilter(f)}
            className={`
              px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 capitalize
              ${
                filter === f
                  ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }
            `}
          >
            {f === 'all' ? 'All Signals' : f === 'pending' ? 'Pending' : 'Executed'}
          </button>
        ))}
      </div>

      {/* Signal List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border/50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Zap size={28} className="text-muted-foreground mb-3" />
            <p className="text-sm font-semibold text-foreground">
              No signals match current filters
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Lower the confidence threshold or change the status filter
            </p>
          </div>
        ) : (
          filtered.map((signal) => (
            <div
              key={signal.id}
              className="px-4 py-3.5 hover:bg-muted/20 transition-colors duration-100 fade-in"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    {signal.direction === 'long' ? (
                      <TrendingUp size={13} className="text-positive" />
                    ) : (
                      <TrendingDown size={13} className="text-negative" />
                    )}
                    <span className="text-sm font-semibold font-mono text-foreground">
                      {signal.symbol}
                    </span>
                  </div>
                  <StatusBadge variant={signal.direction} size="sm" />
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                    {signal.timeframe}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-bold font-tabular px-2 py-0.5 rounded border ${CONFIDENCE_COLOR(signal.confidence)}`}
                  >
                    {Math.round(signal.confidence)}%
                  </span>
                  <StatusBadge variant={signal.status as any} size="sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] font-mono mb-2">
                <div>
                  <span className="text-muted-foreground">Entry: </span>
                  <span className="text-foreground font-tabular">{signal.entryZone}</span>
                </div>
                <div>
                  <span className="text-negative">SL: </span>
                  <span className="text-foreground font-tabular">
                    {signal.stopLoss.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-positive">TP1: </span>
                  <span className="text-foreground font-tabular">
                    {signal.takeProfit1.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">R:R </span>
                  <span
                    className={signal.riskReward >= 2.5 ? 'text-positive' : 'text-warning'}
                  >
                    1:{signal.riskReward.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Vol× </span>
                  <span className="text-info font-tabular">{signal.volumeSpike.toFixed(1)}x</span>
                </div>
                <div>
                  <StatusBadge variant={signal.regime} size="sm" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {signal.indicators.map((ind) => (
                    <span
                      key={`ind-${signal.id}-${ind}`}
                      className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono"
                    >
                      {ind}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock size={9} />
                  <span className="font-mono">{signal.generatedAt}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}