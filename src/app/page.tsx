'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  Zap, Wifi, WifiOff, RefreshCw, AlertCircle,
  CheckCircle, XCircle, Clock, Wallet, BarChart3,
  Play, Pause, StopCircle, Settings, Bell,
  ArrowUp, ArrowDown, Minus, Loader2
} from 'lucide-react';

// ============== TYPES ==============
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
  status: 'pending' | 'live' | 'rejected';
  generatedAt: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  exitTime: string;
  exitReason: string;
}

interface BotStatus {
  isRunning: boolean;
  mode: 'paper' | 'live';
  status: 'idle' | 'scanning' | 'trading' | 'error';
  lastAction: string;
  lastActionTime: string;
  uptime: string;
}

// ============== API CONFIGURATION ==============
const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5000/ws',
  endpoints: {
    account: '/account',
    positions: '/positions',
    signals: '/signals',
    trades: '/trades',
    bot: '/bot/status',
    botControl: '/bot/control',
  }
};

// ============== COMPONENTS ==============

// Dashboard Header
const DashboardHeader = ({ botStatus, onRefresh }: { botStatus: BotStatus; onRefresh: () => void }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity size={24} className="text-blue-600 dark:text-blue-400" />
          Live Trading Dashboard
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time trading monitoring and control
          </p>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            botStatus.isRunning 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${botStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {botStatus.isRunning ? 'Active' : 'Stopped'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-3 py-1.5 rounded-lg ${
          botStatus.mode === 'live' 
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
        }`}>
          {botStatus.mode === 'live' ? '⚠️ LIVE MODE' : '📄 PAPER MODE'}
        </span>
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw size={16} className={`text-gray-600 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};

// Live Metric Cards
const LiveMetricCards = ({ metrics }: { metrics: AccountMetrics }) => {
  const cards = [
    { 
      label: 'Total Equity', 
      value: `$${metrics.equity.toLocaleString()}`, 
      change: `${metrics.totalPnlPct >= 0 ? '+' : ''}${metrics.totalPnlPct.toFixed(2)}%`,
      icon: Wallet,
      color: metrics.totalPnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      changeColor: metrics.totalPnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
    },
    { 
      label: 'Daily P&L', 
      value: `${metrics.dailyPnl >= 0 ? '+' : ''}$${metrics.dailyPnl.toFixed(2)}`, 
      change: `${metrics.dailyPnlPct >= 0 ? '+' : ''}${metrics.dailyPnlPct.toFixed(2)}%`,
      icon: TrendingUp,
      color: metrics.dailyPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      changeColor: metrics.dailyPnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
    },
    { 
      label: 'Open Positions', 
      value: metrics.openPositions.toString(), 
      change: `${metrics.riskExposure.toFixed(1)}% exposure`,
      icon: BarChart3,
      color: 'text-blue-600 dark:text-blue-400',
      changeColor: 'text-gray-500 dark:text-gray-400',
    },
    { 
      label: 'Win Rate', 
      value: `${metrics.winRate.toFixed(1)}%`, 
      change: `${metrics.totalTrades} trades`,
      icon: Activity,
      color: metrics.winRate >= 60 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400',
      changeColor: 'text-gray-500 dark:text-gray-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</span>
            <card.icon size={16} className={card.color} />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</span>
          </div>
          <div className="mt-1">
            <span className={`text-xs ${card.changeColor}`}>{card.change}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Equity Sparkline
const EquitySparkline = ({ equityData }: { equityData: number[] }) => {
  const max = Math.max(...equityData);
  const min = Math.min(...equityData);
  const range = max - min || 1;
  const last = equityData[equityData.length - 1] || 0;
  const first = equityData[0] || 0;
  const trend = last - first;

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Equity Curve</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Current: ${last.toLocaleString()}</span>
          <span className={trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="h-16 relative">
        <div className="absolute inset-0 flex items-end">
          {equityData.map((value, i) => {
            const height = ((value - min) / range) * 100;
            return (
              <div
                key={i}
                className="flex-1 mx-0.5 transition-all duration-300"
                style={{ height: `${Math.max(height, 2)}%` }}
              >
                <div 
                  className={`w-full rounded-t ${trend >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ height: '100%' }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Open Positions Table
const OpenPositionsTable = ({ positions }: { positions: Position[] }) => {
  if (positions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Open Positions</h3>
        <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          <BarChart3 size={24} className="mx-auto mb-2 opacity-50" />
          No open positions
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Open Positions</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{positions.length} positions</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Symbol</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Side</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Entry</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Current</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Size</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">P&L</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Duration</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr key={pos.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{pos.symbol}</td>
                <td className="py-2 px-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    pos.side === 'LONG' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {pos.side}
                  </span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                  ${pos.entryPrice.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                  ${pos.currentPrice.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-xs text-gray-600 dark:text-gray-300">
                  {pos.size}
                </td>
                <td className={`py-2 px-2 text-right font-mono text-xs font-bold ${
                  pos.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                  <span className="text-[10px] ml-1 opacity-70">
                    ({pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%)
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {pos.duration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Bot Control Panel
const BotControlPanel = ({ 
  botStatus, 
  onStart, 
  onStop, 
  onToggleMode 
}: { 
  botStatus: BotStatus;
  onStart: () => void;
  onStop: () => void;
  onToggleMode: () => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    await onStart();
    setIsLoading(false);
  };

  const handleStop = async () => {
    setIsLoading(true);
    await onStop();
    setIsLoading(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Bot Control</h3>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
          <span className={`text-xs font-medium flex items-center gap-1 ${
            botStatus.isRunning ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${botStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {botStatus.isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>

        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-xs text-gray-500 dark:text-gray-400">Mode</span>
          <button
            onClick={onToggleMode}
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              botStatus.mode === 'live'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
            }`}
          >
            {botStatus.mode.toUpperCase()}
          </button>
        </div>

        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-xs text-gray-500 dark:text-gray-400">Uptime</span>
          <span className="text-xs font-mono text-gray-900 dark:text-white">{botStatus.uptime}</span>
        </div>

        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-xs text-gray-500 dark:text-gray-400">Last Action</span>
          <span className="text-xs text-gray-900 dark:text-white truncate max-w-[120px]">
            {botStatus.lastAction}
          </span>
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          {botStatus.isRunning ? (
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
              Stop Bot
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Start Bot
            </button>
          )}
          <button
            className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

// Signal Feed
const SignalFeed = ({ signals }: { signals: Signal[] }) => {
  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Zap size={14} className="text-blue-600 dark:text-blue-400" />
          Signal Feed
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {signals.filter(s => s.status === 'live').length} live
        </span>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {signals.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            <Zap size={24} className="mx-auto mb-2 opacity-50" />
            No signals available
          </div>
        ) : (
          signals.slice(0, 10).map((signal) => (
            <div key={signal.id} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{signal.symbol}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    signal.direction === 'LONG' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {signal.direction}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{signal.timeframe}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    signal.confidence >= 85 ? 'text-green-600 dark:text-green-400' :
                    signal.confidence >= 75 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {signal.confidence}%
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    signal.status === 'live' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : signal.status === 'pending'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {signal.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span>Entry: ${signal.entryPrice.toLocaleString()}</span>
                <span>R:R 1:{signal.rr}</span>
                <span>{signal.generatedAt}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Recent Trades Feed
const RecentTradesFeed = ({ trades }: { trades: Trade[] }) => {
  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity size={14} className="text-purple-600 dark:text-purple-400" />
          Recent Trades
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {trades.length} trades
        </span>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {trades.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            <Activity size={24} className="mx-auto mb-2 opacity-50" />
            No recent trades
          </div>
        ) : (
          trades.slice(0, 15).map((trade) => (
            <div key={trade.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-medium text-gray-900 dark:text-white">{trade.symbol}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  trade.side === 'LONG' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {trade.side}
                </span>
                <span className={`text-xs font-mono font-bold ${
                  trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct}%)
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span>{trade.exitReason}</span>
                <span className="font-mono">{trade.exitTime}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============== MAIN PAGE ==============
export default function LiveTradingDashboardPage() {
  // State
  const [metrics, setMetrics] = useState<AccountMetrics>({
    totalBalance: 100000,
    availableBalance: 85000,
    equity: 105000,
    totalPnl: 5000,
    totalPnlPct: 5.0,
    dailyPnl: 320,
    dailyPnlPct: 0.31,
    openPositions: 3,
    totalTrades: 47,
    winRate: 68.2,
    maxDrawdown: -8.4,
    riskExposure: 12.5,
  });
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equityData, setEquityData] = useState<number[]>(Array(90).fill(100000));
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false,
    mode: 'paper',
    status: 'idle',
    lastAction: 'Waiting...',
    lastActionTime: '',
    uptime: '0h 0m',
  });
  
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchAllData();
    connectWebSocket();

    return () => {
      disconnectWebSocket();
    };
  }, []);

  // Fetch all data
  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        fetchAccountMetrics(),
        fetchPositions(),
        fetchSignals(),
        fetchTrades(),
        fetchBotStatus(),
      ]);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch account metrics
  const fetchAccountMetrics = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.account}`);
      if (!response.ok) throw new Error('Failed to fetch account metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      console.error('Error fetching account metrics:', err);
    }
  };

  // Fetch positions
  const fetchPositions = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.positions}`);
      if (!response.ok) throw new Error('Failed to fetch positions');
      const data = await response.json();
      setPositions(data.positions || []);
    } catch (err) {
      console.error('Error fetching positions:', err);
      setPositions([]);
    }
  };

  // Fetch signals
  const fetchSignals = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.signals}`);
      if (!response.ok) throw new Error('Failed to fetch signals');
      const data = await response.json();
      setSignals(data.signals || []);
    } catch (err) {
      console.error('Error fetching signals:', err);
      setSignals([]);
    }
  };

  // Fetch trades
  const fetchTrades = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.trades}?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch trades');
      const data = await response.json();
      setTrades(data.trades || []);
    } catch (err) {
      console.error('Error fetching trades:', err);
      setTrades([]);
    }
  };

  // Fetch bot status
  const fetchBotStatus = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.bot}`);
      if (!response.ok) throw new Error('Failed to fetch bot status');
      const data = await response.json();
      setBotStatus(data);
    } catch (err) {
      console.error('Error fetching bot status:', err);
    }
  };

  // WebSocket connection
  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(API_CONFIG.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setError(null);
        
        startHeartbeat();
        
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: ['metrics', 'positions', 'signals', 'trades', 'bot'],
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        stopHeartbeat();
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setConnectionStatus('error');
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopHeartbeat();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const startHeartbeat = () => {
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Handle WebSocket messages
  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'metrics_update':
        setMetrics(data.data);
        break;

      case 'position_update':
        setPositions(data.positions || []);
        break;

      case 'new_position':
        setPositions(prev => [...prev, data.position]);
        break;

      case 'position_closed':
        setPositions(prev => prev.filter(p => p.id !== data.positionId));
        break;

      case 'new_signal':
        setSignals(prev => [data.signal, ...prev].slice(0, 50));
        break;

      case 'signal_update':
        setSignals(prev => prev.map(s => s.id === data.signal.id ? data.signal : s));
        break;

      case 'new_trade':
        setTrades(prev => [data.trade, ...prev].slice(0, 50));
        break;

      case 'bot_status_update':
        setBotStatus(data.status);
        break;

      case 'equity_update':
        setEquityData(prev => [...prev.slice(-89), data.equity]);
        break;

      case 'pong':
        break;

      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  // Bot controls
  const handleStartBot = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.botControl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!response.ok) throw new Error('Failed to start bot');
      await fetchBotStatus();
    } catch (err) {
      console.error('Error starting bot:', err);
      setError('Failed to start bot');
    }
  };

  const handleStopBot = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.botControl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      if (!response.ok) throw new Error('Failed to stop bot');
      await fetchBotStatus();
    } catch (err) {
      console.error('Error stopping bot:', err);
      setError('Failed to stop bot');
    }
  };

  const handleToggleMode = async () => {
    const newMode = botStatus.mode === 'paper' ? 'live' : 'paper';
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.botControl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_mode', mode: newMode }),
      });
      if (!response.ok) throw new Error('Failed to toggle mode');
      await fetchBotStatus();
    } catch (err) {
      console.error('Error toggling mode:', err);
      setError('Failed to toggle mode');
    }
  };

  // Reconnect
  const handleReconnect = () => {
    disconnectWebSocket();
    setTimeout(connectWebSocket, 1000);
  };

  // Loading state
  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
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
        <DashboardHeader botStatus={botStatus} onRefresh={fetchAllData} />

        {/* Connection Status */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <div className="flex items-center gap-1">
            {connectionStatus === 'connected' ? (
              <Wifi size={12} className="text-green-500" />
            ) : connectionStatus === 'error' ? (
              <WifiOff size={12} className="text-red-500" />
            ) : (
              <WifiOff size={12} className="text-gray-400" />
            )}
            <span>
              {connectionStatus === 'connected' ? 'Live' :
               connectionStatus === 'connecting' ? 'Connecting...' :
               connectionStatus === 'error' ? 'Error' : 'Disconnected'}
            </span>
          </div>
          {connectionStatus === 'error' && (
            <button
              onClick={handleReconnect}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reconnect
            </button>
          )}
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>Last update: {new Date().toLocaleTimeString()}</span>
        </div>

        {/* KPI Cards */}
        <LiveMetricCards metrics={metrics} />

        {/* Equity Curve */}
        <EquitySparkline equityData={equityData} />

        {/* Middle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <OpenPositionsTable positions={positions} />
          </div>
          <div>
            <BotControlPanel 
              botStatus={botStatus}
              onStart={handleStartBot}
              onStop={handleStopBot}
              onToggleMode={handleToggleMode}
            />
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <SignalFeed signals={signals} />
          </div>
          <div className="lg:col-span-3">
            <RecentTradesFeed trades={trades} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}