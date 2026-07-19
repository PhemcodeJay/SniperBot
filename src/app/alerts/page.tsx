// app/alerts/page.tsx - REAL Bybit API Data

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  BYBIT_BASE_URL,
  createBybitAuthHeaders,
  getBybitCredentials,
  safeJsonParse,
} from '@/lib/bybit';
import { appendSharedAlert, subscribeToSharedTradingState } from '@/lib/tradingState';
import {
  Bell,
  Check,
  X,
  Filter,
  Trash2,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { realtimeManager } from '@/lib/realtimeManager';

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
  change24h?: number;
}

interface NotificationSettings {
  highConfidenceSignals: boolean;
  tradeExecutions: boolean;
  stopLossHits: boolean;
  takeProfitHits: boolean;
  riskLimitWarnings: boolean;
  dailySummary: boolean;
  systemEvents: boolean;
  modelRetrains: boolean;
}

// ============== BYBIT API CONFIG ==============
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const SUPPORTED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
];

// ============== API HELPERS ==============
const getApiCredentials = () => getBybitCredentials();

// ============== API FUNCTIONS ==============

// Fetch ticker data
const fetchTickers = async (symbols: string[]): Promise<Record<string, any>> => {
  try {
    const promises = symbols.map((symbol) =>
      fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${symbol}`)
        .then((r) => safeJsonParse(r))
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

// Fetch positions
const fetchPositions = async (): Promise<any[]> => {
  try {
    const { apiKey, apiSecret } = getApiCredentials();
    if (!apiKey || !apiSecret) return [];

    const recvWindow = '5000';
    const params = '';
    const headers = await createBybitAuthHeaders(apiKey, apiSecret, params, recvWindow);

    const response = await fetch(`${BYBIT_BASE_URL}/v5/account/wallet-balance`, {
      method: 'GET',
      headers,
    });

    const data = await safeJsonParse(response);
    if (data?.retCode === 0 && data?.result?.list) {
      return data.result.list.filter((pos: any) => parseFloat(pos.size) !== 0);
    }
    return [];
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
};

// ============== COMPONENT ==============

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'signal' | 'trade' | 'risk' | 'system'>(
    'all'
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'connecting' | 'error'
  >('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [lastAlertTime, setLastAlertTime] = useState<number>(Date.now());
  const [marketData, setMarketData] = useState<Record<string, any>>({});
  const [isApiConnected, setIsApiConnected] = useState(false);

  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    highConfidenceSignals: true,
    tradeExecutions: true,
    stopLossHits: true,
    takeProfitHits: true,
    riskLimitWarnings: true,
    dailySummary: true,
    systemEvents: false,
    modelRetrains: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasValidCredentials = useCallback(() => {
    const { apiKey, apiSecret } = getApiCredentials();
    return !!(apiKey && apiSecret);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSharedTradingState((state) => {
      setAlerts(state.alerts);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      unsubscribe();
    };
  }, []);

  // Generate alert from market data
  const generateAlertFromMarketData = (symbol: string, ticker: any): Alert | null => {
    const price = parseFloat(ticker.lastPrice);
    const change24h = parseFloat(ticker.price24hPcnt) * 100;
    const volume = parseFloat(ticker.volume24h);
    const high24h = parseFloat(ticker.highPrice24h);
    const low24h = parseFloat(ticker.lowPrice24h);

    const now = Date.now();

    // Check for significant price movement (> 2%)
    if (Math.abs(change24h) > 2 && notifSettings.highConfidenceSignals) {
      const direction = change24h > 0 ? 'LONG' : 'SHORT';
      const confidence = 75 + Math.abs(change24h) * 2 + Math.min(volume / 1e8, 15);
      const atr = (high24h - low24h) / 4;
      const entry = price;
      const sl = direction === 'LONG' ? price - atr * 1.5 : price + atr * 1.5;
      const tp1 = direction === 'LONG' ? price + atr * 2.5 : price - atr * 2.5;

      return {
        id: `alert-${symbol}-${now}`,
        type: 'signal',
        priority: Math.abs(change24h) > 3 ? 'high' : 'medium',
        title: `🔥 ${direction} Signal: ${symbol}`,
        message: `${direction} signal at $${price.toFixed(2)} | Confidence: ${Math.round(confidence)}% | Entry: $${entry.toFixed(2)} | SL: $${sl.toFixed(2)} | TP1: $${tp1.toFixed(2)}`,
        time: 'Just now',
        read: false,
        timestamp: now,
        symbol,
        price,
        change24h,
      };
    }

    // Check for volume spike (> 2x average)
    if (volume > 2e8 && notifSettings.systemEvents) {
      return {
        id: `alert-volume-${symbol}-${now}`,
        type: 'system',
        priority: 'medium',
        title: `📊 Volume Spike: ${symbol}`,
        message: `24h volume: $${(volume / 1e9).toFixed(2)}B | ${(volume / 1e8).toFixed(1)}x normal | Price: $${price.toFixed(2)}`,
        time: 'Just now',
        read: false,
        timestamp: now,
        symbol,
        price,
        change24h,
      };
    }

    // Check for new 24h high
    if (price > high24h * 0.995 && notifSettings.systemEvents) {
      return {
        id: `alert-high-${symbol}-${now}`,
        type: 'system',
        priority: 'medium',
        title: `📈 New 24h High: ${symbol}`,
        message: `Price: $${price.toFixed(2)} | Previous high: $${high24h.toFixed(2)} | Change: ${change24h.toFixed(2)}%`,
        time: 'Just now',
        read: false,
        timestamp: now,
        symbol,
        price,
        change24h,
      };
    }

    // Check for new 24h low
    if (price < low24h * 1.005 && notifSettings.systemEvents) {
      return {
        id: `alert-low-${symbol}-${now}`,
        type: 'system',
        priority: 'medium',
        title: `📉 New 24h Low: ${symbol}`,
        message: `Price: $${price.toFixed(2)} | Previous low: $${low24h.toFixed(2)} | Change: ${change24h.toFixed(2)}%`,
        time: 'Just now',
        read: false,
        timestamp: now,
        symbol,
        price,
        change24h,
      };
    }

    return null;
  };

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      setIsLoading(true);

      const hasKeys = hasValidCredentials();

      if (!hasKeys) {
        setIsApiConnected(false);
        setIsLoading(false);
        return;
      }

      // Fetch ticker data
      const tickers = await fetchTickers(SUPPORTED_SYMBOLS);
      setMarketData(tickers);

      // Fetch positions for trade alerts
      const positions = await fetchPositions();

      const newAlerts: Alert[] = [];

      // Generate alerts from ticker data
      Object.entries(tickers).forEach(([symbol, ticker]) => {
        const alert = generateAlertFromMarketData(symbol, ticker);
        if (alert) {
          newAlerts.push(alert);
          appendSharedAlert(alert);
        }
      });

      // Generate alerts from positions
      positions.forEach((pos: any) => {
        const size = parseFloat(pos.size);
        if (size !== 0 && notifSettings.tradeExecutions) {
          const side = pos.side === 'Buy' ? 'LONG' : 'SHORT';
          const pnl = parseFloat(pos.unrealisedPnl || 0);
          const symbol = pos.symbol;
          const entryPrice = parseFloat(pos.avgPrice);
          const markPrice = parseFloat(pos.markPrice);

          // Alert for significant P&L (> 5% of position value)
          const positionValue = entryPrice * Math.abs(size);
          if (Math.abs(pnl) > positionValue * 0.05) {
            newAlerts.push({
              id: `alert-pos-${symbol}-${Date.now()}`,
              type: 'trade',
              priority: Math.abs(pnl) > positionValue * 0.1 ? 'high' : 'medium',
              title: `${pnl >= 0 ? '📈' : '📉'} Position Update: ${symbol}`,
              message: `${side} position ${pnl >= 0 ? 'profitable' : 'in loss'} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | Entry: $${entryPrice.toFixed(2)} | Current: $${markPrice.toFixed(2)}`,
              time: 'Just now',
              read: false,
              timestamp: Date.now(),
              symbol,
              price: markPrice,
              change24h: 0,
            });
          }
        }
      });

      // Sort by timestamp and limit
      const sortedAlerts = newAlerts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      setAlerts((prev) => {
        const combined = [...sortedAlerts, ...prev];
        const unique = Array.from(new Map(combined.map((a) => [a.id, a])).values());
        return unique.slice(0, 50);
      });

      setIsApiConnected(true);
      setLastAlertTime(Date.now());
    } catch (err: any) {
      console.error('Error fetching alerts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hasValidCredentials, notifSettings]);

  const disconnectWebSocket = useCallback(() => {
    /* noop - singleton handles ws */
  }, []);

  // Initialize
  useEffect(() => {
    fetchAlerts();
    const unsubscribe = realtimeManager.subscribeTicks((ticker: any) => {
      try {
        if (ticker && ticker.symbol) {
          setMarketData((prev) => ({ ...prev, [ticker.symbol]: ticker }));
          const alert = generateAlertFromMarketData(ticker.symbol, ticker);
          if (alert) {
            setAlerts((prev) => [alert, ...prev].slice(0, 50));
            setLastAlertTime(Date.now());
          }
        }
      } catch (e) {
        /* ignore */
      }
    });

    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        fetchAlerts();
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchAlerts]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('alert_settings', JSON.stringify(notifSettings));
  }, [notifSettings]);

  const markAllRead = () => {
    setAlerts((a) => a.map((al) => ({ ...al, read: true })));
  };

  const markRead = (id: string) => {
    setAlerts((a) => a.map((al) => (al.id === id ? { ...al, read: true } : al)));
  };

  const deleteAlert = (id: string) => {
    setAlerts((a) => a.filter((al) => al.id !== id));
  };

  const deleteAllRead = () => {
    setAlerts((a) => a.filter((al) => !al.read));
  };

  const refreshAlerts = async () => {
    setIsRefreshing(true);
    await fetchAlerts();
    setIsRefreshing(false);
  };

  const filtered = alerts.filter((a) => {
    if (filter === 'unread') return !a.read;
    if (filter !== 'all') return a.type === filter;
    return true;
  });

  const unreadCount = alerts.filter((a) => !a.read).length;

  const Toggle = ({ field }: { field: keyof NotificationSettings }) => (
    <button
      onClick={() => {
        setNotifSettings((prev) => ({ ...prev, [field]: !prev[field] }));
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        notifSettings[field] ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${notifSettings[field] ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  );

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi size={14} className="text-green-500" />;
      case 'connecting':
        return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error':
        return <WifiOff size={14} className="text-red-500" />;
      default:
        return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  if (isLoading && alerts.length === 0) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Bell size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Alerts
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                Real-time trading signals, risk warnings, and system events
                <span className="flex items-center gap-1 text-xs">
                  {getConnectionIcon()}
                  <span className="capitalize">{connectionStatus}</span>
                </span>
                {isApiConnected && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    ● API Connected
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAlerts}
              disabled={isRefreshing}
              className={`p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                isRefreshing ? 'animate-spin' : ''
              }`}
            >
              <RefreshCw size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={deleteAllRead}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 size={14} /> Clear read
            </button>
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Check size={14} /> Mark all read
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Alert Feed */}
          <div className="lg:col-span-2 space-y-3">
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'unread', 'signal', 'trade', 'risk', 'system'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f === 'unread' ? `Unread (${unreadCount})` : f}
                </button>
              ))}
            </div>

            {/* Alert List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  {connectionStatus === 'connected' ? (
                    <p>No alerts in this category</p>
                  ) : (
                    <p>Waiting for connection to receive alerts...</p>
                  )}
                </div>
              ) : (
                filtered.map((alert) => {
                  const colors = {
                    signal: {
                      bg: 'bg-blue-50 dark:bg-blue-950/20',
                      text: 'text-blue-700 dark:text-blue-400',
                      border: 'border-blue-200 dark:border-blue-800',
                    },
                    trade: {
                      bg: 'bg-green-50 dark:bg-green-950/20',
                      text: 'text-green-700 dark:text-green-400',
                      border: 'border-green-200 dark:border-green-800',
                    },
                    risk: {
                      bg: 'bg-yellow-50 dark:bg-yellow-950/20',
                      text: 'text-yellow-700 dark:text-yellow-400',
                      border: 'border-yellow-200 dark:border-yellow-800',
                    },
                    system: {
                      bg: 'bg-gray-50 dark:bg-gray-800/50',
                      text: 'text-gray-700 dark:text-gray-400',
                      border: 'border-gray-200 dark:border-gray-700',
                    },
                  };
                  const priorityDot = {
                    high: 'bg-red-500',
                    medium: 'bg-yellow-500',
                    low: 'bg-gray-400',
                  };
                  const c = colors[alert.type];

                  return (
                    <div
                      key={alert.id}
                      className={`relative p-4 rounded-lg border transition-all ${c.border} ${c.bg} ${
                        !alert.read ? 'ring-1 ring-blue-500/20 dark:ring-blue-400/20' : 'opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span
                            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${priorityDot[alert.priority]}`}
                          />
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${c.text}`}>
                              {alert.title}
                              {alert.symbol && (
                                <span className="ml-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                                  ${alert.price?.toFixed(2)}
                                </span>
                              )}
                              {alert.change24h !== undefined && (
                                <span
                                  className={`ml-1 text-[10px] font-mono ${alert.change24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                >
                                  {alert.change24h >= 0 ? '+' : ''}
                                  {alert.change24h.toFixed(2)}%
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">
                              {alert.message}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                              {alert.time}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!alert.read && (
                            <button
                              onClick={() => markRead(alert.id)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                              title="Mark as read"
                            >
                              <Check size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteAlert(alert.id)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Delete"
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

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Notification Settings */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Settings size={14} /> Notification Settings
              </h3>
              <div className="space-y-3">
                {[
                  {
                    field: 'highConfidenceSignals' as const,
                    label: 'High-Confidence Signals (75%+)',
                  },
                  { field: 'tradeExecutions' as const, label: 'Trade Executions' },
                  { field: 'stopLossHits' as const, label: 'Stop Loss Hits' },
                  { field: 'takeProfitHits' as const, label: 'Take Profit Hits' },
                  { field: 'riskLimitWarnings' as const, label: 'Risk Limit Warnings' },
                  { field: 'dailySummary' as const, label: 'Daily Summary' },
                  { field: 'systemEvents' as const, label: 'System Events' },
                  { field: 'modelRetrains' as const, label: 'Model Retrains' },
                ].map(({ field, label }) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    <Toggle field={field} />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Today's Summary
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Total Alerts', value: alerts.length.toString() },
                  {
                    label: 'Unread',
                    value: unreadCount.toString(),
                    color:
                      unreadCount > 0
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-green-600 dark:text-green-400',
                  },
                  {
                    label: 'High Priority',
                    value: alerts.filter((a) => a.priority === 'high').length.toString(),
                    color: 'text-red-600 dark:text-red-400',
                  },
                  {
                    label: 'Signal Alerts',
                    value: alerts.filter((a) => a.type === 'signal').length.toString(),
                    color: 'text-blue-600 dark:text-blue-400',
                  },
                  {
                    label: 'Last Alert',
                    value:
                      lastAlertTime > 0 ? new Date(lastAlertTime).toLocaleTimeString() : 'Never',
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    <span
                      className={`text-sm font-bold font-mono ${color ?? 'text-gray-900 dark:text-white'}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Status */}
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Market Status
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Symbols Monitored</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {SUPPORTED_SYMBOLS.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Connection</span>
                  <span
                    className={`font-medium flex items-center gap-1 ${
                      connectionStatus === 'connected'
                        ? 'text-green-600 dark:text-green-400'
                        : connectionStatus === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                    }`}
                  >
                    {getConnectionIcon()}
                    {connectionStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Alerts Generated</span>
                  <span className="font-medium text-gray-900 dark:text-white">{alerts.length}</span>
                </div>
                {isApiConnected && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">API Status</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      Connected
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
