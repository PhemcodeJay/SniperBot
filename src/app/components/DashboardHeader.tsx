// app/components/DashboardHeader.tsx
// Header showing real-time account balance and status

'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Bell, Wifi, Loader2, Shield, AlertCircle } from 'lucide-react';
import { useSharedRealtimeData } from '@/lib/realtimeDataContext';
import { formatUsd } from '@/lib/formatters';

interface HeaderData {
  status: 'connected' | 'disconnected' | 'connecting' | 'authenticated';
  latency: number;
  lastUpdated: string;
  date: string;
  accountType?: string;
  uid?: string;
  balance?: number;
}

// ============== COMPONENT ==============

export default function DashboardHeader() {
  const { data: realtimeData, loading: dataLoading, error: dataError } = useSharedRealtimeData();
  
  const [data, setData] = useState<HeaderData>({
    status: 'connecting',
    latency: 0,
    lastUpdated: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [isBotActive, setIsBotActive] = useState(true);

  // Update data from real-time context
  useEffect(() => {
    if (realtimeData?.balance) {
      setData(prev => ({
        ...prev,
        status: dataError ? 'disconnected' : 'authenticated',
        balance: realtimeData.balance.totalEquity,
        lastUpdated: new Date().toLocaleTimeString(),
      }));
    }
  }, [realtimeData, dataError]);

  // Update date every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setData(prev => ({
        ...prev,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // The real-time data will update automatically
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBalance = (balance?: number) => {
    return formatUsd(balance, '---');
  };

  const statusColor = {
    connected: 'text-positive',
    authenticated: 'text-positive',
    disconnected: 'text-negative',
    connecting: 'text-warning',
  };

  const statusText = {
    connected: 'Connected',
    authenticated: 'Authenticated',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Live Trading Dashboard
          </h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
            ⚡ MAINNET
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            Unified Account
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5">
            <Wifi size={11} className={statusColor[data.status]} />
            <span>
              Bybit API · {data.status === 'connected' || data.status === 'authenticated' 
                ? 'Live' 
                : statusText[data.status]}
            </span>
          </div>
          {dataError && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertCircle size={11} />
                <span>{dataError.message}</span>
              </div>
            </>
          )}
          {typeof data.balance === 'number' && data.balance > 0 && (
            <>
              <span>·</span>
              <span className="font-mono text-foreground">Balance: {formatBalance(data.balance)}</span>
            </>
          )}
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
          aria-label={`View alerts — ${unreadAlerts} unread`}
        >
          <Bell size={14} />
          {unreadAlerts > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning border border-background" />
          )}
        </button>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
          isBotActive 
            ? 'bg-positive-subtle border-positive/20' 
            : 'bg-muted border-border'
        }`}>
          <span className="relative flex h-2 w-2">
            {isBotActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              isBotActive ? 'bg-positive' : 'bg-muted-foreground'
            }`} />
          </span>
          <span className={`text-xs font-semibold ${
            isBotActive ? 'text-positive' : 'text-muted-foreground'
          }`}>
            Bot {isBotActive ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  );
}