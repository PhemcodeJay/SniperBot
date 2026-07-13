// ConnectionHealthPanel.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';

type HealthStatus = 'online' | 'degraded' | 'offline' | 'checking';

interface EndpointHealth {
  id: string;
  label: string;
  endpoint: string;
  mode: 'paper' | 'live' | 'both';
  status: HealthStatus;
  latency: number | null;
  lastChecked: string | null;
  note?: string;
  url: string;
}

const INITIAL_ENDPOINTS: EndpointHealth[] = [
  { 
    id: 'rest_testnet', 
    label: 'REST API (Testnet)', 
    endpoint: 'api-testnet.bybit.com', 
    mode: 'paper', 
    status: 'checking', 
    latency: null, 
    lastChecked: null,
    url: 'https://api-testnet.bybit.com/v5/market/time'
  },
  { 
    id: 'ws_testnet', 
    label: 'WebSocket (Testnet)', 
    endpoint: 'stream-testnet.bybit.com', 
    mode: 'paper', 
    status: 'checking', 
    latency: null, 
    lastChecked: null,
    url: 'wss://stream-testnet.bybit.com/v5/public/spot'
  },
  { 
    id: 'rest_mainnet', 
    label: 'REST API (Mainnet)', 
    endpoint: 'api.bybit.com', 
    mode: 'live', 
    status: 'checking', 
    latency: null, 
    lastChecked: null,
    url: 'https://api.bybit.com/v5/market/time'
  },
  { 
    id: 'ws_mainnet', 
    label: 'WebSocket (Mainnet)', 
    endpoint: 'stream.bybit.com', 
    mode: 'live', 
    status: 'checking', 
    latency: null, 
    lastChecked: null,
    url: 'wss://stream.bybit.com/v5/public/spot'
  },
  { 
    id: 'time_sync', 
    label: 'Server Time Sync', 
    endpoint: 'api.bybit.com/v5/market/time', 
    mode: 'both', 
    status: 'checking', 
    latency: null, 
    lastChecked: null, 
    note: 'Drift < 1000ms required',
    url: 'https://api.bybit.com/v5/market/time'
  },
];

const STATUS_CONFIG: Record<HealthStatus, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  online: { icon: CheckCircle2, color: 'text-positive', bg: 'bg-positive-subtle border-positive/20', label: 'Online' },
  degraded: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning-subtle border-warning/20', label: 'Degraded' },
  offline: { icon: XCircle, color: 'text-negative', bg: 'bg-negative-subtle border-negative/20', label: 'Offline' },
  checking: { icon: RefreshCw, color: 'text-muted-foreground', bg: 'bg-muted border-border', label: 'Checking' },
};

async function checkEndpointHealth(endpoint: EndpointHealth): Promise<{ status: HealthStatus; latency: number }> {
  const start = Date.now();
  
  try {
    if (endpoint.url.startsWith('wss://')) {
      return new Promise((resolve) => {
        const ws = new WebSocket(endpoint.url);
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ status: 'offline', latency: Date.now() - start });
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          const latency = Date.now() - start;
          ws.close();
          resolve({ 
            status: latency < 500 ? 'online' : 'degraded', 
            latency 
          });
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve({ status: 'offline', latency: Date.now() - start });
        };
      });
    } else {
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      const latency = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        if (data.retCode === 0) {
          return { 
            status: latency < 300 ? 'online' : 'degraded', 
            latency 
          };
        }
        return { status: 'degraded', latency };
      }
      return { status: 'offline', latency };
    }
  } catch (error) {
    return { 
      status: error instanceof DOMException && error.name === 'TimeoutError' ? 'offline' : 'offline', 
      latency: Date.now() - start 
    };
  }
}

export default function ConnectionHealthPanel() {
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>(INITIAL_ENDPOINTS);
  const [isRunning, setIsRunning] = useState(false);
  const [lastFullCheck, setLastFullCheck] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    setIsRunning(true);
    setEndpoints((prev) => prev.map((e) => ({ ...e, status: 'checking', latency: null })));

    for (let i = 0; i < endpoints.length; i++) {
      const result = await checkEndpointHealth(endpoints[i]);
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setEndpoints((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, status: result.status, latency: result.latency, lastChecked: now } : e
        )
      );
      await new Promise((r) => setTimeout(r, 200));
    }

    setLastFullCheck(new Date().toLocaleTimeString('en-US', { hour12: false }));
    setIsRunning(false);
  }, [endpoints]);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const onlineCount = endpoints.filter((e) => e.status === 'online').length;
  const overallStatus: HealthStatus =
    endpoints.some((e) => e.status === 'offline') ? 'offline' :
    endpoints.some((e) => e.status === 'degraded') ? 'degraded' :
    endpoints.every((e) => e.status === 'online') ? 'online' : 'checking';

  const overall = STATUS_CONFIG[overallStatus];
  const OverallIcon = overall.icon;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-positive-subtle">
          <Activity size={18} className="text-positive" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">Connection Health</h2>
          <p className="text-muted-foreground text-xs mt-0.5">Real-time status of Bybit endpoints</p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={isRunning}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isRunning ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Overall status banner */}
      <div className={`flex items-center gap-2.5 p-3 rounded-lg border mb-4 ${overall.bg}`}>
        <OverallIcon size={15} className={`${overall.color} ${overallStatus === 'checking' ? 'animate-spin' : ''} shrink-0`} />
        <div className="flex-1">
          <p className={`text-xs font-semibold ${overall.color}`}>
            {overallStatus === 'checking' ? 'Running diagnostics...' :
             overallStatus === 'online' ? `All systems operational — ${onlineCount}/${endpoints.length} endpoints healthy` :
             overallStatus === 'degraded'? 'Some endpoints experiencing high latency' : 'One or more endpoints unreachable'}
          </p>
          {lastFullCheck && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock size={9} /> Last checked: {lastFullCheck}
            </p>
          )}
        </div>
      </div>

      {/* Endpoint rows */}
      <div className="space-y-2">
        {endpoints.map((ep) => {
          const cfg = STATUS_CONFIG[ep.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={ep.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border">
              <StatusIcon
                size={14}
                className={`${cfg.color} shrink-0 ${ep.status === 'checking' ? 'animate-spin' : ''}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-foreground">{ep.label}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                    ep.mode === 'paper' ? 'bg-primary/10 text-primary' :
                    ep.mode === 'live'? 'bg-negative-subtle text-negative' : 'bg-muted text-muted-foreground'
                  }`}>
                    {ep.mode === 'both' ? 'SHARED' : ep.mode.toUpperCase()}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{ep.endpoint}</p>
                {ep.note && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ep.note}</p>}
              </div>
              <div className="text-right shrink-0">
                {ep.status === 'checking' ? (
                  <span className="text-[11px] text-muted-foreground font-mono">—</span>
                ) : ep.latency !== null && ep.latency > 0 ? (
                  <span className={`text-[11px] font-mono font-semibold ${
                    ep.latency < 150 ? 'text-positive' : ep.latency < 400 ? 'text-warning' : 'text-negative'
                  }`}>
                    {ep.latency}ms
                  </span>
                ) : (
                  <span className="text-[11px] text-negative font-mono font-semibold">timeout</span>
                )}
                {ep.lastChecked && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">{ep.lastChecked}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}