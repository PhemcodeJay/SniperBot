// app/signal-engine/page.tsx - REAL Bybit API Data

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { realtimeManager } from '@/lib/realtimeManager';
import { BYBIT_BASE_URL, fetchBybitWalletBalance, getBybitCredentials, normalizeBybitQty, placeBybitOrder, safeJsonParse } from '@/lib/bybit';
import { appendSharedAlert, setSharedSignals, setSharedTrades, subscribeToSharedTradingState } from '@/lib/tradingState';
import { readLiveTrades, writeLiveTrades } from '@/lib/liveTrades';
import { 
  Zap, TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, Clock, Filter, Search, X,
  Sparkles, Wifi, WifiOff, Database, Activity, Loader2
} from 'lucide-react';

interface Signal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  rr: number;
  regime: string;
  volumeSpike: number;
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  bbPosition: string;
  timeframe: string;
  status: 'live' | 'pending' | 'rejected' | 'executed';
  rejectionReason?: string;
  generatedAt: string;
  timestamp: number;
  volume: number;
  signalSource: 'ml' | 'technical' | 'hybrid';
  change24h: number;
  price24hHigh: number;
  price24hLow: number;
}

interface Indicator {
  id: string;
  label: string;
  enabled: boolean;
  category: 'momentum' | 'trend' | 'volatility' | 'volume';
}

// ============== BYBIT API CONFIG ==============
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const SUPPORTED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'MATICUSDT', 'LTCUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT',
];

// Minimum time between WebSocket-triggered rescans. Ticker ticks can arrive
// many times per second across 15 symbols; without a throttle every tick
// would kick off a full market scan (15 ticker fetches + up to 15 kline
// fetches), flooding Bybit's REST API and causing "Failed to fetch" errors.
const MIN_RESCAN_INTERVAL_MS = 20000;

// ============== API HELPERS ==============
const getApiCredentials = () => getBybitCredentials();


const formatPrice = (price: number): string => {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
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

// Fetch kline data for technical indicators
const fetchKline = async (symbol: string, interval: string = '15', limit: number = 100): Promise<any[]> => {
  try {
    const response = await fetch(
      `${BYBIT_BASE_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const data = await safeJsonParse(response);
    
    if (data?.retCode === 0 && data?.result?.list) {
      return data.result.list;
    }
    return [];
  } catch (error) {
    console.error(`Error fetching kline for ${symbol}:`, error);
    return [];
  }
};

// ============== COMPONENT ==============

export default function SignalEnginePage() {
  // Simple in-memory cache for wallet balance to avoid repeated POST /api/bybit
  // calls during bursts of executions. Cached for 60 seconds.
  const walletCacheRef = useRef<{ available: number; ts: number } | null>(null);

  const [signals, setSignals] = useState<Signal[]>([]);
  const [indicators] = useState<Indicator[]>([
    { id: 'rsi', label: 'RSI (14)', enabled: true, category: 'momentum' },
    { id: 'macd', label: 'MACD (12,26,9)', enabled: true, category: 'momentum' },
    { id: 'bb', label: 'Bollinger Bands (20,2)', enabled: true, category: 'volatility' },
    { id: 'vwap', label: 'VWAP', enabled: true, category: 'volume' },
    { id: 'ema9', label: 'EMA 9', enabled: true, category: 'trend' },
    { id: 'ema20', label: 'EMA 20', enabled: true, category: 'trend' },
  ]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'pending' | 'rejected' | 'executed'>('all');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showRejected, setShowRejected] = useState(true);
  const [sortBy, setSortBy] = useState<'confidence' | 'time' | 'rr'>('time');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ live: 0, pending: 0, rejected: 0, avgConfidence: 0 });
  const [marketData, setMarketData] = useState<Record<string, any>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToSharedTradingState((state) => {
      setSignals(state.signals);
    });
    return () => unsubscribe();
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const autoExecutionRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks the last time a market scan actually ran, so rapid-fire WS ticks
  // can't each trigger their own full rescan.
  const lastScanRef = useRef<number>(0);
  // Guards against overlapping scans (a scan already in flight when another
  // is requested).
  const isScanningRef = useRef<boolean>(false);

  // Calculate technical indicators from kline data
  const calculateIndicators = (klines: any[]): { rsi: number; macd: { signal: 'bullish' | 'bearish' | 'neutral' }; bb: { position: string } } => {
    if (!klines || klines.length < 20) {
      return { rsi: 50, macd: { signal: 'neutral' }, bb: { position: 'middle' } };
    }

    // Parse close prices
    const closes = klines.map((k: any) => parseFloat(k[4]));

    // Calculate RSI using Wilder's smoothed method (period=14)
    const period = 14;
    let avgGain = 0, avgLoss = 0;
    // First average: simple mean of first 14 periods
    for (let i = 1; i <= period && i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) avgGain += diff;
      else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;
    // Subsequent values: Wilder's smoothed (exponential) average
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
      }
    }
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    const rsi = 100 - (100 / (1 + rs));

    // Calculate MACD (simplified)
    const ema12 = closes.slice(-12).reduce((a, b) => a + b, 0) / Math.min(12, closes.length);
    const ema26 = closes.slice(-26).reduce((a, b) => a + b, 0) / Math.min(26, closes.length);
    const macdLine = ema12 - ema26;
    const macdSignal = macdLine > 0 ? 'bullish' : macdLine < 0 ? 'bearish' : 'neutral';

    // Calculate Bollinger Bands (simplified)
    const last20 = closes.slice(-20);
    const mean = last20.reduce((a, b) => a + b, 0) / last20.length;
    const stdDev = Math.sqrt(last20.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / last20.length);
    const upper = mean + 2 * stdDev;
    const lower = mean - 2 * stdDev;
    const currentPrice = closes[closes.length - 1];
    
    let bbPosition = 'middle';
    if (currentPrice > upper) bbPosition = 'upper';
    else if (currentPrice < lower) bbPosition = 'lower';

    return { rsi, macd: { signal: macdSignal }, bb: { position: bbPosition } };
  };

  // Generate signal from market data
  const generateSignalFromData = async (symbol: string, ticker: any): Promise<Signal | null> => {
    const price = parseFloat(ticker.lastPrice);
    const change24h = parseFloat(ticker.price24hPcnt) * 100;
    const volume = parseFloat(ticker.volume24h);
    const high24h = parseFloat(ticker.highPrice24h);
    const low24h = parseFloat(ticker.lowPrice24h);

    // Only generate signal if there's significant movement
    if (Math.abs(change24h) < 0.5) return null;

    // Fetch kline data for indicators
    const klines = await fetchKline(symbol, '15', 50);
    const indicators = calculateIndicators(klines);

    // Determine direction
    const isLong = change24h > 0 && indicators.rsi < 70;
    const isShort = change24h < 0 && indicators.rsi > 30;

    if (!isLong && !isShort) return null;

    // Calculate confidence
    const volumeFactor = Math.min(volume / 100000000, 2);
    const trendStrength = Math.abs(change24h) / 2;
    const rsiFactor = isLong ? (70 - indicators.rsi) / 70 : (indicators.rsi - 30) / 70;
    
    let confidence = 50 + (trendStrength * 10) + (volumeFactor * 8) + (rsiFactor * 15);
    confidence = Math.min(95, Math.max(55, confidence));

    // Calculate stop loss and take profit levels
    const atr = (high24h - low24h) / 4;
    const entryPrice = price;
    const stopLoss = isLong ? price - atr * 1.5 : price + atr * 1.5;
    const takeProfit1 = isLong ? price + atr * 2.5 : price - atr * 2.5;
    const takeProfit2 = isLong ? price + atr * 4 : price - atr * 4;

    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit1 - entryPrice);
    const rr = risk > 0 ? reward / risk : 1.5;

    const regime = Math.abs(change24h) > 3 ? 'trending' : 
                   Math.abs(change24h) > 1.5 ? 'ranging' : 'volatile';
    const timeframe = Math.abs(change24h) > 2 ? '15m' : '5m';
    const source = confidence > 80 ? 'hybrid' : confidence > 70 ? 'technical' : 'ml';
    const status = confidence > 80 ? 'live' : confidence > 70 ? 'pending' : 'rejected';

    return {
      id: `sig-${symbol}-${Date.now()}`,
      symbol,
      direction: isLong ? 'LONG' : 'SHORT',
      confidence: Math.round(confidence),
      entryPrice: Math.round(entryPrice * 10000) / 10000,
      sl: Math.round(stopLoss * 10000) / 10000,
      tp1: Math.round(takeProfit1 * 10000) / 10000,
      tp2: Math.round(takeProfit2 * 10000) / 10000,
      rr: Math.round(rr * 10) / 10,
      regime,
      volumeSpike: Math.round(volumeFactor * 10) / 10,
      rsi: Math.round(indicators.rsi),
      macdSignal: indicators.macd.signal,
      bbPosition: indicators.bb.position,
      timeframe: timeframe as '5m' | '15m',
      status: status as 'live' | 'pending' | 'rejected' | 'executed',
      rejectionReason: status === 'rejected' ? 'Confidence below threshold' : undefined,
      generatedAt: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      volume: volume,
      signalSource: source as 'ml' | 'technical' | 'hybrid',
      change24h: Math.round(change24h * 10) / 10,
      price24hHigh: high24h,
      price24hLow: low24h,
    };
  };

  // Fetch market data and generate signals.
  // NOTE: this intentionally has no dependency on `signals` state — it reads
  // the latest signals via the functional form of setSignals instead. That
  // keeps this callback's identity stable across renders, which in turn
  // keeps the WebSocket connection (which depends on this function) from
  // being torn down and reconnected on every signal update.
  const fetchMarketDataAndGenerateSignals = useCallback(async () => {
    if (isScanningRef.current) return; // don't overlap scans
    isScanningRef.current = true;
    lastScanRef.current = Date.now();

    try {
      setIsLoading(true);
      setError(null);

      const tickers = await fetchTickers(SUPPORTED_SYMBOLS);
      setMarketData(tickers);

      // Fetch klines / build signals in parallel instead of a sequential
      // for-await loop — sequential awaits inside the loop meant each
      // symbol's kline request waited on the previous one, and any backlog
      // from overlapping scans would compound into a large request queue
      // that Bybit (or the browser) would start rejecting as network errors.
      const signalResults = await Promise.all(
        Object.entries(tickers).map(([symbol, ticker]) =>
          generateSignalFromData(symbol, ticker).catch((err) => {
            console.error(`Error generating signal for ${symbol}:`, err);
            return null;
          })
        )
      );
      const newSignals = signalResults.filter((s): s is Signal => s !== null);

      setSignals(prevSignals => {
        // Keep existing live/pending signals, add new ones
        const existingActive = prevSignals.filter(s => s.status === 'live' || s.status === 'pending');

        // Combine and deduplicate by symbol
        const combined = [...newSignals, ...existingActive];
        const uniqueSignals = Array.from(
          new Map(combined.map(s => [s.symbol, s])).values()
        ).sort((a, b) => b.confidence - a.confidence);

        const merged = uniqueSignals.slice(0, 50);
        setSharedSignals(merged as any);
        return merged;
      });

      setLastUpdate(new Date());

    } catch (err: any) {
      console.error('Error fetching market data:', err);
      setError(err.message || 'Failed to fetch market data');
    } finally {
      setIsLoading(false);
      isScanningRef.current = false;
    }
  }, []);

  // Connect WebSocket
  // Use singleton realtime manager for ticks to avoid multiple WS connections
  useEffect(() => {
    setConnectionStatus('connecting');
    const unsubscribe = realtimeManager.subscribeTicks((tick: any) => {
      try {
        const ticker = tick;
        if (ticker && ticker.symbol) {
          setMarketData(prev => ({ ...prev, [ticker.symbol]: ticker }));
          const now = Date.now();
          if (now - lastScanRef.current >= MIN_RESCAN_INTERVAL_MS) {
            fetchMarketDataAndGenerateSignals();
          }
        }
      } catch (e) {
        // ignore
      }
    });
    // Mark connected once manager is running (manager logs/handles WS lifecycle)
    setConnectionStatus('connected');
    return () => { unsubscribe(); };
  }, [fetchMarketDataAndGenerateSignals]);

  const disconnectWebSocket = useCallback(() => {
    // no-op: singleton manager controls lifecycle
  }, []);

  // Initialize — runs once on mount. connectionStatus is intentionally
  // excluded from the dependency array: including it previously caused the
  // WebSocket to be torn down and reconnected (and a fresh rescan interval
  // spun up) on every connection status change, which combined with the
  // per-tick rescans on message was a major contributor to request flooding.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedValue = window.localStorage.getItem('auto_trading_enabled');
      if (storedValue !== null) {
        setAutoTradingEnabled(storedValue === 'true');
      }
    }

    const handleAutoTradingSettingChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>;
      if (typeof customEvent.detail?.enabled === 'boolean') {
        setAutoTradingEnabled(customEvent.detail.enabled);
      }
    };

    window.addEventListener('auto-trading-settings-changed', handleAutoTradingSettingChanged);

    fetchMarketDataAndGenerateSignals();

    const onBotStarted = () => {
      // Immediately trigger a scan when the bot starts
      fetchMarketDataAndGenerateSignals();
    };
    window.addEventListener('bot-started', onBotStarted);

    const interval = setInterval(() => {
      // rely on singleton manager; still fallback to periodic rescan
      fetchMarketDataAndGenerateSignals();
    }, 120000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('auto-trading-settings-changed', handleAutoTradingSettingChanged);
      window.removeEventListener('bot-started', onBotStarted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update statistics
  useEffect(() => {
    const live = signals.filter(s => s.status === 'live').length;
    const pending = signals.filter(s => s.status === 'pending').length;
    const rejected = signals.filter(s => s.status === 'rejected').length;
    const avgConf = signals
      .filter(s => s.status === 'live' || s.status === 'pending')
      .reduce((sum, s) => sum + s.confidence, 0) / (live + pending) || 0;

    setStats({ live, pending, rejected, avgConfidence: avgConf });
  }, [signals]);

  useEffect(() => {
    if (!autoTradingEnabled) return;
    const highConfidenceSignals = signals.filter(
      (signal) => signal.status === 'live' && signal.confidence >= 80 && !autoExecutionRef.current.has(signal.id)
    );

    if (highConfidenceSignals.length === 0) return;

    // Limit concurrent live trades to a maximum (default 10)
    const MAX_CONCURRENT_LIVE = parseInt(process.env.NEXT_PUBLIC_MAX_CONCURRENT_LIVE || '10', 10);
    const currentLiveCount = readLiveTrades().filter(t => t.status === 'open').length;
    const availableSlots = Math.max(0, MAX_CONCURRENT_LIVE - currentLiveCount);
    if (availableSlots <= 0) return;

    // Serialize executions to avoid a burst of simultaneous POST requests.
    (async () => {
      const toExecute = highConfidenceSignals.slice(0, availableSlots);
      for (const signal of toExecute) {
        autoExecutionRef.current.add(signal.id);
        try {
          // Await to serialize the requests
          // eslint-disable-next-line no-await-in-loop
          await handleExecuteSignal(signal);
        } catch (e) {
          // swallow here since handleExecuteSignal handles errors
        } finally {
          autoExecutionRef.current.delete(signal.id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, autoTradingEnabled]);

  const handleRescan = async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      await fetchMarketDataAndGenerateSignals();
      
      if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
          // Trigger singleton manager refresh instead of per-component reconnect
          realtimeManager.triggerRefresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan market');
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecuteSignal = async (signal: Signal) => {
    setExecutingSignalId(signal.id);
    setError(null);

    try {
      const { apiKey, apiSecret } = getApiCredentials();
      if (!apiKey || !apiSecret) {
        throw new Error('Live trading credentials are not configured. Add them in Settings first.');
      }

      // Enforce global max concurrent live trades
      const MAX_CONCURRENT_LIVE = parseInt(process.env.NEXT_PUBLIC_MAX_CONCURRENT_LIVE || '10', 10);
      const currentLive = readLiveTrades().filter(t => t.status === 'open').length;
      if (currentLive >= MAX_CONCURRENT_LIVE) {
        throw new Error('Max concurrent live trades reached');
      }

      // Calculate conservative live order size based on total equity and risk.
      // Use a short-lived cache to avoid repeated /api/bybit calls during bursts.
      let available = 0;
      const now = Date.now();
      if (walletCacheRef.current && (now - walletCacheRef.current.ts) < 60000) {
        available = walletCacheRef.current.available;
      } else {
        const wallet = await fetchBybitWalletBalance(apiKey, apiSecret);
        available = wallet.availableBalance > 0 ? wallet.availableBalance : wallet.totalEquity;
        walletCacheRef.current = { available, ts: now };
      }
      // Use 10% of total equity for each trade by default (can be overridden
      // by NEXT_PUBLIC_AUTO_EXECUTE_MAX_RISK_PCT).
      const maxRiskPct = parseFloat(process.env.NEXT_PUBLIC_AUTO_EXECUTE_MAX_RISK_PCT || '10');
      const accountRisk = available * (maxRiskPct / 100);
      const priceDiff = Math.abs(signal.entryPrice - signal.sl);
      let size = priceDiff > 0 ? accountRisk / priceDiff : 0;
      const MIN_SIZE = 0.0001;
      if (size < MIN_SIZE) {
        throw new Error('Calculated order size too small for live execution');
      }

      // Ensure margin requirement fits available balance (use leverage 5)
      const leverage = 5;
      const requiredMargin = (size * signal.entryPrice) / leverage;
      if (requiredMargin > available) {
        // If required margin exceeds available, fall back to using the
        // configured percent of total equity (times leverage).
        size = (available * (maxRiskPct / 100) * leverage) / signal.entryPrice;
        if (size < MIN_SIZE) throw new Error('Insufficient funds to place order');
      }

      const normalizedQty = await normalizeBybitQty(signal.symbol, size);
      if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
        throw new Error('Live order quantity invalid after normalization');
      }

      const orderResult = await placeBybitOrder({
        symbol: signal.symbol,
        side: signal.direction,
        qty: normalizedQty,
        leverage,
        apiKey,
        apiSecret,
        stopLoss: signal.sl,
        takeProfit: signal.tp1,
      });

      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Bybit rejected the order');
      }

      const liveTrades = readLiveTrades();
      writeLiveTrades([...liveTrades, {
        id: `live-${signal.id}`,
        symbol: signal.symbol,
        side: signal.direction,
        entryPrice: signal.entryPrice,
        exitPrice: signal.entryPrice,
        size: normalizedQty,
        pnl: 0,
        pnlPct: 0,
        confidence: signal.confidence,
        regime: signal.regime,
        entryTime: new Date().toLocaleString(),
        exitTime: new Date().toLocaleString(),
        duration: '0m',
        exitReason: 'Live order placed',
        slippage: 0,
        entryTimestamp: Date.now(),
        exitTimestamp: Date.now(),
        status: 'open',
        leverage,
        liquidationPrice: signal.entryPrice * 0.95,
        source: 'live',
        orderId: orderResult.orderId,
      }] );

      appendSharedAlert({
        id: `alert-live-order-${signal.id}-${Date.now()}`,
        type: 'trade',
        priority: 'high',
        title: 'Live order executed',
        message: `Bybit order ${orderResult.orderId} placed for ${signal.symbol} ${signal.direction}.`, 
        time: new Date().toLocaleTimeString(),
        read: false,
        timestamp: Date.now(),
        symbol: signal.symbol,
        price: signal.entryPrice,
      });

      setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, status: 'executed' } : s));
    } catch (err: any) {
      console.error('Signal execution failed:', err);
      setError(err.message || 'Failed to execute signal');
    } finally {
      setExecutingSignalId(null);
    }
  };

  const handleDeleteSignal = (id: string) => {
    if (!confirm('Delete this signal?')) return;
    setSignals(prev => prev.filter(s => s.id !== id));
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi size={14} className="text-green-500" />;
      case 'connecting': return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error': return <WifiOff size={14} className="text-red-500" />;
      default: return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'rejected': return 'bg-red-500';
      case 'executed': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'live': return 'text-green-600 dark:text-green-400';
      case 'pending': return 'text-yellow-600 dark:text-yellow-400';
      case 'rejected': return 'text-red-600 dark:text-red-400';
      case 'executed': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Filtered and sorted signals
  const filtered = signals
    .filter(s => filterStatus === 'all' || s.status === filterStatus)
    .filter(s => showRejected || s.status !== 'rejected')
    .filter(s => s.symbol.toLowerCase().includes(filterSymbol.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'confidence': return b.confidence - a.confidence;
        case 'rr': return b.rr - a.rr;
        case 'time': return b.timestamp - a.timestamp;
        default: return 0;
      }
    });

  if (isLoading && signals.length === 0) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Zap size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Signal Engine</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                AI-powered signal generation from live Bybit data
                <span className="flex items-center gap-1 text-xs">
                  {getConnectionIcon()}
                  <span className={`capitalize ${
                    connectionStatus === 'connected' ? 'text-green-600 dark:text-green-400' :
                    connectionStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {connectionStatus === 'connected' ? 'Live' : 
                     connectionStatus === 'connecting' ? 'Connecting...' :
                     connectionStatus === 'error' ? 'Error' : 'Disconnected'}
                  </span>
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {connectionStatus === 'error' && (
              <button
                onClick={() => { realtimeManager.triggerRefresh(); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Reconnect
              </button>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
            <button
              onClick={handleRescan}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
              {isScanning ? 'Scanning...' : 'Rescan Market'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Live Signals', value: stats.live.toString(), color: 'text-green-600 dark:text-green-400' },
            { label: 'Pending Signals', value: stats.pending.toString(), color: 'text-yellow-600 dark:text-yellow-400' },
            { label: 'Rejected', value: stats.rejected.toString(), color: 'text-red-600 dark:text-red-400' },
            { label: 'Avg Confidence', value: `${stats.avgConfidence.toFixed(0)}%`, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Total Signals', value: signals.length.toString(), color: 'text-purple-600 dark:text-purple-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
              <p className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Signal Feed */}
          <div className="lg:col-span-3 space-y-3">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'live', 'pending', 'rejected', 'executed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                      filterStatus === f 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {f} {f !== 'all' && `(${signals.filter(s => s.status === f).length})`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={filterSymbol}
                    onChange={(e) => setFilterSymbol(e.target.value)}
                    placeholder="Filter symbol..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="time">Sort by Time</option>
                  <option value="confidence">Sort by Confidence</option>
                  <option value="rr">Sort by R:R</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={showRejected}
                    onChange={(e) => setShowRejected(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  Show Rejected
                </label>
              </div>
            </div>

            {/* Signals List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Zap size={32} className="mx-auto mb-2 opacity-50" />
                  No signals found matching your filters
                  {connectionStatus === 'connected' ? (
                    <p className="text-xs mt-1 text-gray-400">Analyzing market data...</p>
                  ) : (
                    <p className="text-xs mt-1 text-gray-400">Connect to WebSocket to receive live signals</p>
                  )}
                </div>
              ) : (
                filtered.map((signal) => {
                  const isExpanded = expandedId === signal.id;
                  const statusColors = {
                    live: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20',
                    pending: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20',
                    rejected: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 opacity-70',
                    executed: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20',
                  };
                  
                  return (
                    <div key={signal.id} className={`border rounded-lg overflow-hidden transition-all ${statusColors[signal.status]}`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                            className="flex-1 flex items-center gap-3 text-left min-w-0"
                          >
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              signal.direction === 'LONG' 
                                ? 'bg-green-100 dark:bg-green-900/30' 
                                : 'bg-red-100 dark:bg-red-900/30'
                            }`}>
                              {signal.direction === 'LONG' ? (
                                <TrendingUp size={14} className="text-green-600 dark:text-green-400" />
                              ) : (
                                <TrendingDown size={14} className="text-red-600 dark:text-red-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {signal.symbol}
                                </span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                  signal.direction === 'LONG' 
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                }`}>
                                  {signal.direction}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {signal.timeframe}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                  {signal.signalSource}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                  {signal.change24h > 0 ? '+' : ''}{signal.change24h.toFixed(1)}%
                                </span>
                                <div className={`ml-auto flex items-center gap-1.5 ${getStatusTextColor(signal.status)}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(signal.status)}`} />
                                  <span className="text-xs font-medium capitalize">
                                    {signal.status}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Entry: <span className="font-mono text-gray-900 dark:text-white">${formatPrice(signal.entryPrice)}</span>
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  R:R <span className="font-mono text-gray-900 dark:text-white">1:{signal.rr}</span>
                                </span>
                                <span className={`text-xs font-bold ${
                                  signal.confidence >= 85 ? 'text-green-600 dark:text-green-400' : 
                                  signal.confidence >= 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                                  'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {signal.confidence}% conf
                                </span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                                  {signal.generatedAt}
                                </span>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {signal.status === 'pending' && (
                              <button
                                onClick={() => void handleExecuteSignal(signal)}
                                disabled={executingSignalId === signal.id}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                {executingSignalId === signal.id ? <Loader2 size={12} className="animate-spin" /> : 'Live'}
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <button
                              onClick={() => handleDeleteSignal(signal.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                              title="Delete signal"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                            {signal.rejectionReason && (
                              <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                <span>Rejected: {signal.rejectionReason}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {[
                                { label: 'Stop Loss', value: `$${formatPrice(signal.sl)}`, color: 'text-red-600 dark:text-red-400' },
                                { label: 'TP1', value: `$${formatPrice(signal.tp1)}`, color: 'text-green-600 dark:text-green-400' },
                                { label: 'TP2', value: `$${formatPrice(signal.tp2)}`, color: 'text-green-600 dark:text-green-400' },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-center">
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
                                  <p className={`text-xs font-mono font-bold ${color}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Regime:</span>
                                <span className="font-medium text-gray-900 dark:text-white capitalize">{signal.regime}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Volume Spike:</span>
                                <span className="font-medium text-gray-900 dark:text-white">{signal.volumeSpike.toFixed(1)}x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">RSI:</span>
                                <span className={`font-medium ${
                                  signal.rsi > 70 ? 'text-red-600 dark:text-red-400' : 
                                  signal.rsi < 30 ? 'text-green-600 dark:text-green-400' : 
                                  'text-gray-900 dark:text-white'
                                }`}>{signal.rsi}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">MACD:</span>
                                <span className={`font-medium capitalize ${
                                  signal.macdSignal === 'bullish' ? 'text-green-600 dark:text-green-400' : 
                                  signal.macdSignal === 'bearish' ? 'text-red-600 dark:text-red-400' : 
                                  'text-gray-500 dark:text-gray-400'
                                }`}>{signal.macdSignal}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">BB Position:</span>
                                <span className="font-medium text-gray-900 dark:text-white capitalize">{signal.bbPosition}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">24h Change:</span>
                                <span className={`font-medium ${signal.change24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {signal.change24h > 0 ? '+' : ''}{signal.change24h.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Active Indicators */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Sparkles size={14} className="text-blue-600 dark:text-blue-400" />
                Active Indicators
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {indicators.filter(i => i.enabled).length}/{indicators.length}
                </span>
              </h3>
              <div className="space-y-2">
                {indicators.map((ind) => (
                  <div key={ind.id} className="flex items-center justify-between py-1">
                    <span className={`text-xs ${ind.enabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                      {ind.label}
                    </span>
                    <span className={`text-xs ${ind.enabled ? 'text-green-500' : 'text-gray-400'}`}>
                      {ind.enabled ? '✓' : '✗'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection Stats */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Database size={14} className="text-purple-600 dark:text-purple-400" />
                Connection Status
              </h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Status</span>
                  <span className={`font-medium flex items-center gap-1 ${
                    connectionStatus === 'connected' ? 'text-green-600 dark:text-green-400' :
                    connectionStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {getConnectionIcon()}
                    {connectionStatus === 'connected' ? 'Live' : 
                     connectionStatus === 'connecting' ? 'Connecting...' :
                     connectionStatus === 'error' ? 'Error' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Total Signals</span>
                  <span className="font-medium text-gray-900 dark:text-white">{signals.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Symbols Tracked</span>
                  <span className="font-medium text-gray-900 dark:text-white">{SUPPORTED_SYMBOLS.length}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">Data Source</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {connectionStatus === 'connected' ? 'WebSocket' : 'REST API'}
                  </span>
                </div>
              </div>
            </div>

            {/* Signal Summary */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Signal Summary</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Live</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{stats.live}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Pending</span>
                  <span className="font-medium text-yellow-600 dark:text-yellow-400">{stats.pending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Rejected</span>
                  <span className="font-medium text-red-600 dark:text-red-400">{stats.rejected}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">Avg Confidence</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{stats.avgConfidence.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
