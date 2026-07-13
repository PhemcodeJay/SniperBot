'use client';

import React, { useState } from 'react';
import { Radio, ToggleLeft, ToggleRight, Wifi, RefreshCw } from 'lucide-react';

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

export default function WebSocketConfigPanel() {
  const [channels, setChannels] = useState<WsChannel[]>(DEFAULT_CHANNELS);
  const [reconnectDelay, setReconnectDelay] = useState('3s');
  const [pingInterval, setPingInterval] = useState('20s');
  const [maxRetries, setMaxRetries] = useState('5');
  const [saved, setSaved] = useState(false);

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
          <Wifi size={11} className="text-positive" />
          {enabledCount} active
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
    </div>
  );
}
