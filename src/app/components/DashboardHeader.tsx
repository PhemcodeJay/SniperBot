// DashboardHeader.tsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, Bell, Wifi, Loader2 } from 'lucide-react';

interface HeaderData {
  status: 'connected' | 'disconnected' | 'connecting';
  latency: number;
  lastUpdated: string;
  date: string;
}

export default function DashboardHeader() {
  const [data, setData] = useState<HeaderData>({
    status: 'connecting',
    latency: 0,
    lastUpdated: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConnectionStatus = async () => {
    try {
      const start = Date.now();
      const response = await fetch('https://api.bybit.com/v5/market/time');
      const latency = Date.now() - start;

      if (response.ok) {
        setData(prev => ({
          ...prev,
          status: 'connected',
          latency,
          lastUpdated: new Date().toLocaleTimeString(),
        }));
      } else {
        setData(prev => ({ ...prev, status: 'disconnected' }));
      }
    } catch (error) {
      setData(prev => ({ ...prev, status: 'disconnected' }));
    }
  };

  useEffect(() => {
    fetchConnectionStatus();
    const interval = setInterval(fetchConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchConnectionStatus();
    setIsRefreshing(false);
  };

  const statusColor = {
    connected: 'text-positive',
    disconnected: 'text-negative',
    connecting: 'text-warning',
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Live Trading Dashboard
          </h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-info-subtle text-info border border-info/20 font-mono">
            PAPER
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Wifi size={11} className={statusColor[data.status]} />
            <span>
              Bybit WS · {data.status === 'connected' ? `${data.latency}ms latency` : data.status}
            </span>
          </div>
          <span>·</span>
          <span className="font-mono">Last updated: {data.lastUpdated}</span>
          <span>·</span>
          <span>{data.date}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80 transition-all duration-150 active:scale-95 disabled:opacity-50"
          aria-label="Refresh dashboard data"
        >
          {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
        <button
          className="relative p-2 rounded-md text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80 transition-all duration-150 active:scale-95"
          aria-label="View alerts — 3 unread"
        >
          <Bell size={14} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning border border-background" />
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-positive-subtle border border-positive/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
          </span>
          <span className="text-positive text-xs font-semibold">
            Bot Active
          </span>
        </div>
      </div>
    </div>
  );
}