// WebSocketConfigPanel.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Radio, ToggleLeft, ToggleRight, Wifi, RefreshCw, AlertCircle } from 'lucide-react';

interface WsChannel {
  id: string;
  label: string;
  description: string;
  topic: string;
  required: boolean;
  enabled: boolean;
}

const DEFAULT_CHANNELS: WsChannel[] = [
  { id: 'kline_5m', label: 'Kline 5m', description: 'OHLCV candles — primary signal timeframe', topic: 'kline.5', required: true, enabled: true },
  { id: 'kline_15m', label: 'Kline 15m', description: 'OHLCV candles — trend confirmation', topic: 'kline.15', required: true, enabled: true },
  { id: 'orderbook', label: 'Order Book (L2)', description: 'Depth 50 — liquidity confirmation', topic: 'orderbook.50', required: false, enabled: true },
  { id: 'trades', label: 'Public Trades', description: 'Real-time trade stream for volume spikes', topic: 'publicTrade', required: false, enabled: true },
  { id: 'ticker', label: 'Ticker', description: '24h stats, mark price, funding rate', topic: 'tickers', required: false, enabled: false },
  { id: 'liquidation', label: 'Liquidations', description: 'Forced liquidation events for regime detection', topic: 'allLiquidation', required: false, enabled: false },
];

const RECONNECT_OPTIONS = ['1s', '3s', '5s', '10s'];
const PING_OPTIONS = ['10s', '20s', '30s'];

class WSConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay: number;
  private pingInterval: number;
  private isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingTimeout: NodeJS.Timeout | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;
  private onStatusCallback: ((status: 'connected' | 'disconnected' | 'reconnecting' | 'error') => void) | null = null;

  constructor(url: string, reconnectDelay: number, pingInterval: number) {
    this.url = url;
    this.reconnectDelay = reconnectDelay;
    this.pingInterval = pingInterval;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.handleReconnect();
    }
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnected = true;
      this.onStatusCallback?.('connected');
      this.startPingInterval();
      console.log('WebSocket connected');
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.onStatusCallback?.('disconnected');
      this.clearPingInterval();
      this.handleReconnect();
      console.log('WebSocket disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.onStatusCallback?.('error');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessageCallback?.(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  private handleReconnect() {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.onStatusCallback?.('reconnecting');
      this.connect();
    }, this.reconnectDelay);
  }

  private startPingInterval() {
    this.clearPingInterval();
    this.pingTimeout = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, this.pingInterval);
  }

  private clearPingInterval() {
    if (this.pingTimeout) {
      clearInterval(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  subscribe(topics: string[]) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        op: 'subscribe',
        args: topics,
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  unsubscribe(topics: string[]) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        op: 'unsubscribe',
        args: topics,
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(callback: (data: any) => void) {
    this.onMessageCallback = callback;
  }

  onStatus(callback: (status: 'connected' | 'disconnected' | 'reconnecting' | 'error') => void) {
    this.onStatusCallback = callback;
  }

  disconnect() {
    this.clearPingInterval();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export default function WebSocketConfigPanel() {
  const [channels, setChannels] = useState<WsChannel[]>(DEFAULT_CHANNELS);
  const [reconnectDelay, setReconnectDelay] = useState('3s');
  const [pingInterval, setPingInterval] = useState('20s');
  const [maxRetries, setMaxRetries] = useState('5');
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'reconnecting' | 'error'>('disconnected');
  const [testMode, setTestMode] = useState<'paper' | 'live'>('paper');
  const [receivedMessages, setReceivedMessages] = useState<number>(0);
  
  const wsConnectionRef = useRef<WSConnection | null>(null);

  const parseTimeToMs = (time: string): number => {
    const value = parseInt(time);
    if (time.endsWith('s')) return value * 1000;
    if (time.endsWith('m')) return value * 60 * 1000;
    return value;
  };

  const connectWebSocket = () => {
    const wsUrl = testMode === 'paper' 
      ? 'wss://stream-testnet.bybit.com/v5/public/linear'
      : 'wss://stream.bybit.com/v5/public/linear';
    
    const reconnectMs = parseTimeToMs(reconnectDelay);
    const pingMs = parseTimeToMs(pingInterval);
    
    if (wsConnectionRef.current) {
      wsConnectionRef.current.disconnect();
    }
    
    const connection = new WSConnection(wsUrl, reconnectMs, pingMs);
    wsConnectionRef.current = connection;
    
    connection.onStatus((status) => {
      setConnectionStatus(status);
    });
    
    connection.onMessage((data) => {
      setReceivedMessages(prev => prev + 1);
      if (data.topic) {
        console.log(`Received ${data.topic} data:`, data.data);
      }
    });
    
    connection.connect();
  };

  const disconnectWebSocket = () => {
    if (wsConnectionRef.current) {
      wsConnectionRef.current.disconnect();
      wsConnectionRef.current = null;
    }
    setConnectionStatus('disconnected');
  };

  const testConnection = () => {
    if (connectionStatus === 'connected' || connectionStatus === 'reconnecting') {
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
    
    if (wsConnectionRef.current && connectionStatus === 'connected') {
      const activeTopics = channels.filter(c => c.enabled).map(c => c.topic);
      wsConnectionRef.current.subscribe(activeTopics);
    }
  };

  const enabledCount = channels.filter((c) => c.enabled).length;
  const activeTopics = channels.filter(c => c.enabled).map(c => c.topic);

  useEffect(() => {
    return () => {
      if (wsConnectionRef.current) {
        wsConnectionRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-warning-subtle">
          <Radio size={18} className="text-warning" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">WebSocket Subscriptions</h2>
          <p className="text-muted-foreground text-xs mt-0.5">Configure live data channels and reconnection behavior</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground">
          <Wifi size={11} className={connectionStatus === 'connected' ? 'text-positive' : 'text-muted-foreground'} />
          {enabledCount} active
        </div>
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-2 flex-1">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-positive' :
            connectionStatus === 'reconnecting' ? 'bg-warning' :
            connectionStatus === 'error' ? 'bg-negative' : 'bg-muted-foreground'
          }`} />
          <span className="text-xs font-medium text-foreground">
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'reconnecting' ? 'Reconnecting...' :
             connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2">
            {testMode === 'paper' ? 'Testnet' : 'Mainnet'}
          </span>
          {connectionStatus === 'connected' && (
            <span className="text-[10px] text-muted-foreground ml-2">
              Messages: {receivedMessages}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={testMode}
            onChange={(e) => setTestMode(e.target.value as 'paper' | 'live')}
            className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
          <button
            onClick={testConnection}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              connectionStatus === 'connected' 
                ? 'bg-negative text-white hover:bg-negative/90' 
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {connectionStatus === 'connected' ? 'Disconnect' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Channel list */}
      <div className="space-y-2 mb-5">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              ch.enabled ? 'bg-background border-border' : 'bg-muted/30 border-border/50'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-xs font-semibold ${ch.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
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

      {/* Reconnection settings */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={13} className="text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reconnection Settings</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Reconnect Delay</label>
            <select
              value={reconnectDelay}
              onChange={(e) => { setReconnectDelay(e.target.value); setSaved(false); }}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {RECONNECT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Ping Interval</label>
            <select
              value={pingInterval}
              onChange={(e) => { setPingInterval(e.target.value); setSaved(false); }}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {PING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Max Retries</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxRetries}
              onChange={(e) => { setMaxRetries(e.target.value); setSaved(false); }}
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

      {connectionStatus === 'connected' && (
        <div className="mt-3 p-2 rounded-lg bg-positive-subtle border border-positive/20 text-[10px] text-positive flex items-center gap-2">
          <AlertCircle size={12} />
          Active subscriptions: {activeTopics.join(', ')}
        </div>
      )}
    </div>
  );
}