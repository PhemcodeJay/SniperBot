// app/components/WebSocketConfigPanel.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { realtimeManager } from '@/lib/realtimeManager';
import { Radio, ToggleLeft, ToggleRight, Wifi, RefreshCw, AlertCircle, Key } from 'lucide-react';

interface WsChannel {
  id: string;
  label: string;
  description: string;
  topic: string;
  required: boolean;
  enabled: boolean;
  category?: 'public' | 'private';
}

// Public channels (no authentication required)
const PUBLIC_CHANNELS: WsChannel[] = [
  {
    id: 'kline_5m',
    label: 'Kline 5m',
    description: 'OHLCV candles — primary signal timeframe',
    topic: 'kline.5',
    required: true,
    enabled: true,
    category: 'public',
  },
  {
    id: 'kline_15m',
    label: 'Kline 15m',
    description: 'OHLCV candles — trend confirmation',
    topic: 'kline.15',
    required: true,
    enabled: true,
    category: 'public',
  },
  {
    id: 'orderbook',
    label: 'Order Book (L2)',
    description: 'Depth 50 — liquidity confirmation',
    topic: 'orderbook.50',
    required: false,
    enabled: true,
    category: 'public',
  },
  {
    id: 'trades',
    label: 'Public Trades',
    description: 'Real-time trade stream for volume spikes',
    topic: 'publicTrade',
    required: false,
    enabled: true,
    category: 'public',
  },
  {
    id: 'ticker',
    label: 'Ticker',
    description: '24h stats, mark price, funding rate',
    topic: 'tickers',
    required: false,
    enabled: false,
    category: 'public',
  },
  {
    id: 'liquidation',
    label: 'Liquidations',
    description: 'Forced liquidation events for regime detection',
    topic: 'allLiquidation',
    required: false,
    enabled: false,
    category: 'public',
  },
];

// Private channels (require authentication - Unified Trading Account)
const PRIVATE_CHANNELS: WsChannel[] = [
  {
    id: 'position',
    label: 'Positions',
    description: 'Real-time position updates for Unified Account',
    topic: 'position',
    required: false,
    enabled: false,
    category: 'private',
  },
  {
    id: 'execution',
    label: 'Order Execution',
    description: 'Order fill and execution reports',
    topic: 'execution',
    required: false,
    enabled: false,
    category: 'private',
  },
  {
    id: 'order',
    label: 'Orders',
    description: 'Order status and updates',
    topic: 'order',
    required: false,
    enabled: false,
    category: 'private',
  },
  {
    id: 'wallet',
    label: 'Wallet Balance',
    description: 'Unified Account balance updates',
    topic: 'wallet',
    required: false,
    enabled: false,
    category: 'private',
  },
  {
    id: 'stop_order',
    label: 'Stop Orders',
    description: 'Stop order status updates',
    topic: 'stopOrder',
    required: false,
    enabled: false,
    category: 'private',
  },
];

// ============== BYBIT API CONFIG ==============
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const BYBIT_WS_PRIVATE_URL = 'wss://stream.bybit.com/v5/private/linear';

// ============== API HELPERS ==============
const getApiCredentials = () => {
  return {
    apiKey: process.env.NEXT_PUBLIC_BYBIT_API_KEY || '',
    apiSecret: process.env.NEXT_PUBLIC_BYBIT_API_SECRET || '',
  };
};

const generateWsSignature = (apiSecret: string, timestamp: string, recvWindow: string) => {
  const crypto = require('crypto');
  const paramStr = timestamp + apiSecret + recvWindow;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
};

// Note: Per-component WebSocket connections were removed in favor of the centralized
// `realtimeManager`. The previous `WSConnection` helper was intentionally removed
// to avoid creating multiple WebSocket connections from the UI.

export default function WebSocketConfigPanel() {
  const [channels, setChannels] = useState<WsChannel[]>([...PUBLIC_CHANNELS, ...PRIVATE_CHANNELS]);
  const [reconnectDelay, setReconnectDelay] = useState('3s');
  const [pingInterval, setPingInterval] = useState('20s');
  const [maxRetries, setMaxRetries] = useState('5');
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connected' | 'reconnecting' | 'error' | 'authenticated'
  >('disconnected');
  const [receivedMessages, setReceivedMessages] = useState<number>(0);
  const [useAuth, setUseAuth] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');

  const unsubscribeRef = useRef<() => void | null>(null);

  const parseTimeToMs = (time: string): number => {
    const value = parseInt(time);
    if (time.endsWith('s')) return value * 1000;
    if (time.endsWith('m')) return value * 60 * 1000;
    return value;
  };

  const getWsUrl = () => {
    return useAuth ? BYBIT_WS_PRIVATE_URL : BYBIT_WS_URL;
  };

  const connectWebSocket = () => {
    // Use singleton realtimeManager for testing subscriptions instead
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connected');
    setReceivedMessages(0);
    let localCount = 0;
    unsubscribeRef.current = realtimeManager.subscribeTicks((data: any) => {
      localCount++;
      setReceivedMessages((prev) => prev + 1);
      setConnectionStatus('connected');
      console.log('Received tick data');
    });

    // If no messages after a short window, mark as error/idle
    setTimeout(() => {
      if (localCount === 0) {
        setConnectionStatus('error');
        console.log('⚠️ No messages received during test window');
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      }
    }, 3000);
  };

  const disconnectWebSocket = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setConnectionStatus('disconnected');
  };

  const testConnection = () => {
    if (
      connectionStatus === 'connected' ||
      connectionStatus === 'reconnecting' ||
      connectionStatus === 'authenticated'
    ) {
      disconnectWebSocket();
      setTimeout(() => connectWebSocket(), 500);
    } else {
      connectWebSocket();
    }
  };

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id && !c.required ? { ...c, enabled: !c.enabled } : c))
    );
    setSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const enabledCount = channels.filter((c) => c.enabled).length;
  const activeTopics = channels.filter((c) => c.enabled).map((c) => c.topic);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  // Load API credentials from localStorage
  useEffect(() => {
    const savedCreds = localStorage.getItem('bybit_credentials');
    if (savedCreds) {
      try {
        const parsed = JSON.parse(savedCreds);
        setApiKey(parsed.apiKey || '');
        setApiSecret(parsed.apiSecret || '');
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Separate channels by category
  const publicChannels = channels.filter((c) => c.category === 'public');
  const privateChannels = channels.filter((c) => c.category === 'private');

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-warning-subtle">
          <Radio size={18} className="text-warning" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">WebSocket Subscriptions</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Configure live data channels for Unified Trading Account
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground">
          <Wifi
            size={11}
            className={
              connectionStatus === 'connected' || connectionStatus === 'authenticated'
                ? 'text-positive'
                : 'text-muted-foreground'
            }
          />
          {enabledCount} active
        </div>
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-2 flex-1">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' || connectionStatus === 'authenticated'
                ? 'bg-positive'
                : connectionStatus === 'reconnecting'
                  ? 'bg-warning'
                  : connectionStatus === 'error'
                    ? 'bg-negative'
                    : 'bg-muted-foreground'
            }`}
          />
          <span className="text-xs font-medium text-foreground">
            {connectionStatus === 'authenticated'
              ? 'Authenticated'
              : connectionStatus === 'connected'
                ? 'Connected'
                : connectionStatus === 'reconnecting'
                  ? 'Reconnecting...'
                  : connectionStatus === 'error'
                    ? 'Error'
                    : 'Disconnected'}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2">Mainnet</span>
          {connectionStatus === 'authenticated' && (
            <span className="text-[10px] text-positive ml-2">🔐 Private streams active</span>
          )}
          {(connectionStatus === 'connected' || connectionStatus === 'authenticated') && (
            <span className="text-[10px] text-muted-foreground ml-2">
              Messages: {receivedMessages}
            </span>
          )}
        </div>
        <button
          onClick={testConnection}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            connectionStatus === 'connected' || connectionStatus === 'authenticated'
              ? 'bg-negative text-white hover:bg-negative/90'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          {connectionStatus === 'connected' || connectionStatus === 'authenticated'
            ? 'Disconnect'
            : 'Test Connection'}
        </button>
      </div>

      {/* Private Channel Authentication Toggle */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Enable Private Streams</span>
            <span className="text-[10px] text-muted-foreground">(Position, Orders, Wallet)</span>
          </div>
          <button onClick={() => setUseAuth(!useAuth)} className="shrink-0 transition-colors">
            {useAuth ? (
              <ToggleRight size={22} className="text-primary" />
            ) : (
              <ToggleLeft size={22} className="text-muted-foreground" />
            )}
          </button>
        </div>
        {useAuth && (!apiKey || !apiSecret) && (
          <div className="mt-2 p-2 rounded-lg bg-warning-subtle border border-warning/20 text-[10px] text-warning flex items-center gap-2">
            <AlertCircle size={12} />
            API credentials required for private streams. Please configure in Settings.
          </div>
        )}
      </div>

      {/* Public Channels */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Public Channels
        </p>
        <div className="space-y-2">
          {publicChannels.map((ch) => (
            <div
              key={ch.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                ch.enabled ? 'bg-background border-border' : 'bg-muted/30 border-border/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-xs font-semibold ${ch.enabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {ch.label}
                  </p>
                  {ch.required && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      REQUIRED
                    </span>
                  )}
                  <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {ch.topic}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{ch.description}</p>
              </div>
              <button
                onClick={() => toggleChannel(ch.id)}
                disabled={ch.required}
                className={`shrink-0 transition-colors ${ch.required ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {ch.enabled ? (
                  <ToggleRight size={22} className="text-primary" />
                ) : (
                  <ToggleLeft size={22} className="text-muted-foreground" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Private Channels */}
      {useAuth && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Private Channels (Unified Account)
          </p>
          <div className="space-y-2">
            {privateChannels.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  ch.enabled ? 'bg-background border-border' : 'bg-muted/30 border-border/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-xs font-semibold ${ch.enabled ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {ch.label}
                    </p>
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {ch.topic}
                    </span>
                    {!apiKey || !apiSecret ? (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-warning-subtle text-warning border border-warning/20">
                        NO CREDENTIALS
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{ch.description}</p>
                </div>
                <button
                  onClick={() => toggleChannel(ch.id)}
                  disabled={!apiKey || !apiSecret}
                  className={`shrink-0 transition-colors ${!apiKey || !apiSecret ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {ch.enabled ? (
                    <ToggleRight size={22} className="text-primary" />
                  ) : (
                    <ToggleLeft size={22} className="text-muted-foreground" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconnection settings */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={13} className="text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Reconnection Settings
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">
              Reconnect Delay
            </label>
            <select
              value={reconnectDelay}
              onChange={(e) => {
                setReconnectDelay(e.target.value);
                setSaved(false);
              }}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {['1s', '3s', '5s', '10s'].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Ping Interval</label>
            <select
              value={pingInterval}
              onChange={(e) => {
                setPingInterval(e.target.value);
                setSaved(false);
              }}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {['10s', '20s', '30s'].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Max Retries</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxRetries}
              onChange={(e) => {
                setMaxRetries(e.target.value);
                setSaved(false);
              }}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className={`mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved ? 'bg-positive text-white' : 'bg-primary hover:bg-primary/90 text-white'
        }`}
      >
        {saved ? '✓ Config Saved' : 'Save WebSocket Config'}
      </button>

      {(connectionStatus === 'connected' || connectionStatus === 'authenticated') && (
        <div className="mt-3 p-2 rounded-lg bg-positive-subtle border border-positive/20 text-[10px] text-positive flex items-center gap-2">
          <AlertCircle size={12} />
          Active subscriptions: {activeTopics.join(', ')}
          {connectionStatus === 'authenticated' && (
            <span className="ml-1 text-[10px] font-medium text-positive">
              🔐 Private streams active
            </span>
          )}
        </div>
      )}
    </div>
  );
}
