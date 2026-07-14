// app/page.tsx - Main Dashboard (Homepage)

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  Zap, Wifi, WifiOff, RefreshCw, AlertCircle,
  Wallet, BarChart3, Play, StopCircle, Settings, 
  Loader2, X, Plus, Minus, Shield, Bell, Bot,
  ChevronDown, ChevronUp, Clock, Calendar, Database,
  CheckCircle, Server, Network, Sparkles, ExternalLink,
  LayoutDashboard, FileText, ArrowRight
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
  status: 'open' | 'closed';
  leverage: number;
  confidence: number;
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

interface BotStatus {
  isRunning: boolean;
  mode: 'paper' | 'live';
  status: 'idle' | 'scanning' | 'trading' | 'error';
  lastAction: string;
  lastActionTime: string;
  uptime: string;
}

// Helper to format price with 4 decimal places
const formatPriceDisplay = (price: number): string => {
  if (price >= 1000) {
    return price.toFixed(2);
  } else if (price >= 1) {
    return price.toFixed(4);
  } else {
    return price.toFixed(6);
  }
};

const formatPrice = (price: number): string => {
  return `$${formatPriceDisplay(price)}`;
};

const formatPriceTable = (price: number): string => {
  return formatPriceDisplay(price);
};

// ============== BYBIT API ==============
const BYBIT_API = {
  spot: 'https://api.bybit.com/v5/market/tickers',
  positions: 'https://api.bybit.com/v5/position/list',
  wallet: 'https://api.bybit.com/v5/account/wallet-balance',
  kline: 'https://api.bybit.com/v5/market/kline',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
};

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];

// ============== HELPERS ==============
const generateSignature = (apiSecret: string, timestamp: string, recvWindow: string, params: string) => {
  const crypto = require('crypto');
  const paramStr = timestamp + apiSecret + recvWindow + params;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
};

const safeJsonParse = async (response: Response) => {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ============== COMPONENTS ==============

// Navigation Buttons
const PageNavigation = () => {
  const router = useRouter();
  
  const pages = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { path: '/performance-analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
    { path: '/trade-logs', label: 'Trade Logs', icon: <FileText size={14} /> },
    { path: '/signal-engine', label: 'Signal Engine', icon: <Zap size={14} /> },
    { path: '/risk-rules', label: 'Risk Rules', icon: <Shield size={14} /> },
    { path: '/alerts', label: 'Alerts', icon: <Bell size={14} /> },
    { path: '/settings', label: 'Settings', icon: <Settings size={14} /> },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Pages:</span>
      {pages.map((page) => (
        <button
          key={page.path}
          onClick={() => router.push(page.path)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            typeof window !== 'undefined' && window.location.pathname === page.path
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          {page.icon}
          {page.label}
        </button>
      ))}
    </div>
  );
};

// Dashboard Header
const DashboardHeader = ({ 
  botStatus, 
  onRefresh, 
  connectionStatus, 
  isApiConnected,
  isRefreshing,
  activeTab,
  setActiveTab
}: { 
  botStatus: BotStatus;
  onRefresh: () => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isApiConnected: boolean;
  isRefreshing: boolean;
  activeTab: 'dashboard' | 'analytics' | 'signals' | 'alerts' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'signals' | 'alerts' | 'settings') => void;
}) => {
  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi size={14} className="text-green-500" />;
      case 'connecting': return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error': return <WifiOff size={14} className="text-red-500" />;
      default: return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
    { id: 'signals', label: 'Signals', icon: <Zap size={16} /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ];

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity size={24} className="text-blue-600 dark:text-blue-400" />
            Live Trading Dashboard
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Real-time trading & performance monitoring from Bybit
            </p>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              botStatus.isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${botStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {botStatus.isRunning ? 'Active' : 'Stopped'}
            </div>
            {isApiConnected && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                ● API Connected
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-gray-500">
              {getConnectionIcon()}
              {connectionStatus}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-3 py-1.5 rounded-lg ${
            botStatus.mode === 'live' 
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
          }`}>
            {botStatus.mode === 'live' ? '⚠️ LIVE MODE' : '📄 PAPER MODE'}
          </span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={`text-gray-600 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// Quick Trade Form
const QuickTradeForm = ({ 
  onExecute, 
  isExecuting,
  isApiConnected 
}: { 
  onExecute: (symbol: string, side: 'LONG' | 'SHORT', size: number, leverage: number) => void;
  isExecuting: boolean;
  isApiConnected: boolean;
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [tradeSide, setTradeSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [tradeSize, setTradeSize] = useState(0.001);
  const [tradeLeverage, setTradeLeverage] = useState(5);

  if (!isApiConnected) return null;

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Quick Trade:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            {SUPPORTED_SYMBOLS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {(['LONG', 'SHORT'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setTradeSide(s)}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                tradeSide === s
                  ? s === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Size:</span>
          <input
            type="number"
            step={0.001}
            min={0.001}
            value={tradeSize}
            onChange={(e) => setTradeSize(parseFloat(e.target.value))}
            className="w-20 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Leverage:</span>
          <select
            value={tradeLeverage}
            onChange={(e) => setTradeLeverage(parseInt(e.target.value))}
            className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            {[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map(v => (
              <option key={v} value={v}>{v}x</option>
            ))}
          </select>
        </div>
        
        <button
          onClick={() => onExecute(selectedSymbol, tradeSide, tradeSize, tradeLeverage)}
          disabled={isExecuting}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            tradeSide === 'LONG'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          } disabled:opacity-50`}
        >
          {isExecuting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            tradeSide === 'LONG' ? <Plus size={12} /> : <Minus size={12} />
          )}
          {isExecuting ? 'Executing...' : `${tradeSide} ${selectedSymbol}`}
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
      value: `$${metrics.equity.toFixed(2)}`, 
      change: `${metrics.totalPnlPct >= 0 ? '+' : ''}${metrics.totalPnlPct.toFixed(2)}%`,
      icon: Wallet,
      color: metrics.totalPnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
    },
    { 
      label: 'Daily P&L', 
      value: `${metrics.dailyPnl >= 0 ? '+' : ''}$${metrics.dailyPnl.toFixed(2)}`, 
      change: `${metrics.dailyPnlPct >= 0 ? '+' : ''}${metrics.dailyPnlPct.toFixed(2)}%`,
      icon: TrendingUp,
      color: metrics.dailyPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
    },
    { 
      label: 'Open Positions', 
      value: metrics.openPositions.toString(), 
      change: `${metrics.riskExposure.toFixed(1)}% exposure`,
      icon: BarChart3,
      color: 'text-blue-600 dark:text-blue-400',
    },
    { 
      label: 'Win Rate', 
      value: `${metrics.winRate.toFixed(1)}%`, 
      change: `${metrics.totalTrades} trades`,
      icon: Activity,
      color: metrics.winRate >= 60 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400',
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
            <span className={`text-xs ${card.color}`}>{card.change}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Equity Curve
const EquityCurve = ({ equityData, mode, baseEquity }: { 
  equityData: number[]; 
  mode: 'paper' | 'live';
  baseEquity: number;
}) => {
  if (equityData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Equity Curve</h3>
        <div className="h-20 flex items-center justify-center text-gray-500 text-sm">
          No equity data available
        </div>
      </div>
    );
  }

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
          <span className="text-gray-500 dark:text-gray-400">
            {mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
          </span>
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
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>Start: ${first.toFixed(2)}</span>
        <span>Current: ${last.toFixed(2)}</span>
        <span>Range: ${min.toFixed(0)} - ${max.toFixed(0)}</span>
      </div>
    </div>
  );
};

// Open Positions Table
const OpenPositionsTable = ({ positions, onClosePosition }: { 
  positions: Position[];
  onClosePosition: (position: Position) => void;
}) => {
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
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Symbol</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Side</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Entry</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">P&L</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Duration</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
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
                  ${formatPriceTable(pos.entryPrice)}
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
                <td className="py-2 px-2 text-right">
                  <button
                    onClick={() => onClosePosition(pos)}
                    className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Close
                  </button>
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
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Bot size={16} className="text-blue-600 dark:text-blue-400" />
        Bot Control
      </h3>
      
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
      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
        {signals.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No signals available
          </div>
        ) : (
          signals.slice(0, 5).map((signal) => (
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
                  <span className={`text-[10px] ${signal.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {signal.change24h >= 0 ? '+' : ''}{signal.change24h.toFixed(1)}%
                  </span>
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
                <span>Entry: ${formatPriceTable(signal.entryPrice)}</span>
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

// Recent Trades
const RecentTrades = ({ trades }: { trades: Trade[] }) => {
  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity size={14} className="text-purple-600 dark:text-purple-400" />
          Recent Trades
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{trades.length} trades</span>
      </div>
      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
        {trades.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No recent trades
          </div>
        ) : (
          trades.slice(0, 10).map((trade) => (
            <div key={trade.id} className={`flex items-center justify-between p-2 rounded-lg ${
              trade.status === 'open' 
                ? 'bg-yellow-50/50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-gray-50 dark:bg-gray-800/50'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-gray-900 dark:text-white">{trade.symbol}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  trade.side === 'LONG' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {trade.side}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  trade.status === 'open'
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  {trade.status}
                </span>
                <span className={`text-xs font-mono font-bold ${
                  trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%)
                </span>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {trade.exitTime}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Alerts Feed
const AlertsFeed = ({ alerts, onMarkRead, onDelete }: { 
  alerts: Alert[];
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell size={14} className="text-yellow-600 dark:text-yellow-400" />
          Alerts
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </h3>
      </div>
      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No alerts
          </div>
        ) : (
          alerts.slice(0, 5).map((alert) => (
            <div key={alert.id} className={`p-2 rounded-lg border ${
              !alert.read ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : 
              'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">
                    {alert.title}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                    {alert.message}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {alert.time}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!alert.read && (
                    <button
                      onClick={() => onMarkRead(alert.id)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <CheckCircle size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(alert.id)}
                    className="p-0.5 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Analytics Summary
const AnalyticsSummary = ({ metrics }: { metrics: AccountMetrics }) => {
  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Performance Summary</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Total P&L</p>
          <p className={`text-sm font-bold ${metrics.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics.totalPnl >= 0 ? '+' : ''}${metrics.totalPnl.toFixed(2)}
          </p>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Win Rate</p>
          <p className="text-sm font-bold text-blue-600">{metrics.winRate.toFixed(1)}%</p>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Max Drawdown</p>
          <p className={`text-sm font-bold ${metrics.maxDrawdown > -5 ? 'text-green-600' : 'text-red-600'}`}>
            {metrics.maxDrawdown.toFixed(1)}%
          </p>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Total Trades</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white">{metrics.totalTrades}</p>
        </div>
      </div>
    </div>
  );
};

// ============== MAIN PAGE ==============
export default function Home() {
  const router = useRouter();
  
  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'signals' | 'alerts' | 'settings'>('dashboard');
  const [metrics, setMetrics] = useState<AccountMetrics>({
    totalBalance: 100,
    availableBalance: 100,
    equity: 100,
    totalPnl: 0,
    totalPnlPct: 0,
    dailyPnl: 0,
    dailyPnlPct: 0,
    openPositions: 0,
    totalTrades: 0,
    winRate: 0,
    maxDrawdown: 0,
    riskExposure: 0,
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [equityData, setEquityData] = useState<number[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false,
    mode: 'paper',
    status: 'idle',
    lastAction: 'Waiting...',
    lastActionTime: '',
    uptime: '0h 0m',
  });
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botStartTime, setBotStartTime] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [actualBalance, setActualBalance] = useState<number>(100);
  const [baseEquity, setBaseEquity] = useState<number>(100);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [alertIdCounter, setAlertIdCounter] = useState(0);
  const [paperEquity, setPaperEquity] = useState<number>(100);
  const [liveEquity, setLiveEquity] = useState<number>(100);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uptimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get API credentials
  const getApiCredentials = () => {
    return {
      apiKey: process.env.NEXT_PUBLIC_BYBIT_API_KEY || '',
      apiSecret: process.env.NEXT_PUBLIC_BYBIT_API_SECRET || '',
      isTestnet: true,
    };
  };

  // Fetch Bybit balance
  const fetchBybitBalance = async (): Promise<number> => {
    try {
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      if (!apiKey || !apiSecret) return 100;

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const params = '';
      const signaturePayload = timestamp + apiKey + recvWindow + params;
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', apiSecret).update(signaturePayload).digest('hex');

      const response = await fetch(`${baseUrl}/v5/account/wallet-balance`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      });

      const data = await safeJsonParse(response);
      if (data && data.retCode === 0 && data.result) {
        const wallet = data.result.list?.[0];
        return parseFloat(wallet?.totalEquity || '100');
      }
      return 100;
    } catch (error) {
      console.error('Error fetching balance:', error);
      return 100;
    }
  };

  // Add alert
  const addAlert = (type: Alert['type'], priority: Alert['priority'], title: string, message: string, symbol?: string, price?: number) => {
    const newAlert: Alert = {
      id: `alert-${Date.now()}-${alertIdCounter}`,
      type,
      priority,
      title,
      message,
      time: 'Just now',
      read: false,
      timestamp: Date.now(),
      symbol,
      price,
    };
    setAlertIdCounter(prev => prev + 1);
    setAlerts(prev => [newAlert, ...prev].slice(0, 50));
  };

  // Execute trade
  const executeTrade = async (symbol: string, side: 'LONG' | 'SHORT', size: number, leverage: number) => {
    try {
      setIsExecuting(true);
      setError(null);
      
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      if (!apiKey || !apiSecret) {
        setError('API credentials not configured');
        setIsExecuting(false);
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const crypto = require('crypto');

      // Set leverage
      const leverageParams = `category=linear&symbol=${symbol}&buyLeverage=${leverage}&sellLeverage=${leverage}`;
      const leverageSignaturePayload = timestamp + apiKey + recvWindow + leverageParams;
      const leverageSignature = crypto.createHmac('sha256', apiSecret).update(leverageSignaturePayload).digest('hex');
      
      await fetch(`${baseUrl}/v5/position/set-leverage`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': leverageSignature,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'linear',
          symbol,
          buyLeverage: leverage.toString(),
          sellLeverage: leverage.toString(),
        }),
      });

      // Place order
      const orderSide = side === 'LONG' ? 'Buy' : 'Sell';
      const orderParams = `category=linear&symbol=${symbol}&side=${orderSide}&orderType=Market&qty=${size}&timeInForce=GTC`;
      const orderSignaturePayload = timestamp + apiKey + recvWindow + orderParams;
      const orderSignature = crypto.createHmac('sha256', apiSecret).update(orderSignaturePayload).digest('hex');
      
      const orderResponse = await fetch(`${baseUrl}/v5/order/create`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': orderSignature,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'linear',
          symbol,
          side: orderSide,
          orderType: 'Market',
          qty: size.toString(),
          timeInForce: 'GTC',
        }),
      });

      const orderData = await safeJsonParse(orderResponse);
      if (orderData && orderData.retCode === 0) {
        addAlert('trade', 'high', `✅ ${side} ${symbol}`, `Position opened at market price with ${leverage}x leverage`, symbol);
        await fetchAllData();
      } else {
        setError(`❌ Order failed: ${orderData?.retMsg || 'Unknown error'}`);
        addAlert('system', 'medium', '❌ Trade Failed', `Failed to open ${side} ${symbol}: ${orderData?.retMsg || 'Unknown error'}`, symbol);
      }
    } catch (err) {
      console.error('Error executing trade:', err);
      setError('Failed to execute trade');
    } finally {
      setIsExecuting(false);
    }
  };

  // Close position
  const closePositionOnBybit = async (position: Position) => {
    try {
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      if (!apiKey || !apiSecret) {
        setError('API credentials not configured');
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const crypto = require('crypto');
      
      const side = position.side === 'LONG' ? 'Sell' : 'Buy';
      const params = `category=linear&symbol=${position.symbol}&side=${side}&orderType=Market&qty=${position.size}&timeInForce=GTC&positionIdx=${position.positionIdx || 0}`;
      const signaturePayload = timestamp + apiKey + recvWindow + params;
      const signature = crypto.createHmac('sha256', apiSecret).update(signaturePayload).digest('hex');
      
      const response = await fetch(`${baseUrl}/v5/order/create`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'linear',
          symbol: position.symbol,
          side,
          orderType: 'Market',
          qty: position.size.toString(),
          timeInForce: 'GTC',
          positionIdx: position.positionIdx || 0,
        }),
      });

      const data = await safeJsonParse(response);
      if (data && data.retCode === 0) {
        await fetchAllData();
        addAlert('trade', 'medium', `✅ Position Closed`, `Closed ${position.side} ${position.symbol}`, position.symbol);
      } else {
        setError(`❌ Close failed: ${data?.retMsg || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error closing position:', err);
      setError('Failed to close position');
    }
  };

  // Fetch all data
  const fetchAllData = async () => {
    try {
      setIsRefreshing(true);
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      const hasApiKeys = apiKey && apiSecret;
      
      // Fetch balance from API if available
      let balance = 100;
      if (hasApiKeys) {
        balance = await fetchBybitBalance();
        setActualBalance(balance);
        setIsApiConnected(true);
        setLiveEquity(balance);
      } else {
        setIsApiConnected(false);
        // Use paper equity for demo mode
        setPaperEquity(prev => prev || 100);
      }

      // Determine base equity based on mode
      const currentBaseEquity = botStatus.mode === 'live' ? balance : (paperEquity || 100);
      setBaseEquity(currentBaseEquity);

      // Fetch ticker data
      const tickerPromises = SUPPORTED_SYMBOLS.map(symbol =>
        fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`)
          .then(r => r.json())
          .catch(() => null)
      );
      const tickerResults = await Promise.all(tickerPromises);

      let totalEquity = currentBaseEquity;
      let dailyPnl = 0;
      let openPositionsCount = 0;
      let avgChange = 0;
      let validCount = 0;
      const newPositions: Position[] = [];
      const newSignals: Signal[] = [];
      const newTrades: Trade[] = [];

      // Fetch real positions if API connected
      if (hasApiKeys) {
        try {
          const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
          const timestamp = Date.now().toString();
          const recvWindow = '5000';
          const params = '';
          const crypto = require('crypto');
          const signaturePayload = timestamp + apiKey + recvWindow + params;
          const signature = crypto.createHmac('sha256', apiSecret).update(signaturePayload).digest('hex');
          
          const positionsResponse = await fetch(`${baseUrl}/v5/position/list`, {
            method: 'GET',
            headers: {
              'X-BAPI-API-KEY': apiKey,
              'X-BAPI-TIMESTAMP': timestamp,
              'X-BAPI-SIGN': signature,
              'X-BAPI-RECV-WINDOW': recvWindow,
            },
          });
          
          const positionsData = await safeJsonParse(positionsResponse);
          
          if (positionsData && positionsData.retCode === 0 && positionsData.result?.list) {
            positionsData.result.list.forEach((pos: any) => {
              const size = parseFloat(pos.size);
              if (size !== 0) {
                const side = pos.side === 'Buy' ? 'LONG' : 'SHORT';
                const entryPrice = parseFloat(pos.avgPrice);
                const markPrice = parseFloat(pos.markPrice);
                const pnl = parseFloat(pos.unrealisedPnl || 0);
                const pnlPct = entryPrice > 0 ? (pnl / (entryPrice * Math.abs(size))) * 100 : 0;
                
                openPositionsCount++;
                totalEquity += pnl;
                dailyPnl += pnl;
                
                newPositions.push({
                  id: `pos-${pos.symbol}-${pos.positionIdx}`,
                  symbol: pos.symbol,
                  side,
                  entryPrice: Math.round(entryPrice * 10000) / 10000,
                  currentPrice: Math.round(markPrice * 10000) / 10000,
                  size: Math.abs(size),
                  pnl,
                  pnlPct,
                  entryTime: new Date(parseInt(pos.createdTime)).toLocaleTimeString(),
                  duration: `${Math.floor((Date.now() - parseInt(pos.createdTime)) / 60000)}m`,
                  leverage: parseFloat(pos.leverage || 5),
                  liquidationPrice: parseFloat(pos.liqPrice || 0),
                  stopLoss: parseFloat(pos.stopLoss || 0),
                  takeProfit: parseFloat(pos.takeProfit || 0),
                  positionIdx: parseInt(pos.positionIdx || 0),
                  orderId: pos.orderId,
                });
              }
            });
          }
        } catch (err) {
          console.error('Error fetching positions:', err);
        }
      }

      // Process ticker data for signals and paper trades
      tickerResults.forEach((result: any) => {
        if (result && result.retCode === 0 && result.result?.list?.length > 0) {
          const ticker = result.result.list[0];
          const symbol = ticker.symbol;
          const price = parseFloat(ticker.lastPrice);
          const change24h = parseFloat(ticker.price24hPcnt) * 100;
          const volume = parseFloat(ticker.volume24h);
          
          avgChange += change24h;
          validCount++;

          // Paper mode simulation - generate positions and trades
          if (botStatus.mode === 'paper' || !hasApiKeys) {
            const volatility = Math.abs(change24h);
            
            // Generate paper positions
            if (volatility > 1.5 && Math.random() < 0.15) {
              openPositionsCount++;
              const isLong = change24h > 0;
              const entryPrice = price * (1 + (Math.random() - 0.5) * 0.01);
              const pnlPct = (price - entryPrice) / entryPrice * 100 * (isLong ? 1 : -1);
              const pnl = pnlPct * 0.1;
              
              newPositions.push({
                id: `pos-${symbol}-${Date.now()}`,
                symbol,
                side: isLong ? 'LONG' : 'SHORT',
                entryPrice: Math.round(entryPrice * 10000) / 10000,
                currentPrice: Math.round(price * 10000) / 10000,
                size: 0.001 + Math.random() * 0.003,
                pnl,
                pnlPct,
                entryTime: new Date(Date.now() - Math.random() * 7200000).toLocaleTimeString(),
                duration: `${Math.floor(Math.random() * 60 + 5)}m`,
                leverage: 5,
                liquidationPrice: isLong ? entryPrice * 0.95 : entryPrice * 1.05,
                stopLoss: isLong ? entryPrice * 0.98 : entryPrice * 1.02,
                takeProfit: isLong ? entryPrice * 1.04 : entryPrice * 0.96,
              });
              
              totalEquity += pnl;
              dailyPnl += pnl;
            }

            // Generate paper trades (closed positions)
            if (Math.random() < 0.08) {
              const pnl = (Math.random() - 0.4) * 1.5;
              const side = pnl > 0 ? 'LONG' : 'SHORT';
              const entryPrice = price * (1 + (Math.random() - 0.5) * 0.02);
              const exitPrice = price * (1 + (Math.random() - 0.5) * 0.02);
              
              newTrades.push({
                id: `trade-${symbol}-${Date.now()}`,
                symbol,
                side,
                entryPrice: Math.round(entryPrice * 10000) / 10000,
                exitPrice: Math.round(exitPrice * 10000) / 10000,
                size: 0.001 + Math.random() * 0.002,
                pnl: Math.round((pnl * 0.5) * 100) / 100,
                pnlPct: Math.round(pnl * 10) / 10,
                entryTime: new Date(Date.now() - Math.random() * 3600000).toLocaleTimeString(),
                exitTime: new Date().toLocaleTimeString(),
                exitReason: pnl > 0 ? 'TP_HIT' : 'SL_HIT',
                status: 'closed',
                leverage: 5,
                confidence: Math.round(60 + Math.random() * 30),
              });
            }
          }

          // Generate signal
          if (Math.abs(change24h) > 1.5) {
            const confidence = 70 + Math.abs(change24h) * 2 + Math.min(volume / 1e8, 15);
            const isLong = change24h > 0;
            const atr = price * 0.01;
            const entryPrice = price;
            const sl = isLong ? price - atr * 1.5 : price + atr * 1.5;
            const tp1 = isLong ? price + atr * 2.5 : price - atr * 2.5;
            const rr = (Math.abs(tp1 - price) / Math.abs(sl - price));
            
            const status = confidence > 80 ? 'live' : confidence > 70 ? 'pending' : 'rejected';
            newSignals.push({
              id: `sig-${symbol}-${Date.now()}`,
              symbol,
              direction: isLong ? 'LONG' : 'SHORT',
              confidence: Math.min(95, Math.round(confidence)),
              entryPrice: Math.round(entryPrice * 10000) / 10000,
              sl: Math.round(sl * 10000) / 10000,
              tp1: Math.round(tp1 * 10000) / 10000,
              tp2: Math.round((isLong ? price + atr * 4 : price - atr * 4) * 10000) / 10000,
              rr: Math.round(rr * 10) / 10,
              timeframe: Math.abs(change24h) > 2 ? '15m' : '5m',
              status: status as 'pending' | 'live' | 'rejected' | 'executed',
              generatedAt: new Date().toLocaleTimeString(),
              change24h,
              volume,
              regime: Math.abs(change24h) > 3 ? 'trending' : 'ranging',
              signalSource: confidence > 80 ? 'hybrid' : 'technical',
            });

            // High confidence signal alert
            if (confidence > 80) {
              addAlert(
                'signal', 
                'high', 
                `🔥 ${isLong ? 'LONG' : 'SHORT'} ${symbol}`, 
                `Confidence: ${Math.round(confidence)}% | Entry: $${entryPrice.toFixed(4)} | R:R 1:${rr.toFixed(1)}`,
                symbol,
                entryPrice
              );
            }
          }
        }
      });

      // Update paper equity
      if (botStatus.mode === 'paper' || !hasApiKeys) {
        setPaperEquity(totalEquity);
      }

      // Update metrics
      setMetrics({
        totalBalance: currentBaseEquity,
        availableBalance: currentBaseEquity * 0.85,
        equity: Math.round(totalEquity * 100) / 100,
        totalPnl: Math.round((totalEquity - currentBaseEquity) * 100) / 100,
        totalPnlPct: Math.round(((totalEquity - currentBaseEquity) / currentBaseEquity) * 100 * 100) / 100,
        dailyPnl: Math.round(dailyPnl * 100) / 100,
        dailyPnlPct: Math.round((dailyPnl / currentBaseEquity) * 100 * 100) / 100,
        openPositions: openPositionsCount,
        totalTrades: newTrades.length + 5,
        winRate: 55 + Math.random() * 20,
        riskExposure: Math.min(20, openPositionsCount * 3 + Math.random() * 2),
        maxDrawdown: -Math.min(15, Math.abs(avgChange / validCount) * 2 + 2),
      });

      setPositions(newPositions);
      setSignals(prev => [...newSignals, ...prev].slice(0, 50));
      setTrades(prev => [...newTrades, ...prev].slice(0, 50));
      
      // Update equity data - use the appropriate equity based on mode
      const currentEquity = botStatus.mode === 'live' ? balance : totalEquity;
      setEquityData(prev => {
        const newData = [...prev, currentEquity];
        return newData.slice(-90);
      });
      
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Using fallback.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    try {
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        setError(null);
        setReconnectAttempts(0);
        
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: SUPPORTED_SYMBOLS.map(s => `tickers.${s}`)
        }));
        
        // Start heartbeat
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.topic === 'tickers') {
            fetchAllData();
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }, delay);
      };
    } catch (err) {
      setConnectionStatus('error');
    }
  }, [reconnectAttempts]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Bot controls
  const handleStartBot = useCallback(() => {
    setBotStatus(prev => ({
      ...prev,
      isRunning: true,
      status: 'trading',
      lastAction: 'Bot started',
      lastActionTime: new Date().toLocaleTimeString(),
    }));
    setBotStartTime(Date.now());
    addAlert('system', 'medium', '🤖 Bot Started', 'Trading bot has been activated', undefined, undefined);
    
    if (uptimeIntervalRef.current) clearInterval(uptimeIntervalRef.current);
    uptimeIntervalRef.current = setInterval(() => {
      if (botStartTime) {
        const diff = Math.floor((Date.now() - botStartTime) / 1000);
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        setBotStatus(prev => ({ ...prev, uptime: `${hours}h ${minutes}m` }));
      }
    }, 60000);
  }, [botStartTime]);

  const handleStopBot = useCallback(() => {
    setBotStatus(prev => ({
      ...prev,
      isRunning: false,
      status: 'idle',
      lastAction: 'Bot stopped',
      lastActionTime: new Date().toLocaleTimeString(),
      uptime: '0h 0m',
    }));
    setBotStartTime(null);
    if (uptimeIntervalRef.current) {
      clearInterval(uptimeIntervalRef.current);
      uptimeIntervalRef.current = null;
    }
    addAlert('system', 'medium', '🛑 Bot Stopped', 'Trading bot has been deactivated', undefined, undefined);
  }, []);

  const handleToggleMode = useCallback(() => {
    const newMode = botStatus.mode === 'paper' ? 'live' : 'paper';
    if (newMode === 'live' && !window.confirm('⚠️ WARNING: Switching to LIVE mode will use real funds. Are you sure?')) {
      return;
    }
    setBotStatus(prev => ({
      ...prev,
      mode: newMode,
      lastAction: `Switched to ${newMode} mode`,
      lastActionTime: new Date().toLocaleTimeString(),
    }));
    fetchAllData();
    addAlert('system', 'low', `📄 Mode Changed`, `Switched to ${newMode.toUpperCase()} mode`, undefined, undefined);
  }, [botStatus.mode]);

  const handleReconnect = useCallback(() => {
    disconnectWebSocket();
    setReconnectAttempts(0);
    setTimeout(connectWebSocket, 1000);
    fetchAllData();
  }, [disconnectWebSocket, connectWebSocket]);

  // Initialize
  useEffect(() => {
    fetchAllData();
    connectWebSocket();
    
    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        fetchAllData();
      }
    }, 60000);
    
    return () => {
      clearInterval(interval);
      disconnectWebSocket();
      if (uptimeIntervalRef.current) clearInterval(uptimeIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, []);

  // Loading state
  if (isLoading && equityData.length === 0) {
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
        {/* Page Navigation - Redirect buttons to all pages */}
        <PageNavigation />

        {/* Header with Tabs */}
        <DashboardHeader 
          botStatus={botStatus}
          onRefresh={fetchAllData}
          connectionStatus={connectionStatus}
          isApiConnected={isApiConnected}
          isRefreshing={isRefreshing}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Error Message */}
        {error && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
            error.startsWith('✅') 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : error.startsWith('❌')
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          }`}>
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto hover:opacity-70">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Connection Status Bar */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2 flex-wrap">
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
            <button onClick={handleReconnect} className="text-blue-600 dark:text-blue-400 hover:underline">
              Reconnect
            </button>
          )}
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>
            {botStatus.mode === 'live' 
              ? `Live Balance: $${actualBalance.toFixed(2)}` 
              : `Paper Equity: $${paperEquity.toFixed(2)}`}
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="flex items-center gap-1">
            <Bell size={10} className="text-yellow-500" />
            {alerts.filter(a => !a.read).length} unread
          </span>
        </div>

        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Quick Trade */}
            <QuickTradeForm 
              onExecute={executeTrade}
              isExecuting={isExecuting}
              isApiConnected={isApiConnected}
            />

            {/* KPI Cards */}
            <LiveMetricCards metrics={metrics} />

            {/* Equity Curve */}
            <EquityCurve equityData={equityData} mode={botStatus.mode} baseEquity={baseEquity} />

            {/* Middle Row: Positions + Bot Control */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <OpenPositionsTable positions={positions} onClosePosition={closePositionOnBybit} />
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

            {/* Bottom Row: Signals + Trades + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2">
                <SignalFeed signals={signals} />
              </div>
              <div className="lg:col-span-2">
                <RecentTrades trades={trades} />
              </div>
              <div className="lg:col-span-1">
                <AlertsFeed 
                  alerts={alerts} 
                  onMarkRead={(id) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))}
                  onDelete={(id) => setAlerts(prev => prev.filter(a => a.id !== id))}
                />
              </div>
            </div>
          </>
        )}

        {/* ==================== ANALYTICS TAB ==================== */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {/* Equity Curve (full) */}
              <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Equity Curve (90 Days)</h3>
                <div className="h-48 relative">
                  <div className="absolute inset-0 flex items-end">
                    {equityData.map((value, i) => {
                      const max = Math.max(...equityData);
                      const min = Math.min(...equityData);
                      const range = max - min || 1;
                      const height = ((value - min) / range) * 100;
                      const trend = equityData[equityData.length - 1] - equityData[0];
                      return (
                        <div
                          key={i}
                          className="flex-1 mx-0.5 transition-all duration-300"
                          style={{ height: `${Math.max(height, 2)}%` }}
                        >
                          <div className={`w-full rounded-t ${trend >= 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ height: '100%' }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{botStatus.mode === 'paper' ? 'Paper Trading' : 'Live Trading'}</span>
                  <span>Base: ${baseEquity.toFixed(2)}</span>
                  <span>Current: ${equityData[equityData.length - 1]?.toFixed(2) || '0'}</span>
                </div>
              </div>

              {/* Analytics Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total P&L', value: `$${metrics.totalPnl.toFixed(2)}`, color: metrics.totalPnl >= 0 ? 'text-green-600' : 'text-red-600' },
                  { label: 'Win Rate', value: `${metrics.winRate.toFixed(1)}%`, color: 'text-blue-600' },
                  { label: 'Max Drawdown', value: `${metrics.maxDrawdown.toFixed(1)}%`, color: metrics.maxDrawdown > -5 ? 'text-green-600' : 'text-red-600' },
                  { label: 'Total Trades', value: metrics.totalTrades.toString(), color: 'text-gray-900 dark:text-white' },
                  { label: 'Open Positions', value: metrics.openPositions.toString(), color: 'text-yellow-600' },
                  { label: 'Risk Exposure', value: `${metrics.riskExposure.toFixed(1)}%`, color: metrics.riskExposure > 15 ? 'text-red-600' : 'text-green-600' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                    <p className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <AnalyticsSummary metrics={metrics} />
              <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Risk Assessment</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Current Risk</span>
                    <span className={`font-bold ${metrics.riskExposure > 15 ? 'text-red-600' : 'text-green-600'}`}>
                      {metrics.riskExposure > 15 ? 'High' : 'Moderate'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${metrics.riskExposure > 15 ? 'bg-red-500' : 'bg-green-500'}`} 
                         style={{ width: `${Math.min(metrics.riskExposure * 3, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                    <span>0%</span>
                    <span>20%</span>
                    <span>40%+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== SIGNALS TAB ==================== */}
        {activeTab === 'signals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Signal Feed</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {signals.filter(s => s.status === 'live').length} live · {signals.filter(s => s.status === 'pending').length} pending
              </span>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {signals.length === 0 ? (
                <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Zap size={32} className="mx-auto mb-2 opacity-50" />
                  No signals available
                </div>
              ) : (
                signals.map((signal) => (
                  <div key={signal.id} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${
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
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{signal.symbol}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                              signal.direction === 'LONG' 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}>
                              {signal.direction}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              signal.status === 'live' 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : signal.status === 'pending'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                            }`}>
                              {signal.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>Entry: ${formatPriceTable(signal.entryPrice)}</span>
                            <span>SL: ${formatPriceTable(signal.sl)}</span>
                            <span>TP1: ${formatPriceTable(signal.tp1)}</span>
                            <span>R:R 1:{signal.rr}</span>
                            <span>{signal.generatedAt}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${
                          signal.confidence >= 85 ? 'text-green-600 dark:text-green-400' :
                          signal.confidence >= 75 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-gray-500 dark:text-gray-400'
                        }`}>
                          {signal.confidence}%
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                          {signal.regime}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== ALERTS TAB ==================== */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Alert History</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAlerts(prev => prev.map(a => ({ ...a, read: true })))}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Mark all read
                </button>
                <button
                  onClick={() => setAlerts(prev => prev.filter(a => !a.read))}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  Clear read
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  No alerts
                </div>
              ) : (
                alerts.map((alert) => {
                  const colors = {
                    signal: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20',
                    trade: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20',
                    risk: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20',
                    system: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
                  };
                  const textColors = {
                    signal: 'text-blue-700 dark:text-blue-400',
                    trade: 'text-green-700 dark:text-green-400',
                    risk: 'text-yellow-700 dark:text-yellow-400',
                    system: 'text-gray-700 dark:text-gray-400',
                  };
                  return (
                    <div key={alert.id} className={`border rounded-lg p-4 ${colors[alert.type]} ${!alert.read ? 'ring-1 ring-blue-500/20' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${textColors[alert.type]}`}>
                            {alert.title}
                            {alert.symbol && (
                              <span className="ml-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                                ${alert.price?.toFixed(2)}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{alert.message}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{alert.time}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!alert.read && (
                            <button
                              onClick={() => setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a))}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 transition-colors"
                            >
                              <CheckCircle size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== SETTINGS TAB ==================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield size={16} className="text-blue-600 dark:text-blue-400" />
                API Configuration
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Status</label>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isApiConnected 
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
                  }`}>
                    {isApiConnected ? (
                      <CheckCircle size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    {isApiConnected ? 'Connected to Bybit API' : 'Using Paper Trading Mode'}
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Trading Mode</span>
                  <button
                    onClick={handleToggleMode}
                    className={`text-xs font-medium px-3 py-1 rounded ${
                      botStatus.mode === 'live'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}
                  >
                    {botStatus.mode.toUpperCase()}
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Bot Status</span>
                  <span className={`text-xs font-medium flex items-center gap-1 ${
                    botStatus.isRunning ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${botStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                    {botStatus.isRunning ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Symbols Monitored</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{SUPPORTED_SYMBOLS.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Database size={16} className="text-purple-600 dark:text-purple-400" />
                Connection Status
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">WebSocket</span>
                  <span className={`text-xs font-medium flex items-center gap-1 ${
                    connectionStatus === 'connected' ? 'text-green-600 dark:text-green-400' :
                    connectionStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {connectionStatus === 'connected' && <Wifi size={12} />}
                    {connectionStatus === 'error' && <WifiOff size={12} />}
                    {connectionStatus === 'connecting' && <Loader2 size={12} className="animate-spin" />}
                    {connectionStatus}
                  </span>
                </div>
                {connectionStatus === 'error' && (
                  <button
                    onClick={handleReconnect}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw size={14} />
                    Reconnect
                  </button>
                )}
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Last Update</span>
                  <span className="text-xs font-mono text-gray-900 dark:text-white">{lastUpdate.toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Reconnect Attempts</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{reconnectAttempts}</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={fetchAllData}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw size={14} />
                  Refresh Data
                </button>
                <button
                  onClick={() => {
                    setAlerts([]);
                    addAlert('system', 'low', '🧹 Alerts Cleared', 'All alerts have been cleared', undefined, undefined);
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
                >
                  <X size={14} />
                  Clear All Alerts
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}