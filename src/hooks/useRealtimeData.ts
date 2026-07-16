// hooks/useRealtimeData.ts
// Real-time data updates for dashboard - polls all metrics simultaneously

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { requestManager } from '@/lib/requestManager';
import { logger } from '@/lib/logger';
import { realtimeManager } from '@/lib/realtimeManager';

export interface RealtimeData {
  balance: {
    totalEquity: number;
    availableBalance: number;
    totalMarginBalance: number;
    accountIMRate: string;
    totalInitialMargin: string;
    totalAvailableBalance: string;
  };
  positions: Array<{
    symbol: string;
    side: 'Buy' | 'Sell' | 'None';
    size: string;
    entryPrice: string;
    markPrice: string;
    leverage: string;
    unrealisedPnl: string;
    positionValue: string;
    createdTime: string;
    updatedTime: string;
  }>;
  openOrders: Array<any>;
  lastUpdate: number;
}

export interface UseRealtimeDataOptions {
  pollInterval?: number; // milliseconds
  enabled?: boolean;
  onError?: (error: Error) => void;
}

const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds

export function useRealtimeData(options: UseRealtimeDataOptions = {}) {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    enabled = true,
    onError,
  } = options;

  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);
  const unsubscribeRef = useRef<() => void | null>(null);

  const fetchRealtimeData = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      // Let the singleton manager do the heavy work and subscribe for one-off data
      realtimeManager.triggerRefresh();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      if (onError) onError(error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [enabled, onError]);


  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) return;

    // Subscribe to manager data updates
    const unsubscribeData = realtimeManager.subscribeData((payload) => {
      if (!isMountedRef.current) return;
      const walletBalance = payload.wallet?.result?.list?.[0] || {};
      const positions = payload.positions?.result?.list || [];
      const openOrders = payload.orders?.result?.list || [];

      setData({
        balance: {
          totalEquity: parseFloat(walletBalance.totalEquity || '0'),
          availableBalance: parseFloat(walletBalance.availableBalance || '0'),
          totalMarginBalance: walletBalance.totalMarginBalance || '0',
          accountIMRate: walletBalance.accountIMRate || '0',
          totalInitialMargin: walletBalance.totalInitialMargin || '0',
          totalAvailableBalance: walletBalance.totalAvailableBalance || '0',
        },
        positions,
        openOrders,
        lastUpdate: payload.lastUpdate || Date.now(),
      });
    });

    unsubscribeRef.current = unsubscribeData;

    // Also subscribe to tick messages if consumer wants to react to ticks
    const unsubscribeTicks = realtimeManager.subscribeTicks((tick) => {
      // noop here — pages/components may use their own tick subscriptions
    });

    // cleanup
    return () => {
      isMountedRef.current = false;
      unsubscribeData();
      unsubscribeTicks();
    };
  }, [enabled]);

  return {
    data,
    loading,
    error,
    refetch: fetchRealtimeData,
  };
}
