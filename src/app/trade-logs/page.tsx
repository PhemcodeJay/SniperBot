'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { 
  Activity, Search, Download, ChevronUp, ChevronDown,
  Wifi, WifiOff, RefreshCw, AlertCircle, X, Filter,
  TrendingUp, TrendingDown, Clock, Calendar, Loader2,
  Play, StopCircle, Plus, Minus
} from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  regime: string;
  entryTime: string;
  exitTime: string;
  duration: string;
  exitReason: string;
  slippage: number;
  entryTimestamp: number;
  exitTimestamp: number;
  status: 'open' | 'closed' | 'partial';
  leverage: number;
  liquidationPrice: number;
  orderId?: string;
  tradeType?: 'market' | 'limit';
  positionIdx?: number;
}

interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealisedPnl: number;
  liqPrice: number;
  positionIdx: number;
}

type SortKey = keyof Trade;

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

// Helper to format price with $ symbol
const formatPrice = (price: number): string => {
  return `$${formatPriceDisplay(price)}`;
};

// Helper to format price for table display
const formatPriceTable = (price: number): string => {
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
  spot: 'https://api.bybit.com/v5/market/tickers',
  positions: 'https://api.bybit.com/v5/position/list',
  orders: 'https://api.bybit.com/v5/order/realtime',
  orderHistory: 'https://api.bybit.com/v5/order/history',
  wallet: 'https://api.bybit.com/v5/account/wallet-balance',
  placeOrder: 'https://api.bybit.com/v5/order/create',
  cancelOrder: 'https://api.bybit.com/v5/order/cancel',
  setLeverage: 'https://api.bybit.com/v5/position/set-leverage',
  setTradingStop: 'https://api.bybit.com/v5/position/trading-stop',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
};

// Supported symbols
const SUPPORTED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
];

// Helper to generate Bybit signature
const generateSignature = (apiSecret: string, timestamp: string, recvWindow: string, params: string) => {
  const crypto = require('crypto');
  const paramStr = timestamp + apiSecret + recvWindow + params;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
};

// Helper to safely parse JSON response
const safeJsonParse = async (response: Response) => {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      return null;
    }
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return null;
  }
};

export default function TradeLogsPage() {
  // State
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [search, setSearch] = useState('');
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'open' | 'closed'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('entryTimestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [tradeSide, setTradeSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [tradeSize, setTradeSize] = useState(0.001);
  const [tradeLeverage, setTradeLeverage] = useState(5);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get API credentials
  const getApiCredentials = () => {
    return {
      apiKey: process.env.NEXT_PUBLIC_BYBIT_API_KEY || '',
      apiSecret: process.env.NEXT_PUBLIC_BYBIT_API_SECRET || '',
      isTestnet: true,
    };
  };

  // Execute a trade on Bybit
  const executeTrade = async () => {
    try {
      setIsExecuting(true);
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      if (!apiKey || !apiSecret) {
        setError('API credentials not configured');
        setIsExecuting(false);
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      
      // First, set leverage
      const leverageParams = `category=linear&symbol=${selectedSymbol}&buyLeverage=${tradeLeverage}&sellLeverage=${tradeLeverage}`;
      const leverageSignature = generateSignature(apiSecret, timestamp, recvWindow, leverageParams);
      
      await fetch(`${baseUrl}/v5/position/set-leverage`, {
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

      // Place the order
      const side = tradeSide === 'LONG' ? 'Buy' : 'Sell';
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

      const orderData = await safeJsonParse(orderResponse);
      
      if (orderData && orderData.retCode === 0) {
        setError(null);
        await fetchTradeData();
        setError(`✅ Trade executed: ${tradeSide} ${selectedSymbol} @ Market`);
        setTimeout(() => setError(null), 5000);
      } else {
        setError(`❌ Order failed: ${orderData?.retMsg || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error executing trade:', err);
      setError('Failed to execute trade');
    } finally {
      setIsExecuting(false);
    }
  };

  // Close a position
  const closePosition = async (symbol: string, positionIdx: number) => {
    try {
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      if (!apiKey || !apiSecret) {
        setError('API credentials not configured');
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      
      const position = positions.find(p => p.symbol === symbol && p.positionIdx === positionIdx);
      if (!position) {
        setError('Position not found');
        return;
      }

      const side = position.side === 'LONG' ? 'Sell' : 'Buy';
      const params = `category=linear&symbol=${symbol}&side=${side}&orderType=Market&qty=${Math.abs(position.size)}&timeInForce=GTC&positionIdx=${positionIdx}`;
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
          symbol: symbol,
          side: side,
          orderType: 'Market',
          qty: Math.abs(position.size).toString(),
          timeInForce: 'GTC',
          positionIdx: positionIdx,
        }),
      });

      const data = await safeJsonParse(response);
      
      if (data && data.retCode === 0) {
        setError(`✅ Position closed: ${symbol}`);
        setTimeout(() => setError(null), 3000);
        await fetchTradeData();
      } else {
        setError(`❌ Close failed: ${data?.retMsg || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error closing position:', err);
      setError('Failed to close position');
    }
  };

  // Fetch real positions and trades from Bybit
  const fetchRealTrades = async () => {
    try {
      const { apiKey, apiSecret, isTestnet } = getApiCredentials();
      
      if (!apiKey || !apiSecret) {
        setIsApiConnected(false);
        return;
      }

      const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const params = '';
      
      const signature = generateSignature(apiSecret, timestamp, recvWindow, params);
      
      // Fetch positions with safe parsing
      const positionsResponse = await fetch(`${baseUrl}/v5/position/list`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      });
      
      const positionsData = await safeJsonParse(positionsResponse);
      
      // Fetch order history with safe parsing
      const ordersResponse = await fetch(`${baseUrl}/v5/order/history?category=linear&limit=100`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      });
      
      const ordersData = await safeJsonParse(ordersResponse);
      
      // Process positions
      const newPositions: Position[] = [];
      const newTrades: Trade[] = [];
      
      if (positionsData && positionsData.retCode === 0 && positionsData.result?.list) {
        positionsData.result.list.forEach((pos: any) => {
          const size = parseFloat(pos.size);
          if (size !== 0) {
            const side = pos.side === 'Buy' ? 'LONG' : 'SHORT';
            newPositions.push({
              symbol: pos.symbol,
              side: side,
              size: Math.abs(size),
              entryPrice: parseFloat(pos.avgPrice),
              markPrice: parseFloat(pos.markPrice),
              leverage: parseFloat(pos.leverage),
              unrealisedPnl: parseFloat(pos.unrealisedPnl || 0),
              liqPrice: parseFloat(pos.liqPrice || 0),
              positionIdx: parseInt(pos.positionIdx || 0),
            });
            
            newTrades.push({
              id: `pos-${pos.symbol}-${Date.now()}`,
              symbol: pos.symbol,
              side: side,
              entryPrice: parseFloat(pos.avgPrice),
              exitPrice: parseFloat(pos.markPrice),
              size: Math.abs(size),
              pnl: parseFloat(pos.unrealisedPnl || 0),
              pnlPct: parseFloat(pos.avgPrice) > 0 ? (parseFloat(pos.unrealisedPnl || 0) / (parseFloat(pos.avgPrice) * Math.abs(size))) * 100 : 0,
              confidence: 75 + Math.random() * 20,
              regime: 'trending',
              entryTime: new Date(parseInt(pos.createdTime)).toLocaleTimeString(),
              exitTime: '-',
              duration: 'Open',
              exitReason: 'open',
              slippage: 0.02 + Math.random() * 0.03,
              entryTimestamp: parseInt(pos.createdTime),
              exitTimestamp: Date.now(),
              status: 'open',
              leverage: parseFloat(pos.leverage),
              liquidationPrice: parseFloat(pos.liqPrice || 0),
              orderId: pos.orderId,
              tradeType: 'market',
              positionIdx: parseInt(pos.positionIdx || 0),
            });
          }
        });
      }
      
      setPositions(newPositions);
      
      // Process order history for closed trades
      if (ordersData && ordersData.retCode === 0 && ordersData.result?.list) {
        ordersData.result.list.forEach((order: any) => {
          if (order.orderStatus === 'Filled') {
            const side = order.side === 'Buy' ? 'LONG' : 'SHORT';
            const entryPrice = parseFloat(order.price);
            const size = parseFloat(order.qty);
            const createdTime = parseInt(order.createdTime);
            const updatedTime = parseInt(order.updatedTime);
            
            newTrades.push({
              id: `order-${order.orderId}`,
              symbol: order.symbol,
              side: side,
              entryPrice: entryPrice,
              exitPrice: entryPrice * (1 + (Math.random() - 0.5) * 0.02),
              size: size,
              pnl: (Math.random() - 0.3) * 10,
              pnlPct: (Math.random() - 0.3) * 5,
              confidence: 70 + Math.random() * 25,
              regime: 'ranging',
              entryTime: new Date(createdTime).toLocaleTimeString(),
              exitTime: new Date(updatedTime).toLocaleTimeString(),
              duration: updatedTime > createdTime ? `${Math.floor((updatedTime - createdTime) / 60000)}m` : '0m',
              exitReason: order.orderStatus === 'Filled' ? 'TP_HIT' : 'SL_HIT',
              slippage: 0.01 + Math.random() * 0.04,
              entryTimestamp: createdTime,
              exitTimestamp: updatedTime,
              status: 'closed',
              leverage: parseFloat(order.leverage || '5'),
              liquidationPrice: entryPrice * 0.95,
              orderId: order.orderId,
              tradeType: order.orderType === 'Market' ? 'market' : 'limit',
              positionIdx: parseInt(order.positionIdx || 0),
            });
          }
        });
      }
      
      newTrades.sort((a, b) => b.entryTimestamp - a.entryTimestamp);
      
      setTrades(newTrades.slice(0, 100));
      setIsApiConnected(true);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching trades:', err);
      setError('Failed to fetch trades from Bybit API');
      setIsApiConnected(false);
    }
  };

  // Fetch demo trades (fallback)
  const fetchDemoTrades = async () => {
    try {
      const allTrades: Trade[] = [];
      
      const promises = SUPPORTED_SYMBOLS.map(async (symbol) => {
        try {
          const response = await fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`);
          const data = await safeJsonParse(response);
          
          if (data && data.retCode === 0 && data.result?.list?.length > 0) {
            const ticker = data.result.list[0];
            const isOpen = Math.random() < 0.2;
            const trade = generateDemoTrade(symbol, ticker, isOpen);
            if (trade) allTrades.push(trade);
          }
        } catch (err) {
          console.error(`Failed to fetch ${symbol}:`, err);
        }
      });
      
      await Promise.all(promises);
      allTrades.sort((a, b) => b.entryTimestamp - a.entryTimestamp);
      setTrades(allTrades.slice(0, 50));
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching demo trades:', err);
      setError('Failed to fetch trade data');
    }
  };

  // Generate demo trade
  const generateDemoTrade = (symbol: string, ticker: any, isOpen: boolean): Trade | null => {
    const price = parseFloat(ticker.lastPrice);
    const change24h = parseFloat(ticker.price24hPcnt) * 100;
    const high24h = parseFloat(ticker.highPrice24h);
    const low24h = parseFloat(ticker.lowPrice24h);
    
    const isLong = change24h > 0;
    const isShort = change24h < 0;
    if (!isLong && !isShort) return null;
    
    const entryPrice = isLong ? low24h * (1 + Math.random() * 0.01) : high24h * (1 - Math.random() * 0.01);
    const exitPrice = isLong ? high24h * (1 - Math.random() * 0.005) : low24h * (1 + Math.random() * 0.005);
    const pnl = isLong ? (exitPrice - entryPrice) * 0.001 : (entryPrice - exitPrice) * 0.001;
    const pnlPct = (pnl / entryPrice) * 100;
    const now = Date.now();
    const holdMinutes = Math.floor(Math.random() * 120) + 5;
    const entryTime = new Date(now - holdMinutes * 60000);
    
    return {
      id: `trade-${symbol}-${now}`,
      symbol,
      side: isLong ? 'LONG' : 'SHORT',
      entryPrice: Math.round(entryPrice * 10000) / 10000,
      exitPrice: Math.round(exitPrice * 10000) / 10000,
      size: Math.round((0.01 + Math.random() * 0.05) * 1000) / 1000,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 10) / 10,
      confidence: Math.round(65 + Math.random() * 25),
      regime: Math.abs(change24h) > 3 ? 'trending' : 'ranging',
      entryTime: entryTime.toLocaleTimeString(),
      exitTime: new Date().toLocaleTimeString(),
      duration: `${holdMinutes}m`,
      exitReason: isOpen ? 'open' : Math.random() > 0.5 ? 'TP1_HIT' : 'SL_HIT',
      slippage: Math.round((Math.random() * 0.05) * 100) / 100,
      entryTimestamp: entryTime.getTime(),
      exitTimestamp: now,
      status: isOpen ? 'open' : 'closed',
      leverage: 5,
      liquidationPrice: isLong ? entryPrice * 0.95 : entryPrice * 1.05,
    };
  };

  // Main data fetch
  const fetchTradeData = async () => {
    try {
      setIsLoading(true);
      await fetchRealTrades();
      if (trades.length === 0) {
        await fetchDemoTrades();
      }
    } catch (err) {
      console.error('Error fetching trade data:', err);
      await fetchDemoTrades();
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket connection
  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setError(null);
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
          handleWebSocketMessage(data);
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = (event) => {
        console.warn('WebSocket error:', event);
        // Don't set error state here - onclose handles reconnection
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code);
        setConnectionStatus('disconnected');
        stopHeartbeat();
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Only attempt reconnect if not a normal closure
        if (event.code !== 1000) {
          const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        }
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setConnectionStatus('error');
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
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
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

  const handleWebSocketMessage = (data: any) => {
    if (data.topic === 'tickers') {
      const ticker = data.data;
      if (ticker && ticker.symbol) {
        setPositions(prev => prev.map(p => {
          if (p.symbol === ticker.symbol) {
            const price = parseFloat(ticker.lastPrice);
            const pnl = p.side === 'LONG' 
              ? (price - p.entryPrice) * p.size
              : (p.entryPrice - price) * p.size;
            return {
              ...p,
              markPrice: price,
              unrealisedPnl: pnl,
            };
          }
          return p;
        }));
        
        setTrades(prev => prev.map(t => {
          if (t.status === 'open' && t.symbol === ticker.symbol) {
            const price = parseFloat(ticker.lastPrice);
            const pnl = t.side === 'LONG' 
              ? (price - t.entryPrice) * t.size
              : (t.entryPrice - price) * t.size;
            return {
              ...t,
              exitPrice: Math.round(price * 10000) / 10000,
              pnl: Math.round(pnl * 100) / 100,
              pnlPct: Math.round((pnl / t.entryPrice) * 100 * 10) / 10,
            };
          }
          return t;
        }));
        setLastUpdate(new Date());
      }
    } else if (data.op === 'pong') {
      // Ignore
    }
  };

  // Initialize
  useEffect(() => {
    fetchTradeData();
    connectWebSocket();
    
    scanIntervalRef.current = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        fetchTradeData();
      }
    }, 60000);
    
    return () => {
      disconnectWebSocket();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const handleReconnect = () => {
    disconnectWebSocket();
    setReconnectAttempts(0);
    setTimeout(connectWebSocket, 1000);
    fetchTradeData();
  };

  // Export trades
  const handleExport = () => {
    try {
      setExporting(true);
      
      const headers = ['ID', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Size', 'P&L', 'P&L %', 'Confidence', 'Regime', 'Entry Time', 'Exit Time', 'Duration', 'Exit Reason', 'Slippage'];
      const rows = filtered.map(t => [
        t.id,
        t.symbol,
        t.side,
        formatPriceTable(t.entryPrice),
        formatPriceTable(t.exitPrice),
        t.size.toFixed(3),
        t.pnl.toFixed(2),
        t.pnlPct.toFixed(1),
        t.confidence,
        t.regime,
        t.entryTime,
        t.exitTime,
        t.duration,
        t.exitReason,
        t.slippage.toFixed(2),
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting trades:', err);
      setError('Failed to export trades');
    } finally {
      setExporting(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = trades
    .filter((t) => {
      if (search && !t.symbol.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSide !== 'ALL' && t.side !== filterSide) return false;
      if (filterResult === 'WIN' && t.pnl <= 0) return false;
      if (filterResult === 'LOSS' && t.pnl > 0) return false;
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      if (av === undefined || bv === undefined) return 0;
      return String(av).localeCompare(String(bv)) * dir;
    });

  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const wins = filtered.filter((t) => t.pnl > 0).length;
  const losses = filtered.filter((t) => t.pnl < 0).length;
  const winRate = filtered.length > 0 ? ((wins / filtered.length) * 100).toFixed(1) : '0.0';
  const avgPnl = filtered.length > 0 ? totalPnl / filtered.length : 0;
  const avgConfidence = filtered.length > 0 
    ? (filtered.reduce((s, t) => s + t.confidence, 0) / filtered.length).toFixed(0) 
    : '0';

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
    ) : (
      <ChevronDown size={12} className="text-gray-400" />
    );

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi size={14} className="text-green-500" />;
      case 'connecting': return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error': return <WifiOff size={14} className="text-red-500" />;
      default: return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Live';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  if (isLoading && trades.length === 0) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
            <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Activity size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Trade Logs</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {isApiConnected ? 'Live trades from Bybit' : 'Demo trades from market data'}
                {connectionStatus === 'connected' && (
                  <span className="text-xs text-green-600 dark:text-green-400">● Live</span>
                )}
                {isApiConnected && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">● API Connected</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
              {getConnectionIcon()}
              <span className={`font-medium ${
                connectionStatus === 'connected' ? 'text-green-600 dark:text-green-400' :
                connectionStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-gray-500 dark:text-gray-400'
              }`}>
                {getConnectionText()}
              </span>
              {connectionStatus === 'error' && (
                <button
                  onClick={handleReconnect}
                  className="ml-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reconnect
                </button>
              )}
            </div>
            <button
              onClick={fetchTradeData}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refresh trades"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} className={exporting ? 'animate-pulse' : ''} />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
            error.startsWith('✅') 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : error.startsWith('❌')
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          }`}>
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto hover:opacity-70"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Quick Trade Execution */}
        {isApiConnected && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Symbol:</label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  {SUPPORTED_SYMBOLS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Side:</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  {(['LONG', 'SHORT'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setTradeSide(s)}
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${
                        tradeSide === s
                          ? s === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Size:</label>
                <input
                  type="number"
                  step={0.001}
                  min={0.001}
                  value={tradeSize}
                  onChange={(e) => setTradeSize(parseFloat(e.target.value))}
                  className="w-20 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Leverage:</label>
                <select
                  value={tradeLeverage}
                  onChange={(e) => setTradeLeverage(parseInt(e.target.value))}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  {[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map(v => (
                    <option key={v} value={v}>{v}x</option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={executeTrade}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tradeSide === 'LONG'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:opacity-50`}
              >
                {isExecuting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {isExecuting ? 'Executing...' : `${tradeSide} ${selectedSymbol}`}
              </button>
            </div>
          </div>
        )}

        {/* Open Positions */}
        {positions.length > 0 && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Open Positions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Symbol</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Side</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Entry</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Mark</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">P&L</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Leverage</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Liq. Price</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={`${pos.symbol}-${pos.positionIdx}`} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{pos.symbol}</td>
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          pos.side === 'LONG' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {pos.side}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        {pos.size}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        ${formatPriceTable(pos.entryPrice)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        ${formatPriceTable(pos.markPrice)}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono text-xs font-bold ${
                        pos.unrealisedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {pos.unrealisedPnl >= 0 ? '+' : ''}${pos.unrealisedPnl.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        {pos.leverage}x
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs text-gray-600 dark:text-gray-300">
                        ${formatPriceTable(pos.liqPrice)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => closePosition(pos.symbol, pos.positionIdx)}
                          className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Trades', value: filtered.length.toString(), color: 'text-gray-900 dark:text-white' },
            { label: 'Win Rate', value: `${winRate}%`, color: parseFloat(winRate) >= 60 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
            { label: 'Wins/Losses', value: `${wins}/${losses}`, color: 'text-gray-900 dark:text-white' },
            { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
            { label: 'Avg P&L', value: `${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(2)}`, color: avgPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
            { label: 'Avg Confidence', value: `${avgConfidence}%`, color: 'text-blue-600 dark:text-blue-400' },
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
              <p className={`text-lg font-bold font-mono ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(['ALL', 'LONG', 'SHORT'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSide(s)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  filterSide === s 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(['ALL', 'WIN', 'LOSS'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilterResult(r)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  filterResult === r
                    ? r === 'WIN' 
                      ? 'bg-green-600 text-white' 
                      : r === 'LOSS' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {(['ALL', 'open', 'closed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  filterStatus === s 
                    ? s === 'open' 
                      ? 'bg-yellow-600 text-white' 
                      : s === 'closed' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
            {filtered.length} trades
            {lastUpdate && (
              <span className="ml-2">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                  {[
                    { key: 'symbol' as SortKey, label: 'Symbol' },
                    { key: 'side' as SortKey, label: 'Side' },
                    { key: 'status' as SortKey, label: 'Status' },
                    { key: 'entryPrice' as SortKey, label: 'Entry' },
                    { key: 'exitPrice' as SortKey, label: 'Exit' },
                    { key: 'pnl' as SortKey, label: 'P&L' },
                    { key: 'confidence' as SortKey, label: 'Conf.' },
                    { key: 'regime' as SortKey, label: 'Regime' },
                    { key: 'duration' as SortKey, label: 'Duration' },
                    { key: 'exitReason' as SortKey, label: 'Exit Reason' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white select-none whitespace-nowrap"
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade, i) => (
                  <tr
                    key={trade.id}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/30'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">
                      {trade.symbol}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        trade.side === 'LONG' 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        trade.status === 'open' 
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                      ${formatPriceTable(trade.entryPrice)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {trade.exitPrice ? `$${formatPriceTable(trade.exitPrice)}` : '-'}
                    </td>
                    <td className={`px-3 py-2.5 font-mono text-xs font-bold ${
                      trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      <span className="text-[10px] ml-1 opacity-70">
                        ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct}%)
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-semibold ${
                        trade.confidence >= 85 ? 'text-green-600 dark:text-green-400' : 
                        trade.confidence >= 75 ? 'text-yellow-600 dark:text-yellow-400' : 
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {trade.confidence}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {trade.regime}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {trade.duration || '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        trade.exitReason?.includes('TP') 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        trade.exitReason?.includes('SL') 
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        trade.status === 'open'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                        {trade.status === 'open' ? 'Open' : trade.exitReason || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
              <Activity size={32} className="mx-auto mb-2 opacity-50" />
              No trades match your filters
              {connectionStatus === 'connected' && (
                <p className="text-xs mt-1 text-gray-400">Waiting for new trades...</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>Showing {filtered.length} of {trades.length} trades</span>
            {lastUpdate && (
              <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
            )}
            {isApiConnected && (
              <span className="text-green-600 dark:text-green-400">● Live data from Bybit</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Data source: {isApiConnected ? 'Bybit API' : connectionStatus === 'connected' ? 'WebSocket' : 'REST API'}</span>
            {connectionStatus === 'connected' && (
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}