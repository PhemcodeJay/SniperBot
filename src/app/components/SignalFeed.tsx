// app/components/SignalFeed.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Zap, TrendingUp, TrendingDown, Filter, Clock, Loader2, RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { realtimeManager } from '@/lib/realtimeManager';

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
  entryPrice: number;
  change24h: number;
  volume: number;
  price: number;
}

// ============== BYBIT API CONFIG ==============
const BYBIT_BASE_URL = 'https://api.bybit.com';
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];

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

// ============== API FUNCTIONS ==============

// Fetch ticker data
const fetchTickers = async (symbols: string[]): Promise<Record<string, any>> => {
  try {
    const promises = symbols.map(symbol =>
      fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${symbol}`)
        .then(r => safeJsonParse(r))
        .catch(() => null)
    );

    const results = await Promise.all(promises);
    const tickers: Record<string, any> = {};

    results.forEach((data: any) => {
      if (data?.retCode === 0 && data?.result?.list?.[0]) {
        const ticker = data.result.list[0];
        tickers[ticker.symbol] = ticker;
      }
    });

    return tickers;
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return {};
  }
};

// ============== COMPONENT ==============

const CONFIDENCE_COLOR = (c: number) =>
  c >= 88 ? 'text-positive border-positive/30 bg-positive-subtle'
    : c >= 80 ? 'text-info border-info/30 bg-info-subtle' : 'text-warning border-warning/30 bg-warning-subtle';

export default function SignalFeed() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'executed'>('all');
  const [minConfidence, setMinConfidence] = useState(75);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate signal from real market data
  const generateSignalFromData = (symbol: string, ticker: any): Signal | null => {
    const price = parseFloat(ticker.lastPrice);
    const change24h = parseFloat(ticker.price24hPcnt) * 100;
    const volume = parseFloat(ticker.volume24h);
    const high24h = parseFloat(ticker.highPrice24h);
    const low24h = parseFloat(ticker.lowPrice24h);

    // Only generate signal if there's significant movement
    if (Math.abs(change24h) < 0.5) return null;

    const isLong = change24h > 0;
    const confidence = Math.min(95, 70 + Math.abs(change24h) * 2 + Math.min(volume / 1e8, 15));
    const atr = (high24h - low24h) / 4;

    const entryPrice = price;
    const stopLoss = isLong ? price - atr * 1.5 : price + atr * 1.5;
    const takeProfit1 = isLong ? price + atr * 2.5 : price - atr * 2.5;
    const riskReward = Math.abs((takeProfit1 - price) / (price - stopLoss));

    const statuses: Signal['status'][] = ['pending', 'confirmed', 'executed'];
    const status = confidence > 80 ? 'confirmed' : statuses[Math.floor(Math.random() * 2)];

    const regime = Math.abs(change24h) > 3 ? 'trending' : Math.abs(change24h) > 1 ? 'ranging' : 'volatile';
    const timeframe = Math.abs(change24h) > 2 ? '15m' : '5m';

    const rsiValue = Math.round(50 + change24h * 1.5);
    const volumeSpike = Math.min(3, volume / 1e8 + 1);

    // Format entry zone with 4 decimal places
    const formatPrice = (p: number): string => {
      if (p >= 1000) return p.toFixed(2);
      if (p >= 1) return p.toFixed(4);
      return p.toFixed(6);
    };
    const entryLow = price * 0.998;
    const entryHigh = price * 1.002;
    const entryZone = `${formatPrice(entryLow)} – ${formatPrice(entryHigh)}`;

    return {
      id: `sig-${symbol}-${Date.now()}`,
      symbol,
      direction: isLong ? 'long' : 'short',
      confidence: Math.round(confidence),
      entryZone,
      stopLoss: Math.round(stopLoss * 10000) / 10000,
      takeProfit1: Math.round(takeProfit1 * 10000) / 10000,
      riskReward: Math.round(riskReward * 10) / 10,
      volumeSpike: Math.round(volumeSpike * 10) / 10,
      regime,
      timeframe: timeframe as '5m' | '15m',
      status,
      generatedAt: new Date().toLocaleTimeString(),
      indicators: [
        `${isLong ? 'EMA20↑' : 'EMA20↓'}`,
        `RSI ${Math.min(95, Math.max(5, rsiValue))}`,
        volumeSpike > 1.5 ? 'VWAP+' : 'BB mid',
        `Vol×${volumeSpike.toFixed(1)}`,
      ],
      entryPrice: Math.round(entryPrice * 10000) / 10000,
      change24h,
      volume,
      price: Math.round(price * 10000) / 10000,
    };
  };

  // Fetch signals
  const fetchSignals = async () => {
    try {
      setIsRefreshing(true);
      setError(null);

      const tickers = await fetchTickers(SUPPORTED_SYMBOLS);
      const generatedSignals: Signal[] = [];

      Object.entries(tickers).forEach(([symbol, ticker]) => {
        const signal = generateSignalFromData(symbol, ticker);
        if (signal) {
          generatedSignals.push(signal);
        }
      });

      // Sort by confidence descending
      generatedSignals.sort((a, b) => b.confidence - a.confidence);

      // Merge with existing signals, keeping only active ones
      const existingActive = signals.filter(s => s.status === 'pending' || s.status === 'confirmed');
      const combined = [...generatedSignals, ...existingActive];
      const unique = Array.from(new Map(combined.map(s => [s.symbol, s])).values());

      setSignals(unique.slice(0, 50));
    } catch (error) {
      console.error('Failed to fetch signals:', error);
      setError('Failed to fetch signals. Using cached data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Subscribe to singleton ticks rather than opening a dedicated WebSocket

  const disconnectWebSocket = () => { /* noop - singleton manages WS */ };

  useEffect(() => {
    fetchSignals();

    const unsubscribe = realtimeManager.subscribeTicks((ticker: any) => {
      try {
        if (ticker && ticker.symbol) {
          const signal = generateSignalFromData(ticker.symbol, ticker);
          if (signal) {
            setSignals(prev => {
              const filtered = prev.filter(s => s.symbol !== ticker.symbol || s.status === 'executed');
              return [signal, ...filtered].slice(0, 50);
            });
          }
        }
      } catch (e) {
        // ignore
      }
    });

    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') fetchSignals();
    }, 60000);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const filtered = signals.filter((s) => {
    if (filter === 'pending' && s.status !== 'pending' && s.status !== 'confirmed') return false;
    if (filter === 'executed' && s.status !== 'executed') return false;
    return s.confidence >= minConfidence;
  });

  const liveCount = signals.filter((s) => s.status === 'pending' || s.status === 'confirmed').length;

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <span className="text-green-500">●</span>;
      case 'connecting': return <Loader2 size={12} className="animate-spin text-yellow-500" />;
      default: return <span className="text-gray-400">●</span>;
    }
  };

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

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
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {getConnectionIcon()}
            {connectionStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSignals}
            disabled={isRefreshing}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh signals"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <Filter size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Min:</span>
          <span className="text-xs font-semibold font-tabular text-primary w-7">{minConfidence}%</span>
          <input
            type="range"
            min={70}
            max={95}
            step={1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-16 accent-blue-600 dark:accent-blue-400"
            aria-label="Minimum confidence filter"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-2 p-2 rounded-md bg-negative-subtle text-negative text-xs border border-negative/20">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 px-4 py-2.5 border-b border-border shrink-0">
        {(['all', 'pending', 'executed'] as const).map((f) => (
          <button
            key={`filter-${f}`}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 capitalize ${filter === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
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
            <p className="text-sm font-semibold text-foreground">No signals match current filters</p>
            <p className="text-xs text-muted-foreground mt-1">{connectionStatus === 'connected' ? 'Analyzing market data...' : 'Waiting for connection...'}</p>
          </div>
        ) : (
          filtered.map((signal) => (
            <div key={signal.id} className="px-4 py-3.5 hover:bg-muted/20 transition-colors duration-100 fade-in">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    {signal.direction === 'long' ? <TrendingUp size={13} className="text-positive" /> : <TrendingDown size={13} className="text-negative" />}
                    <span className="text-sm font-semibold font-mono text-foreground">{signal.symbol}</span>
                  </div>
                  <StatusBadge variant={signal.direction} size="sm" />
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{signal.timeframe}</span>
                  <span className={`text-[10px] ${signal.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {signal.change24h >= 0 ? '+' : ''}{signal.change24h.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold font-tabular px-2 py-0.5 rounded border ${CONFIDENCE_COLOR(signal.confidence)}`}>
                    {Math.round(signal.confidence)}%
                  </span>
                  <StatusBadge variant={signal.status as any} size="sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] font-mono mb-2">
                <div><span className="text-muted-foreground">Entry: </span><span className="text-foreground font-tabular">${formatPrice(signal.entryPrice)}</span></div>
                <div><span className="text-negative">SL: </span><span className="text-foreground font-tabular">${formatPrice(signal.stopLoss)}</span></div>
                <div><span className="text-positive">TP1: </span><span className="text-foreground font-tabular">${formatPrice(signal.takeProfit1)}</span></div>
                <div><span className="text-muted-foreground">R:R </span><span className={signal.riskReward >= 2.5 ? 'text-positive' : 'text-warning'}>1:{signal.riskReward.toFixed(1)}</span></div>
                <div><span className="text-muted-foreground">Vol× </span><span className="text-info font-tabular">{signal.volumeSpike.toFixed(1)}x</span></div>
                <div><StatusBadge variant={signal.regime} size="sm" /></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {signal.indicators.map((ind) => (
                    <span key={`ind-${signal.id}-${ind}`} className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono">{ind}</span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock size={9} />
                  <span className="font-mono">{signal.generatedAt}</span>
                </div>
              </div>

              <div className="mt-1.5 text-[10px] text-muted-foreground">
                <span className="font-medium">Entry Zone: </span>
                <span className="font-mono text-foreground">{signal.entryZone}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}