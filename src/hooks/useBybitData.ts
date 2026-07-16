// hooks/useBybitData.ts
// Custom hooks for Bybit data fetching with error handling

import { useEffect, useState, useRef } from 'react';
import { requestManager } from '@/lib/requestManager';
import { logger } from '@/lib/logger';

// Module-level short-lived caches to de-duplicate identical requests
const balanceCache: { data: any | null; ts: number; promise: Promise<any> | null } = { data: null, ts: 0, promise: null };
const positionsCache: { data: any[] | null; ts: number; promise: Promise<any> | null } = { data: null, ts: 0, promise: null };

// ============== BALANCE HOOK ==============
export interface BalanceData {
  totalEquity: number;
  availableBalance: number;
  totalMarginBalance: number;
  coins: Array<{
    coin: string;
    equity: string;
    walletBalance: string;
    free: string;
    locked: string;
  }>;
}

export function useBybitBalance(autoRefresh = true) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      // Use shared short-lived cache to avoid multiple components triggering
      // simultaneous identical requests.
      const now = Date.now();
      if (balanceCache.data && (now - balanceCache.ts) < 5000) {
        setData(balanceCache.data);
        setError(null);
        return;
      }

      if (balanceCache.promise) {
        const cached = await balanceCache.promise;
        setData(cached);
        setError(null);
        return;
      }

      balanceCache.promise = requestManager.executeWithRateLimit<any>(
        '/api/bybit',
        {
          method: 'POST',
          body: JSON.stringify({
            endpoint: '/v5/account/wallet-balance',
            method: 'GET',
          }),
        }
      );

      const response = await balanceCache.promise;
      balanceCache.promise = null;

      if (response.retCode === 0 && response.result?.list?.[0]) {
        const wallet = response.result.list[0];
        const parsed = {
          totalEquity: parseFloat(wallet.totalEquity || wallet.equity || '0'),
          availableBalance: parseFloat(wallet.totalAvailableBalance || wallet.availableBalance || wallet.walletBalance || '0'),
          totalMarginBalance: parseFloat(wallet.totalMarginBalance || '0'),
          coins: wallet.coin || [],
        };
        balanceCache.data = parsed;
        balanceCache.ts = Date.now();
        setData(parsed);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch balance';
      setError(message);
      logger.error('useBybitBalance', message, { error: err });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();

    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(fetchBalance, 5000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  return { data, loading, error, refetch: fetchBalance };
}

// ============== POSITIONS HOOK ==============
export interface PositionData {
  symbol: string;
  side: 'Buy' | 'Sell' | 'None';
  size: string;
  avgPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  leverage: string;
  liquidationPrice: string;
  positionIdx: number;
  createdTime: string;
  updatedTime: string;
  status: string;
}

export function useBybitPositions(autoRefresh = true) {
  const [data, setData] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const now = Date.now();
      if (positionsCache.data && (now - positionsCache.ts) < 3000) {
        setData(positionsCache.data);
        setError(null);
        return;
      }

      if (positionsCache.promise) {
        const cached = await positionsCache.promise;
        setData(cached);
        setError(null);
        return;
      }

      positionsCache.promise = requestManager.executeWithRateLimit<any>(
        '/api/bybit',
        {
          method: 'POST',
          body: JSON.stringify({
            endpoint: '/v5/position/list',
            method: 'GET',
          }),
        }
      );

      const response = await positionsCache.promise;
      positionsCache.promise = null;

      if (response.retCode === 0 && response.result?.list) {
        const filtered = response.result.list.filter(
          (pos: any) => pos.size !== '0' && pos.side !== 'None'
        );
        positionsCache.data = filtered;
        positionsCache.ts = Date.now();
        setData(filtered);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch positions';
      setError(message);
      logger.error('useBybitPositions', message, { error: err });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();

    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(fetchPositions, 3000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  return { data, loading, error, refetch: fetchPositions };
}

// ============== ACCOUNT INFO HOOK ==============
export interface AccountInfoData {
  uid: string;
  accountType: string;
  masterAccountUid?: string;
}

export function useBybitAccountInfo() {
  const [data, setData] = useState<AccountInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const response = await requestManager.executeWithRateLimit<any>(
          '/api/bybit',
          {
            method: 'POST',
            body: JSON.stringify({
              endpoint: '/v5/account/info',
              method: 'GET',
            }),
          }
        );

        if (response.retCode === 0 && response.result) {
          setData({
            uid: response.result.uid || 'N/A',
            accountType: response.result.accountType || 'Unified',
            masterAccountUid: response.result.masterAccountUid,
          });
          setError(null);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch account info';
        setError(message);
        logger.error('useBybitAccountInfo', message, { error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, []);

  return { data, loading, error };
}

// ============== CONNECTION STATUS HOOK ==============
export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'connecting';
  latency: number;
  lastChecked: Date;
}

export function useBybitConnection() {
  const [status, setStatus] = useState<ConnectionStatus>({
    status: 'connecting',
    latency: 0,
    lastChecked: new Date(),
  });

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const start = Date.now();
        const response = await requestManager.executeWithRateLimit<any>(
          '/api/bybit',
          {
            method: 'POST',
            body: JSON.stringify({
              endpoint: '/v5/market/time',
              method: 'GET',
            }),
          },
          { maxRetries: 1, timeout: 5000 }
        );

        const latency = Date.now() - start;

        if (response.retCode === 0) {
          setStatus({
            status: 'connected',
            latency,
            lastChecked: new Date(),
          });
        } else {
          throw new Error('API returned error');
        }
      } catch (err) {
        setStatus(prev => ({
          ...prev,
          status: 'disconnected',
          lastChecked: new Date(),
        }));
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  return status;
}

// ============== EXECUTE ORDER HOOK ==============
export interface ExecuteOrderParams {
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  leverage?: number;
  positionIdx?: number;
}

export function useExecuteOrder() {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (params: ExecuteOrderParams) => {
    try {
      setExecuting(true);
      setError(null);

      const response = await requestManager.executeWithRateLimit<any>(
        '/api/bybit/orders',
        {
          method: 'POST',
          body: JSON.stringify(params),
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Execution failed');
      }

      logger.info('useExecuteOrder', 'Order executed', { orderId: response.orderId });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute order';
      setError(message);
      logger.error('useExecuteOrder', message, { error: err });
      throw err;
    } finally {
      setExecuting(false);
    }
  };

  return { execute, executing, error };
}
