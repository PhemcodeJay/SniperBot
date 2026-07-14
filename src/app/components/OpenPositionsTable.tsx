'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Loader2, RefreshCw, Plus, Minus } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';

interface Position {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  atr: number;
  confidence: number;
  regime: 'trending' | 'ranging' | 'volatile';
  openedAt: string;
  holdMins: number;
  positionIdx?: number;
  orderId?: string;
  orderLinkId?: string;
}

type SortKey = 'symbol' | 'unrealizedPnl' | 'confidence' | 'holdMins';

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

// Bybit API endpoints
const BYBIT_API = {
  positions: 'https://api.bybit.com/v5/position/list',
  orderHistory: 'https://api.bybit.com/v5/order/history',
  placeOrder: 'https://api.bybit.com/v5/order/create',
  cancelOrder: 'https://api.bybit.com/v5/order/cancel',
  setLeverage: 'https://api.bybit.com/v5/position/set-leverage',
  setTradingStop: 'https://api.bybit.com/v5/position/trading-stop',
  wallet: 'https://api.bybit.com/v5/account/wallet-balance',
  spot: 'https://api.bybit.com/v5/market/tickers',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
  private: 'wss://stream.bybit.com/v5/private/linear',
};

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

// Helper to generate Bybit signature
const generateSignature = (apiSecret: string, timestamp: string, recvWindow: string, params: string) => {
  const crypto = require('crypto');
  const paramStr = timestamp + apiSecret + recvWindow + params;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
};

export default function OpenPositionsTable() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('unrealizedPnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [portfolioHeat, setPortfolioHeat] = useState(0);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // New position form state
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [tradeSide, setTradeSide] = useState<'long' | 'short'>('long');
  const [tradeSize, setTradeSize] = useState(0.001);
  const [tradeLeverage, setTradeLeverage] = useState(5);

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get API credentials
  const getApiCredentials = () => {
    return {
      apiKey: process.env.NEXT_PUBLIC_BYBIT_API_KEY || '',
      apiSecret: process.env.NEXT_PUBLIC_BYBIT_API_SECRET || '',
      isTestnet: true,
    };
  };

  // Open a new position on Bybit
  const openPositionOnBybit = async () => {
    try {
      setIsExecuting(true);
      setError(null);
      
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      if (!apiKey || !apiSecret) {
        toast.error('API credentials not configured. Please set your Bybit API keys.');
        setIsExecuting(false);
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      
      // Step 1: Set leverage
      const leverageParams = `category=linear&symbol=${selectedSymbol}&buyLeverage=${tradeLeverage}&sellLeverage=${tradeLeverage}`;
      const leverageSignature = generateSignature(apiSecret, timestamp, recvWindow, leverageParams);
      
      const leverageResponse = await fetch(`${baseUrl}/v5/position/set-leverage`, {
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
          symbol: selectedSymbol,
          buyLeverage: tradeLeverage.toString(),
          sellLeverage: tradeLeverage.toString(),
        }),
      });
      
      const leverageData = await leverageResponse.json();
      if (leverageData.retCode !== 0) {
        toast.error(`Failed to set leverage: ${leverageData.retMsg}`);
        setIsExecuting(false);
        return;
      }
      
      // Step 2: Place the order
      const side = tradeSide === 'long' ? 'Buy' : 'Sell';
      const orderParams = `category=linear&symbol=${selectedSymbol}&side=${side}&orderType=Market&qty=${tradeSize}&timeInForce=GTC`;
      const orderSignature = generateSignature(apiSecret, timestamp, recvWindow, orderParams);
      
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
          symbol: selectedSymbol,
          side: side,
          orderType: 'Market',
          qty: tradeSize.toString(),
          timeInForce: 'GTC',
        }),
      });

      const orderData = await orderResponse.json();
      
      if (orderData.retCode === 0) {
        toast.success(`✅ Position opened: ${tradeSide.toUpperCase()} ${selectedSymbol}`, {
          description: `Size: ${tradeSize} @ ${tradeLeverage}x leverage`,
        });
        // Refresh positions to show the new position
        await fetchPositions();
        setError(null);
      } else {
        toast.error(`❌ Order failed: ${orderData.retMsg}`);
        setError(`Failed to open position: ${orderData.retMsg}`);
      }
    } catch (err) {
      console.error('Error opening position:', err);
      toast.error('Failed to open position');
      setError('Failed to open position. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Fetch real positions from Bybit
  const fetchPositions = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      // Always fetch market data for real-time prices
      const tickerPromises = SUPPORTED_SYMBOLS.map(symbol =>
        fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`)
          .then(r => r.json())
          .catch(() => null)
      );
      const tickerResults = await Promise.all(tickerPromises);
      
      // Create price map
      const priceMap: Record<string, number> = {};
      tickerResults.forEach((result: any) => {
        if (result && result.retCode === 0 && result.result?.list?.length > 0) {
          const ticker = result.result.list[0];
          priceMap[ticker.symbol] = parseFloat(ticker.lastPrice);
        }
      });
      
      if (!apiKey || !apiSecret) {
        // No API keys - use demo data with real prices
        await fetchDemoPositions(priceMap);
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const params = '';
      
      const signature = generateSignature(apiSecret, timestamp, recvWindow, params);
      
      // Fetch positions
      const positionsResponse = await fetch(`${baseUrl}/v5/position/list`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      });
      
      const positionsData = await positionsResponse.json();
      
      if (positionsData.retCode === 0 && positionsData.result?.list) {
        const positionData: Position[] = [];
        let totalExposure = 0;
        
        positionsData.result.list.forEach((pos: any) => {
          const size = parseFloat(pos.size);
          if (size !== 0) {
            const side = pos.side === 'Buy' ? 'long' : 'short';
            const entryPrice = parseFloat(pos.avgPrice);
            const currentPrice = priceMap[pos.symbol] || parseFloat(pos.markPrice);
            const pnl = parseFloat(pos.unrealisedPnl || 0);
            const pnlPct = entryPrice > 0 ? (pnl / (entryPrice * Math.abs(size))) * 100 : 0;
            
            totalExposure += Math.abs(pnl) / 1000;
            
            positionData.push({
              id: `pos-${pos.symbol}-${pos.positionIdx}`,
              symbol: pos.symbol,
              direction: side,
              entryPrice: entryPrice,
              currentPrice: currentPrice,
              size: Math.abs(size),
              leverage: parseFloat(pos.leverage || 5),
              unrealizedPnl: pnl,
              unrealizedPct: pnlPct,
              stopLoss: parseFloat(pos.stopLoss || 0),
              takeProfit1: parseFloat(pos.takeProfit || 0),
              takeProfit2: parseFloat(pos.takeProfit || 0) * 1.1,
              atr: currentPrice * 0.01,
              confidence: Math.min(95, 75 + Math.random() * 20),
              regime: Math.random() > 0.5 ? 'trending' : 'ranging',
              openedAt: new Date(parseInt(pos.createdTime)).toLocaleTimeString(),
              holdMins: Math.floor((Date.now() - parseInt(pos.createdTime)) / 60000),
              positionIdx: parseInt(pos.positionIdx || 0),
              orderId: pos.orderId,
            });
          }
        });
        
        setPositions(positionData);
        setPortfolioHeat(Math.min(10, totalExposure / 1000));
        setIsApiConnected(true);
      } else {
        setError('Failed to fetch positions from Bybit');
        await fetchDemoPositions(priceMap);
      }
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError('Failed to fetch positions. Using demo data.');
      await fetchDemoPositions({});
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch demo positions (fallback)
  const fetchDemoPositions = async (priceMap: Record<string, number>) => {
    try {
      const symbols = SUPPORTED_SYMBOLS;
      const positionData: Position[] = [];
      
      for (const symbol of symbols) {
        const price = priceMap[symbol] || 50000 + Math.random() * 20000;
        const change = (Math.random() - 0.5) * 2;
        
        const isLong = Math.random() > 0.3;
        const entryPrice = isLong ? price * (1 - Math.random() * 0.01) : price * (1 + Math.random() * 0.01);
        const pnl = (price - entryPrice) / entryPrice * 100 * (isLong ? 1 : -1);
        
        positionData.push({
          id: `pos-${symbol.toLowerCase()}-${Date.now()}`,
          symbol,
          direction: isLong ? 'long' : 'short',
          entryPrice,
          currentPrice: price,
          size: parseFloat((0.01 + Math.random() * 0.05).toFixed(3)),
          leverage: 5,
          unrealizedPnl: pnl * 100,
          unrealizedPct: pnl,
          stopLoss: isLong ? price * 0.985 : price * 1.015,
          takeProfit1: isLong ? price * 1.025 : price * 0.975,
          takeProfit2: isLong ? price * 1.05 : price * 0.95,
          atr: price * 0.01,
          confidence: 75 + Math.random() * 20,
          regime: Math.random() > 0.5 ? 'trending' : 'ranging',
          openedAt: new Date(Date.now() - Math.random() * 7200000).toLocaleTimeString(),
          holdMins: Math.floor(Math.random() * 120) + 10,
        });
      }
      
      setPositions(positionData);
      setPortfolioHeat(3 + Math.random() * 3);
      setIsApiConnected(false);
    } catch (err) {
      console.error('Error fetching demo positions:', err);
      setError('Failed to load positions');
    }
  };

  // Close position on Bybit
  const closePositionOnBybit = async (position: Position) => {
    try {
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      if (!apiKey || !apiSecret) {
        toast.error('API credentials not configured');
        return false;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      
      const side = position.direction === 'long' ? 'Sell' : 'Buy';
      const params = `category=linear&symbol=${position.symbol}&side=${side}&orderType=Market&qty=${position.size}&timeInForce=GTC&positionIdx=${position.positionIdx || 0}`;
      const signature = generateSignature(apiSecret, timestamp, recvWindow, params);
      
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
          side: side,
          orderType: 'Market',
          qty: position.size.toString(),
          timeInForce: 'GTC',
          positionIdx: position.positionIdx || 0,
        }),
      });

      const data = await response.json();
      
      if (data.retCode === 0) {
        toast.success(`Position closed — ${position.symbol}`, {
          description: `Market order submitted successfully.`,
        });
        await fetchPositions();
        return true;
      } else {
        toast.error(`Failed to close position: ${data.retMsg}`);
        return false;
      }
    } catch (err) {
      console.error('Error closing position:', err);
      toast.error('Failed to close position');
      return false;
    }
  };

  // WebSocket connection for real-time updates
  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setReconnectAttempts(0);
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: SUPPORTED_SYMBOLS.map(s => `tickers.${s}`)
        }));
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.topic === 'tickers') {
            const ticker = data.data;
            if (ticker && ticker.symbol) {
              setPositions(prev => prev.map(pos => {
                if (pos.symbol === ticker.symbol) {
                  const price = parseFloat(ticker.lastPrice);
                  const pnl = pos.direction === 'long' 
                    ? (price - pos.entryPrice) * pos.size
                    : (pos.entryPrice - price) * pos.size;
                  const pnlPct = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0;
                  
                  return {
                    ...pos,
                    currentPrice: price,
                    unrealizedPnl: pnl,
                    unrealizedPct: pnlPct,
                    holdMins: Math.floor((Date.now() - new Date(pos.openedAt).getTime()) / 60000),
                  };
                }
                return pos;
              }));
            }
          } else if (data.op === 'pong') {
            // Heartbeat response - ignore
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        console.warn('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code);
        stopHeartbeat();
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
      console.error('Failed to connect WebSocket:', err);
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'Normal closure');
      wsRef.current = null;
    }
    stopHeartbeat();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ op: 'ping' }));
      }
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchPositions();
    connectWebSocket();
    
    const interval = setInterval(() => {
      fetchPositions();
    }, 30000);
    
    return () => {
      clearInterval(interval);
      disconnectWebSocket();
    };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleCloseConfirm = async () => {
    if (!closeTarget) return;
    
    const success = await closePositionOnBybit(closeTarget);
    if (success) {
      setPositions(prev => prev.filter(p => p.id !== closeTarget.id));
    }
    setCloseTarget(null);
  };

  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="inline-flex flex-col ml-1 opacity-50">
      <ChevronUp
        size={9}
        className={sortKey === col && sortDir === 'asc' ? 'opacity-100 text-primary' : ''}
      />
      <ChevronDown
        size={9}
        className={sortKey === col && sortDir === 'desc' ? 'opacity-100 text-primary' : ''}
        style={{ marginTop: '-3px' }}
      />
    </span>
  );

  if (isLoading) {
    return (
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading positions...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card-surface overflow-hidden">
        {/* Quick Trade Form */}
        {isApiConnected && (
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Open Position:</span>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="px-2 py-1 text-xs bg-background border border-border rounded-lg"
                >
                  {SUPPORTED_SYMBOLS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                {(['long', 'short'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTradeSide(s)}
                    className={`px-3 py-1 text-xs font-semibold transition-colors ${
                      tradeSide === s
                        ? s === 'long' ? 'bg-positive text-white' : 'bg-negative text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {s.toUpperCase()}
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
                  className="w-20 px-2 py-1 text-xs bg-background border border-border rounded-lg"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Leverage:</span>
                <select
                  value={tradeLeverage}
                  onChange={(e) => setTradeLeverage(parseInt(e.target.value))}
                  className="px-2 py-1 text-xs bg-background border border-border rounded-lg"
                >
                  {[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map(v => (
                    <option key={v} value={v}>{v}x</option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={openPositionOnBybit}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  tradeSide === 'long'
                    ? 'bg-positive hover:bg-positive/90 text-white'
                    : 'bg-negative hover:bg-negative/90 text-white'
                } disabled:opacity-50`}
              >
                {isExecuting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  tradeSide === 'long' ? <Plus size={12} /> : <Minus size={12} />
                )}
                {isExecuting ? 'Opening...' : `${tradeSide.toUpperCase()} ${selectedSymbol}`}
              </button>
              
              {!isApiConnected && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  ⚠️ Demo mode - positions won't appear on Bybit
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Open Positions
            </h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-positive-subtle text-positive border border-positive/20">
              {positions.length} active
            </span>
            {isApiConnected && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                ● Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Portfolio Heat:</span>
              <span className="text-warning font-semibold font-tabular">{portfolioHeat.toFixed(1)}%</span>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-warning transition-all duration-500"
                  style={{ width: `${Math.min(100, (portfolioHeat / 10) * 100)}%` }}
                />
              </div>
            </div>
            <button
              onClick={fetchPositions}
              disabled={isRefreshing}
              className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh positions"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-2 rounded-md bg-negative-subtle text-negative text-xs border border-negative/20">
            {error}
          </div>
        )}

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm font-semibold text-foreground">No open positions</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isApiConnected ? 'Use the form above to open a position on Bybit' : 'Waiting for new signals to execute'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm" aria-label="Open positions table">
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: 'Symbol', key: 'symbol' as SortKey, sortable: true },
                    { label: 'Dir.', key: null, sortable: false },
                    { label: 'Entry', key: null, sortable: false },
                    { label: 'Current', key: null, sortable: false },
                    { label: 'Size', key: null, sortable: false },
                    { label: 'Unreal. P&L', key: 'unrealizedPnl' as SortKey, sortable: true },
                    { label: 'SL / TP1 / TP2', key: null, sortable: false },
                    { label: 'Confidence', key: 'confidence' as SortKey, sortable: true },
                    { label: 'Regime', key: null, sortable: false },
                    { label: 'Hold', key: 'holdMins' as SortKey, sortable: true },
                    { label: '', key: null, sortable: false },
                  ].map((col, i) => (
                    <th
                      key={`th-pos-${i}`}
                      className={`
                        px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground
                        ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}
                      `}
                      onClick={col.sortable && col.key ? () => handleSort(col.key!) : undefined}
                    >
                      {col.label}
                      {col.sortable && col.key && <SortIcon col={col.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((pos) => (
                  <tr
                    key={pos.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center">
                          <span className="text-[9px] font-bold text-foreground">
                            {pos.symbol.replace('USDT', '').slice(0, 3)}
                          </span>
                        </div>
                        <span className="font-semibold text-foreground text-xs font-mono">
                          {pos.symbol}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={pos.direction} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      ${formatPriceDisplay(pos.entryPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-tabular">
                      <span
                        className={
                          pos.currentPrice > pos.entryPrice
                            ? 'text-positive' : 'text-negative'
                        }
                      >
                        ${formatPriceDisplay(pos.currentPrice)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      {pos.size} · {pos.leverage}x
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {pos.unrealizedPnl >= 0 ? (
                          <TrendingUp size={12} className="text-positive" />
                        ) : (
                          <TrendingDown size={12} className="text-negative" />
                        )}
                        <div>
                          <p
                            className={`font-semibold font-tabular text-xs ${
                              pos.unrealizedPnl >= 0 ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {pos.unrealizedPnl >= 0 ? '+' : ''}$
                            {Math.abs(pos.unrealizedPnl).toFixed(2)}
                          </p>
                          <p
                            className={`text-[10px] font-tabular ${
                              pos.unrealizedPct >= 0 ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {pos.unrealizedPct >= 0 ? '+' : ''}
                            {pos.unrealizedPct.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[10px] font-mono font-tabular space-y-0.5">
                        <div className="flex gap-1 items-center">
                          <span className="text-negative w-6">SL</span>
                          <span className="text-muted-foreground">
                            ${formatPriceDisplay(pos.stopLoss)}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T1</span>
                          <span className="text-muted-foreground">
                            ${formatPriceDisplay(pos.takeProfit1)}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T2</span>
                          <span className="text-muted-foreground">
                            ${formatPriceDisplay(pos.takeProfit2)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pos.confidence >= 85
                                ? 'bg-positive'
                                : pos.confidence >= 75
                                ? 'bg-info' : 'bg-warning'
                            }`}
                            style={{ width: `${pos.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold font-tabular text-foreground w-8">
                          {Math.round(pos.confidence)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={pos.regime} size="sm" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground font-tabular">
                      {pos.holdMins}m
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setCloseTarget(pos)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md hover:bg-negative-subtle text-muted-foreground hover:text-negative active:scale-95"
                        title={`Close ${pos.symbol} position — market order`}
                        aria-label={`Close ${pos.symbol} position`}
                      >
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!closeTarget}
        title={`Close ${closeTarget?.symbol} Position`}
        description={`This will submit a market order to close your ${closeTarget?.direction?.toUpperCase()} position in ${closeTarget?.symbol} on Bybit. Current unrealized P&L: ${closeTarget?.unrealizedPnl && closeTarget.unrealizedPnl >= 0 ? '+' : ''}$${Math.abs(closeTarget?.unrealizedPnl ?? 0).toFixed(2)}. This action cannot be undone.`}
        confirmLabel="Close Position"
        variant="danger"
        onConfirm={handleCloseConfirm}
        onCancel={() => setCloseTarget(null)}
      />
    </>
  );
}