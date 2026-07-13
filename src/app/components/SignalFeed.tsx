'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Zap, TrendingUp, TrendingDown, Filter, Clock, Loader2, RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { toast } from 'sonner';

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

// Bybit API endpoints
const BYBIT_API = {
  spot: 'https://api.bybit.com/v5/market/tickers',
  kline: 'https://api.bybit.com/v5/market/kline',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
};

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];

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
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // WebSocket refs
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

    return {
      id: `sig-${symbol}-${Date.now()}`,
      symbol,
      direction: isLong ? 'long' : 'short',
      confidence: Math.round(confidence),
      entryZone: `${(price * 0.998).toFixed(2)} – ${(price * 1.002).toFixed(2)}`,
      stopLoss: Math.round(stopLoss * 100) / 100,
      takeProfit1: Math.round(takeProfit1 * 100) / 100,
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
      entryPrice: price,
      change24h,
      volume,
      price,
    };
  };

  // Fetch signals from market data
  const fetchSignals = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      
      const promises = SUPPORTED_SYMBOLS.map(symbol =>
        fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`)
          .then(r => r.json())
          .catch(() => null)
      );
      
      const results = await Promise.all(promises);
      const generatedSignals: Signal[] = [];
      
      results.forEach((result: any) => {
        if (result && result.retCode === 0 && result.result?.list?.length > 0) {
          const ticker = result.result.list[0];
          const signal = generateSignalFromData(ticker.symbol, ticker);
          if (signal) {
            generatedSignals.push(signal);
          }
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

  // WebSocket connection for real-time updates
  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setReconnectAttempts(0);
        setError(null);
        
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: SUPPORTED_SYMBOLS.map(s => `tickers.${s}`)
        }));
        
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.topic === 'tickers') {
            const ticker = data.data;
            if (ticker && ticker.symbol) {
              const signal = generateSignalFromData(ticker.symbol, ticker);
              if (signal) {
                setSignals(prev => {
                  const filtered = prev.filter(s => s.symbol !== ticker.symbol || s.status === 'executed');
                  return [signal, ...filtered].slice(0, 50);
                });
              }
            }
          } else if (data.op === 'pong') {
            // Heartbeat response - ignore
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = (event) => {
        console.warn('WebSocket error:', event);
        // Don't set error state here - onclose handles reconnection
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code);
        setConnectionStatus('disconnected');
        stopHeartbeat();
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Only attempt reconnect if not a normal closure
        if (event.code !== 1000) {
          const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        }
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setConnectionStatus('error');
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Normal closure');
      wsRef.current = null;
    }
    stopHeartbeat();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ op: 'ping' }));
      }
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchSignals();
    connectWebSocket();
    
    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        fetchSignals();
      }
    }, 60000);
    
    return () => {
      clearInterval(interval);
      disconnectWebSocket();
    };
  }, []);

  const filtered = signals.filter((s) => {
    if (filter === 'pending' && s.status !== 'pending' && s.status !== 'confirmed')
      return false;
    if (filter === 'executed' && s.status !== 'executed') return false;
    return s.confidence >= minConfidence;
  });

  const liveCount = signals.filter((s) => s.status === 'pending' || s.status === 'confirmed').length;

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <span className="text-green-500">●</span>;
      case 'connecting': return <Loader2 size={12} className="animate-spin text-yellow-500" />;
      case 'error': return <span className="text-red-500">●</span>;
      default: return <span className="text-gray-400">●</span>;
    }
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
              {connectionStatus === 'connected' ? 'Analyzing market data...' : 'Waiting for connection...'}
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
                  <span className={`text-[10px] ${signal.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {signal.change24h >= 0 ? '+' : ''}{signal.change24h.toFixed(1)}%
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
                  <span className="text-foreground font-tabular">${signal.entryPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-negative">SL: </span>
                  <span className="text-foreground font-tabular">
                    ${signal.stopLoss.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-positive">TP1: </span>
                  <span className="text-foreground font-tabular">
                    ${signal.takeProfit1.toLocaleString()}
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