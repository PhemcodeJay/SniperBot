// app/page.tsx - Main Dashboard with secure Bybit API proxy
'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import AppLayout from '@/components/AppLayout';
import { formatUsd } from '@/lib/formatters';
import { useSharedRealtimeData } from '@/lib/realtimeDataContext';
import {
  appendSharedAlert,
  calculateLivePnl,
  getSharedTradingState,
  setSharedBalance,
  setSharedBotState,
  setSharedMetrics,
  setSharedSignals,
  subscribeToSharedTradingState,
} from '@/lib/tradingState';
import {
  getPaperState,
  openPaperPosition,
  closePaperPosition as closePaperPos,
  updatePaperPositions,
  PaperPosition,
} from '@/lib/paperTrading';
import { autoExecutor } from '@/lib/autoExecutor';
import { requestManager } from '@/lib/requestManager';
import { addLiveTrade, type LiveTradeRecord } from '@/lib/liveTrades';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Zap,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Wallet,
  BarChart3,
  Play,
  StopCircle,
  Settings,
  Loader2,
  X,
  Plus,
  Minus,
  Shield,
  Bell,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  Database,
  CheckCircle,
  Server,
  Network,
  Sparkles,
  ExternalLink,
  LayoutDashboard,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { realtimeManager } from '@/lib/realtimeManager';

// Public Bybit API endpoint (no auth required for market data)
const BYBIT_BASE_URL = 'https://api.bybit.com';

const SUPPORTED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT',
];

// Types
interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  duration: string;
  leverage: number;
  liquidationPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionIdx?: number;
  orderId?: string;
}

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
  timeframe: string;
  status: 'pending' | 'live' | 'rejected' | 'executed';
  generatedAt: string;
  change24h: number;
  volume: number;
  regime: string;
  signalSource: 'ml' | 'technical' | 'hybrid';
}

interface Alert {
  id: string;
  type: 'signal' | 'trade' | 'risk' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  time: string;
  read: boolean;
  timestamp: number;
  symbol?: string;
  price?: number;
}

interface AccountMetrics {
  totalBalance: number;
  availableBalance: number;
  equity: number;
  totalPnl: number;
  totalPnlPct: number;
  dailyPnl: number;
  dailyPnlPct: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  riskExposure: number;
}

interface BotStatus {
  isRunning: boolean;
  mode: 'paper' | 'live';
  status: 'idle' | 'scanning' | 'trading' | 'error';
  lastAction: string;
  lastActionTime: string;
  uptime: string;
  autoTradingEnabled: boolean;
}

// Component
export default function Home() {
  const { data: realtimeData } = useSharedRealtimeData();

  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'signals' | 'alerts' | 'settings'>('dashboard');
  const [metrics, setMetrics] = useState<AccountMetrics>({
    totalBalance: 100, availableBalance: 100, equity: 100,
    totalPnl: 0, totalPnlPct: 0, dailyPnl: 0, dailyPnlPct: 0,
    openPositions: 0, totalTrades: 0, winRate: 0,
    maxDrawdown: 0, riskExposure: 0,
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [equityData, setEquityData] = useState<number[]>([100]);
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false, mode: 'paper', status: 'idle',
    lastAction: 'Waiting...', lastActionTime: '', uptime: '0h 0m', autoTradingEnabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botStartTime, setBotStartTime] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isExecuting, setIsExecuting] = useState(false);

  // Refs
  const positionsRef = useRef<Position[]>([]);
  const mountedRef = useRef(true);
  const fetchInProgressRef = useRef(false);
  const lastFetchRef = useRef(0);

  useEffect(() => { positionsRef.current = positions; }, [positions]);

  // Subscribe to shared state
  useEffect(() => {
    const unsubscribe = subscribeToSharedTradingState((state) => {
      setMetrics((prev) => ({ ...prev, ...state.metrics }));
      if (state.signals.length > 0) setSignals(state.signals);
      if (state.alerts.length > 0) setAlerts(state.alerts);
      setBotStatus((prev) => ({ ...prev, ...state.bot }));
    });
    return () => { unsubscribe(); };
  }, []);

  // Sync real-time data
  useEffect(() => {
    if (realtimeData?.balance) {
      const equity = realtimeData.balance.totalEquity || 100;
      setMetrics((prev) => ({
        ...prev,
        totalBalance: equity,
        availableBalance: realtimeData.balance.availableBalance || 100,
        equity,
      }));
    }
    if (realtimeData?.positions) {
      const livePositions: Position[] = realtimeData.positions
        .filter((pos: any) => parseFloat(pos.size) !== 0)
        .map((pos: any) => {
          const size = parseFloat(pos.size);
          const side: 'LONG' | 'SHORT' = pos.side === 'Buy' ? 'LONG' : 'SHORT';
          const entryPrice = parseFloat(pos.avgPrice || pos.entryPrice || 0);
          const currentPrice = parseFloat(pos.markPrice || pos.currentPrice || 0);
          const pnl = parseFloat(pos.unrealisedPnl || 0);
          const pnlPct = entryPrice > 0 ? (pnl / (entryPrice * Math.abs(size))) * 100 : 0;
          return {
            id: `pos-${pos.symbol}-${pos.positionIdx || 0}`,
            symbol: pos.symbol, side, entryPrice, currentPrice, size: Math.abs(size),
            pnl, pnlPct, entryTime: pos.createdTime ? new Date(parseInt(pos.createdTime)).toISOString() : new Date().toISOString(),
            duration: pos.createdTime ? `${Math.floor((Date.now() - parseInt(pos.createdTime)) / 60000)}m` : '0m',
            leverage: parseFloat(pos.leverage || 5),
            liquidationPrice: parseFloat(pos.liqPrice || 0),
            stopLoss: parseFloat(pos.stopLoss || 0),
            takeProfit: parseFloat(pos.takeProfit || 0),
            positionIdx: parseInt(pos.positionIdx || 0), orderId: pos.orderId,
          };
        });
      if (livePositions.length > 0) setPositions(livePositions);
    }
  }, [realtimeData]);

  // Fetch market tickers (public endpoint)
  const fetchTickers = useCallback(async () => {
    try {
      const promises = SUPPORTED_SYMBOLS.map((symbol) =>
        fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${symbol}`, {
          signal: AbortSignal.timeout(5000),
        })
          .then((r) => r.json())
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
    } catch { return {}; }
  }, []);

  // Fetch balance via secure proxy
  const fetchBalance = useCallback(async () => {
    try {
      const response = await requestManager.executeWithRateLimit<any>('/api/bybit', {
        method: 'POST',
        body: JSON.stringify({ endpoint: '/v5/account/wallet-balance', method: 'GET' }),
      });
      if (response?.retCode === 0 && response?.result?.list?.[0]) {
        const wallet = response.result.list[0];
        const totalEquity = parseFloat(wallet.totalEquity || wallet.equity || '100');
        const availableBalance = parseFloat(wallet.availableBalance || wallet.available || '100');
        return { totalEquity, availableBalance };
      }
      return { totalEquity: 100, availableBalance: 100 };
    } catch {
      return { totalEquity: 100, availableBalance: 100 };
    }
  }, []);

  // Generate signals from tickers
  const generateSignalsFromTickers = useCallback((tickers: Record<string, any>): Signal[] => {
    const now = Date.now();
    const rt = new Date().toLocaleTimeString();
    const newSignals: Signal[] = [];

    for (const symbol of Object.keys(tickers)) {
      const ticker = tickers[symbol];
      if (!ticker) continue;

      const price = parseFloat(ticker.lastPrice);
      if (!price || !isFinite(price)) continue;

      const change24h = parseFloat(ticker.price24hPcnt) * 100;
      const volume = parseFloat(ticker.volume24h);

      if (Math.abs(change24h) > 1.5) {
        const isLong = change24h > 0;
        const confidence = Math.min(95, Math.round(70 + Math.abs(change24h) * 2 + Math.min(volume / 1e8, 15)));
        const atr = price * 0.01;

        newSignals.push({
          id: `sig-${symbol}-${now}`,
          symbol,
          direction: isLong ? 'LONG' : 'SHORT',
          confidence,
          entryPrice: Math.round(price * 10000) / 10000,
          sl: Math.round((isLong ? price - atr * 1.5 : price + atr * 1.5) * 10000) / 10000,
          tp1: Math.round((isLong ? price + atr * 2.5 : price - atr * 2.5) * 10000) / 10000,
          tp2: Math.round((isLong ? price + atr * 4 : price - atr * 4) * 10000) / 10000,
          rr: 1.7,
          timeframe: Math.abs(change24h) > 2 ? '15m' : '5m',
          status: confidence > 80 ? 'live' : 'pending',
          generatedAt: rt,
          change24h: Math.round(change24h * 10) / 10,
          volume,
          regime: Math.abs(change24h) > 3 ? 'trending' : 'ranging',
          signalSource: confidence > 80 ? 'hybrid' : 'technical',
        });
      }
    }
    return newSignals;
  }, []);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 2000 || fetchInProgressRef.current) return;
    lastFetchRef.current = now;
    fetchInProgressRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch tickers and balance in parallel
      const [tickers, balance] = await Promise.all([fetchTickers(), fetchBalance()]);

      if (!mountedRef.current) return;

      setMetrics((prev) => ({
        ...prev,
        totalBalance: balance.totalEquity,
        availableBalance: balance.availableBalance,
        equity: balance.totalEquity,
      }));

      // Generate signals from tickers
      const newSignals = generateSignalsFromTickers(tickers);
      if (newSignals.length > 0) {
        setSignals((prev) => {
          const merged = [...newSignals, ...prev].slice(0, 50);
          setSharedSignals(merged as any);
          return merged;
        });
      }

      setEquityData((prev) => {
        const newData = [...prev, balance.totalEquity];
        return newData.slice(-90);
      });

      setLastUpdate(new Date());
      setSharedBalance({ totalEquity: balance.totalEquity, availableBalance: balance.availableBalance, baseEquity: balance.totalEquity });
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Failed to fetch data');
    } finally {
      if (mountedRef.current) setIsLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [fetchTickers, fetchBalance, generateSignalsFromTickers]);

  // Execute trade via secure proxy
  const executeTrade = async (symbol: string, side: 'LONG' | 'SHORT', size: number, leverage: number) => {
    if (isExecuting) return;
    try {
      setIsExecuting(true);
      setError(null);

      if (botStatus.mode === 'paper') {
        let entryPrice = 0;
        try {
          const resp = await fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${symbol}`, {
            signal: AbortSignal.timeout(5000),
          });
          const data = await resp.json();
          if (data?.retCode === 0 && data?.result?.list?.[0]) {
            entryPrice = parseFloat(data.result.list[0].lastPrice) || 0;
          }
        } catch {}

        if (!entryPrice || entryPrice <= 0) {
          setError('Could not fetch live price for paper trade');
          return;
        }

        const tickers = await fetchTickers();
        const ticker = tickers[symbol];
        const atr = ticker ? (parseFloat(ticker.highPrice24h) - parseFloat(ticker.lowPrice24h)) / 4 : entryPrice * 0.01;
        const stopLoss = side === 'LONG' ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5;
        const takeProfit = side === 'LONG' ? entryPrice + atr * 2.5 : entryPrice - atr * 2.5;

        const result = openPaperPosition(symbol, side, entryPrice, size, leverage, stopLoss, takeProfit);
        if (result.success) {
          const paperState = getPaperState();
          setPositions(paperState.positions.map((p: PaperPosition) => ({
            id: p.id, symbol: p.symbol, side: p.side,
            entryPrice: p.entryPrice, currentPrice: p.currentPrice, size: p.size,
            pnl: p.pnl, pnlPct: p.pnlPct, entryTime: p.entryTime, duration: p.duration,
            leverage: p.leverage, liquidationPrice: 0, stopLoss: p.stopLoss, takeProfit: p.takeProfit,
          })));
          addAlert('trade', 'high', `📄 ${side} ${symbol} (Paper)`, `Paper position opened at $${entryPrice.toFixed(2)}`, symbol, entryPrice);
        } else {
          setError(`❌ Paper trade failed: ${result.error}`);
        }
      } else {
        // Live trading via secure proxy
        const response = await requestManager.executeWithRateLimit<any>('/api/bybit/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol,
            side: side === 'LONG' ? 'Buy' : 'Sell',
            orderType: 'Market',
            qty: size.toString(),
            leverage,
          }),
        });

        if (response?.success) {
          addAlert('trade', 'high', `✅ ${side} ${symbol}`, `Position opened with ${leverage}x leverage`, symbol);
          fetchAllData();
        } else {
          setError(`❌ Order failed: ${response?.error || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to execute trade');
    } finally {
      setIsExecuting(false);
    }
  };

  // Close position via secure proxy
  const closePosition = async (position: Position) => {
    try {
      if (botStatus.mode === 'paper') {
        let exitPrice = position.currentPrice;
        try {
          const resp = await fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${position.symbol}`, {
            signal: AbortSignal.timeout(5000),
          });
          const data = await resp.json();
          if (data?.retCode === 0 && data?.result?.list?.[0]) {
            exitPrice = parseFloat(data.result.list[0].lastPrice) || exitPrice;
          }
        } catch {}

        const result = closePaperPos(position.id, exitPrice, 'MANUAL');
        if (result.success) {
          const paperState = getPaperState();
          setPositions(paperState.positions.map((p: PaperPosition) => ({
            id: p.id, symbol: p.symbol, side: p.side,
            entryPrice: p.entryPrice, currentPrice: p.currentPrice, size: p.size,
            pnl: p.pnl, pnlPct: p.pnlPct, entryTime: p.entryTime, duration: p.duration,
            leverage: p.leverage, liquidationPrice: 0, stopLoss: p.stopLoss, takeProfit: p.takeProfit,
          })));
          addAlert('trade', 'medium', `📄 Position Closed (Paper)`, `Closed ${position.side} ${position.symbol}`, position.symbol);
        } else {
          setError(`❌ Close failed: ${result.error}`);
        }
      } else {
        // Live close via secure proxy
        const response = await requestManager.executeWithRateLimit<any>('/api/bybit/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol: position.symbol,
            side: position.side === 'LONG' ? 'Sell' : 'Buy',
            orderType: 'Market',
            qty: position.size.toString(),
            positionIdx: position.positionIdx || 0,
          }),
        });

        if (response?.success) {
          addAlert('trade', 'medium', '✅ Position Closed', `Closed ${position.side} ${position.symbol}`, position.symbol);
          fetchAllData();
        } else {
          setError(`❌ Close failed: ${response?.error || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to close position');
    }
  };

  // Add alert helper
  const addAlert = useCallback((type: Alert['type'], priority: Alert['priority'], title: string, message: string, symbol?: string, price?: number) => {
    const newAlert: Alert = {
      id: `alert-${Date.now()}`, type, priority, title, message,
      time: 'Just now', read: false, timestamp: Date.now(), symbol, price,
    };
    setAlerts((prev) => [newAlert, ...prev].slice(0, 50));
    appendSharedAlert(newAlert);
  }, []);

  // Bot controls
  const handleStartBot = useCallback(() => {
    setBotStatus((prev) => ({ ...prev, isRunning: true, status: 'trading', lastAction: 'Bot started', lastActionTime: new Date().toLocaleTimeString() }));
    setSharedBotState({ isRunning: true, status: 'trading', lastAction: 'Bot started', lastActionTime: new Date().toLocaleTimeString() });
    setBotStartTime(Date.now());
    autoExecutor.setMode('paper');
    autoExecutor.setConfig({ enabled: true });
    autoExecutor.start();
    addAlert('system', 'medium', '🤖 Bot Started', 'Trading bot activated in PAPER mode');
  }, [addAlert]);

  const handleStopBot = useCallback(() => {
    setBotStatus((prev) => ({ ...prev, isRunning: false, status: 'idle', lastAction: 'Bot stopped', lastActionTime: new Date().toLocaleTimeString(), uptime: '0h 0m' }));
    setSharedBotState({ isRunning: false, status: 'idle', lastAction: 'Bot stopped', lastActionTime: new Date().toLocaleTimeString() });
    setBotStartTime(null);
    autoExecutor.stop();
    addAlert('system', 'medium', '🛑 Bot Stopped', 'Trading bot has been deactivated');
  }, [addAlert]);

  const handleToggleMode = useCallback(() => {
    const newMode = botStatus.mode === 'live' ? 'paper' : 'live';
    setBotStatus((prev) => ({ ...prev, mode: newMode, lastAction: `Switched to ${newMode} mode`, lastActionTime: new Date().toLocaleTimeString() }));
    setSharedBotState({ mode: newMode, lastAction: `Switched to ${newMode} mode`, lastActionTime: new Date().toLocaleTimeString() });
    autoExecutor.setMode(newMode);
    if (newMode === 'paper') {
      const paperState = getPaperState();
      setMetrics((prev) => ({ ...prev, totalBalance: paperState.balance, equity: paperState.balance, openPositions: paperState.positions.length }));
      setPositions(paperState.positions.map((p: PaperPosition) => ({
        id: p.id, symbol: p.symbol, side: p.side, entryPrice: p.entryPrice,
        currentPrice: p.currentPrice, size: p.size, pnl: p.pnl, pnlPct: p.pnlPct,
        entryTime: p.entryTime, duration: p.duration, leverage: p.leverage,
        liquidationPrice: 0, stopLoss: p.stopLoss, takeProfit: p.takeProfit,
      })));
    } else {
      fetchAllData();
    }
    addAlert('system', 'low', `🔄 Switched to ${newMode} mode`, `Trading mode changed to ${newMode}`);
  }, [botStatus.mode, addAlert, fetchAllData]);

  // Initialize
  useEffect(() => {
    mountedRef.current = true;
    fetchAllData();

    const interval = setInterval(fetchAllData, 60000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, []);

  // Update bot uptime
  useEffect(() => {
    if (!botStartTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - botStartTime) / 1000);
      setBotStatus((prev) => ({ ...prev, uptime: `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m` }));
    }, 60000);
    return () => clearInterval(interval);
  }, [botStartTime]);

  // Format price helper
  const formatPrice = useCallback((price: number): string => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }, []);

  // Render
  if (isLoading && equityData.length <= 1) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
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
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg border text-sm bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity size={24} className="text-blue-600 dark:text-blue-400" />
              Live Trading Dashboard
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-sm text-gray-500 dark:text-gray-400">Real-time trading from Bybit</p>
              <span className={`text-xs px-2 py-0.5 rounded-lg ${botStatus.mode === 'live' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'}`}>
                {botStatus.mode === 'live' ? '⚠️ LIVE MODE' : '📄 PAPER MODE'}
              </span>
              <span className="text-xs text-gray-400">Updated: {lastUpdate.toLocaleTimeString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${metrics.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Total P&L: {metrics.totalPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalPnl, '$0.00', true)}
            </span>
            <button onClick={fetchAllData} disabled={isRefreshing} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              <RefreshCw size={16} className={`text-gray-600 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Equity', value: formatUsd(metrics.equity, '$0.00', true) },
            { label: 'Total P&L', value: `${metrics.totalPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalPnl, '$0.00', true)}` },
            { label: 'Daily P&L', value: `${metrics.dailyPnl >= 0 ? '+' : ''}${formatUsd(metrics.dailyPnl, '$0.00', true)}` },
            { label: 'Open Positions', value: metrics.openPositions.toString() },
            { label: 'Win Rate', value: `${metrics.winRate.toFixed(1)}%` },
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</span>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{card.value}</div>
            </div>
          ))}
        </div>

        {/* Positions and Bot Control */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Open Positions</h3>
              {positions.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">No open positions</div>
              ) : (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Symbol</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Side</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">P&L</th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => (
                        <tr key={pos.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{pos.symbol}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${pos.side === 'LONG' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                              {pos.side}
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-mono text-xs font-bold ${pos.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button onClick={() => closePosition(pos)} className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Close</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          
          <div>
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Bot size={16} className="text-blue-600 dark:text-blue-400" /> Bot Control
              </h3>
              <div className="space-y-3">
                {botStatus.isRunning ? (
                  <button onClick={handleStopBot} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                    <StopCircle size={14} /> Stop Bot
                  </button>
                ) : (
                  <button onClick={handleStartBot} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    <Play size={14} /> Start Bot
                  </button>
                )}
                <button onClick={handleToggleMode} className="w-full px-3 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  Switch to {botStatus.mode === 'live' ? 'Paper' : 'Live'} Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Signals */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap size={14} className="text-blue-600 dark:text-blue-400" /> Signal Feed
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{signals.filter((s) => s.status === 'live').length} live</span>
          </div>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {signals.length === 0 ? (
              <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">No signals available</div>
            ) : (
              signals.slice(0, 5).map((signal) => (
                <div key={signal.id} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{signal.symbol}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${signal.direction === 'LONG' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                        {signal.direction}
                      </span>
                      <span className="text-[10px] font-bold">{signal.confidence}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}