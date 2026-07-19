// app/settings/page.tsx - REAL Bybit API Data

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { realtimeManager } from '@/lib/realtimeManager';
import AppLayout from '@/components/AppLayout';
import {
  Settings,
  ExternalLink,
  Save,
  Key,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Network,
  Database,
  Activity,
  Server,
  Loader2,
} from 'lucide-react';
import {
  BYBIT_BASE_URL,
  createBybitAuthHeaders,
  getBybitCredentials,
  safeJsonParse,
} from '@/lib/bybit';
import { setSharedBalance } from '@/lib/tradingState';

// ============== TYPES ==============
interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  permissions: string[];
}

interface SymbolConfig {
  symbol: string;
  enabled: boolean;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  volume24h: string;
  change24h: string;
  volumeRaw: number;
}

interface WebSocketConfig {
  url: string;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  enableCompression: boolean;
  batchSize: number;
}

interface ConnectionHealth {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  latency: number;
  messagesReceived: number;
  messagesSent: number;
  connectionUptime: string;
  reconnectAttempts: number;
  lastMessage: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// ============== BYBIT API CONSTANTS ==============
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

// ============== UTILITY FUNCTIONS ==============
const getApiCredentials = () => getBybitCredentials();

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
};

// ============== API FUNCTIONS ==============

// Fetch wallet balance
const fetchWalletBalance = async (
  apiKey: string,
  apiSecret: string
): Promise<{ totalEquity: string; availableBalance: string; uid: string }> => {
  try {
    const recvWindow = '5000';
    const params = 'accountType=UNIFIED';
    const headers = await createBybitAuthHeaders(apiKey, apiSecret, params, recvWindow);

    const response = await fetch(`${BYBIT_BASE_URL}/v5/account/wallet-balance?${params}`, {
      method: 'GET',
      headers,
    });

    const data = await safeJsonParse(response);
    if (data?.retCode === 0 && data?.result) {
      const wallet = data.result.list?.[0] || data.result;
      const totalEquity = wallet?.totalEquity || wallet?.equity || wallet?.walletBalance || '0';
      const availableBalance =
        wallet?.availableBalance || wallet?.available || wallet?.walletBalance || '0';
      const uid =
        data.result.uid || data.result.accountUid || wallet?.uid || wallet?.accountUid || 'N/A';

      return {
        totalEquity: String(totalEquity),
        availableBalance: String(availableBalance),
        uid,
      };
    }
    return { totalEquity: '0', availableBalance: '0', uid: 'N/A' };
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    return { totalEquity: '0', availableBalance: '0', uid: 'N/A' };
  }
};

// Fetch account info
const fetchAccountInfo = async (
  apiKey: string,
  apiSecret: string
): Promise<{ accountType: string; uid: string }> => {
  try {
    const recvWindow = '5000';
    const params = '';
    const headers = await createBybitAuthHeaders(apiKey, apiSecret, params, recvWindow);

    const response = await fetch(`${BYBIT_BASE_URL}/v5/account/info`, {
      method: 'GET',
      headers,
    });

    const data = await safeJsonParse(response);

    if (data?.retCode === 0 && data?.result) {
      return {
        accountType: data.result.accountType || data.result.accType || 'Unified',
        uid: data.result.uid || data.result.accountUid || 'N/A',
      };
    }
    return { accountType: 'Unified', uid: 'N/A' };
  } catch (error) {
    console.error('Error fetching account info:', error);
    return { accountType: 'Unified', uid: 'N/A' };
  }
};

// ============== COMPONENTS ==============

// API Credentials Panel
const ApiCredentialsPanel = () => {
  const [credentials, setCredentials] = useState<ApiCredentials>({
    apiKey: '',
    apiSecret: '',
    isTestnet: false,
    permissions: ['read', 'trade'],
  });
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string>('');
  const [uid, setUid] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('Checking...');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAccountInfo, setIsLoadingAccountInfo] = useState(false);

  const testConnection = async () => {
    if (!credentials.apiKey || !credentials.apiSecret) {
      setTestStatus('error');
      setTestMessage('API Key and Secret are required');
      return;
    }

    setIsTesting(true);
    setTestStatus('idle');
    setTestMessage('');
    setError(null);
    setAccountType('Checking...');

    try {
      // Fetch wallet balance
      const balanceData = await fetchWalletBalance(credentials.apiKey, credentials.apiSecret);

      // Fetch account info
      const accountData = await fetchAccountInfo(credentials.apiKey, credentials.apiSecret);

      const balanceNum = parseFloat(balanceData.totalEquity);
      const balanceDisplay = balanceNum > 0 ? `${balanceNum.toFixed(2)} USDT` : '0.00 USDT';

      setBalance(balanceDisplay);
      setUid(accountData.uid);
      setAccountType(accountData.accountType);

      setTestStatus('success');
      setTestMessage('✅ Connection verified successfully!');
      setError(null);
    } catch (err: any) {
      console.error('Connection test error:', err);

      let userMessage = '❌ Failed to connect. Please check your credentials and network.';
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        userMessage = '❌ Network error. Please check your internet connection.';
      } else if (err.message?.includes('timeout')) {
        userMessage = '❌ Connection timeout. Please try again.';
      } else if (err.message?.includes('10005')) {
        userMessage = '❌ Invalid API key. Please check your API key.';
      } else if (err.message?.includes('10006')) {
        userMessage = '❌ Invalid API signature. Please check your API secret.';
      }

      setTestStatus('error');
      setTestMessage(userMessage);
      setError(err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!credentials.apiKey || !credentials.apiSecret) {
      setSaveStatus('error');
      setError('API Key and Secret are required');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');
    setError(null);

    try {
      localStorage.setItem(
        'bybit_credentials',
        JSON.stringify({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          isTestnet: credentials.isTestnet,
        })
      );

      window.dispatchEvent(
        new CustomEvent('bybit-credentials-saved', {
          detail: {
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            isTestnet: credentials.isTestnet,
          },
        })
      );

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
      setError('Failed to save credentials');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Load saved credentials from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bybit_credentials');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCredentials((prev) => ({
          ...prev,
          apiKey: parsed.apiKey || '',
          apiSecret: parsed.apiSecret || '',
          isTestnet: parsed.isTestnet || false,
        }));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Key size={16} className="text-blue-600 dark:text-blue-400" />
          API Credentials
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          Mainnet
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            API Key
          </label>
          <div className="relative">
            <input
              type="text"
              value={credentials.apiKey}
              onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value.trim() })}
              placeholder="Bybit Mainnet API Key"
              className="w-full px-3 py-2 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono"
            />
            {credentials.apiKey && (
              <button
                onClick={() => copyToClipboard(credentials.apiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            API Secret
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={credentials.apiSecret}
              onChange={(e) => setCredentials({ ...credentials, apiSecret: e.target.value.trim() })}
              placeholder="Enter your API secret"
              className="w-full px-3 py-2 pr-20 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {credentials.apiSecret && (
                <button
                  onClick={() => copyToClipboard(credentials.apiSecret)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">Permissions:</span>
            {credentials.permissions.map((p) => (
              <span
                key={p}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testConnection}
            disabled={isTesting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              saveStatus === 'success'
                ? 'bg-green-500 text-white'
                : saveStatus === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle size={14} />
            ) : saveStatus === 'error' ? (
              <XCircle size={14} />
            ) : (
              <Save size={14} />
            )}
            {saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save'}
          </button>
        </div>

        {testStatus !== 'idle' && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
              testStatus === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            {testStatus === 'success' ? (
              <CheckCircle
                size={16}
                className="text-green-600 dark:text-green-400 shrink-0 mt-0.5"
              />
            ) : (
              <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={
                  testStatus === 'success'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                }
              >
                {testMessage}
              </p>
              {testStatus === 'success' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {balance && (
                    <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Total Equity</p>
                      <p className="text-xs font-bold font-mono text-green-600 dark:text-green-400">
                        {balance}
                      </p>
                    </div>
                  )}
                  {accountType && accountType !== 'Checking...' && (
                    <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Account Type</p>
                      <p className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400">
                        {accountType}
                      </p>
                    </div>
                  )}
                  {uid && uid !== 'N/A' && (
                    <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5 col-span-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Account UID</p>
                      <p className="text-xs font-bold font-mono text-gray-900 dark:text-white">
                        {uid}
                      </p>
                    </div>
                  )}
                  {isLoadingAccountInfo && (
                    <div className="col-span-2 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                      <Loader2 size={12} className="animate-spin" />
                      Loading account details...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle size={12} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// Symbol Selector Panel
const SymbolSelectorPanel = () => {
  const [symbols, setSymbols] = useState<SymbolConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchSymbols = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear`);
      const data = await safeJsonParse(response);

      if (data?.retCode === 0 && data?.result?.list) {
        const tickers = data.result.list;
        const defaultEnabled = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

        const mappedSymbols: SymbolConfig[] = tickers
          .filter((t: any) => t.symbol.endsWith('USDT'))
          .map((t: any) => {
            const volume = parseFloat(t.volume24h) || 0;
            return {
              symbol: t.symbol,
              enabled: defaultEnabled.includes(t.symbol),
              baseAsset: t.symbol.replace('USDT', ''),
              quoteAsset: 'USDT',
              price: parseFloat(t.lastPrice).toFixed(2),
              volume24h: `$${(volume / 1e6).toFixed(1)}M`,
              change24h: `${(parseFloat(t.price24hPcnt) * 100).toFixed(2)}%`,
              volumeRaw: volume,
            };
          })
          .sort((a: SymbolConfig, b: SymbolConfig) => b.volumeRaw - a.volumeRaw);

        const topSymbols = showAll ? mappedSymbols : mappedSymbols.slice(0, 50);
        setSymbols(topSymbols);
      } else {
        throw new Error(data?.retMsg || 'Failed to fetch symbols');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load symbols');
    } finally {
      setIsLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  const toggleSymbol = (symbol: string) => {
    setSymbols((prev) =>
      prev.map((s) => (s.symbol === symbol ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const toggleAll = () => {
    const allEnabled = symbols.every((s) => s.enabled);
    setSymbols((prev) => prev.map((s) => ({ ...s, enabled: !allEnabled })));
  };

  const filteredSymbols = symbols.filter((s) =>
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const enabledCount = symbols.filter((s) => s.enabled).length;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading symbols...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Network size={16} className="text-green-600 dark:text-green-400" />
          Trading Symbols
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {enabledCount} / {symbols.length} enabled
          </span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] font-medium px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {showAll ? 'Show Top 50' : 'Show All'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
          <button onClick={fetchSymbols} className="ml-auto text-blue-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${symbols.length} symbols...`}
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
        </div>
        <button
          onClick={toggleAll}
          className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {symbols.every((s) => s.enabled) ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
        {filteredSymbols.length > 0 ? (
          filteredSymbols.map((symbol) => (
            <button
              key={symbol.symbol}
              onClick={() => toggleSymbol(symbol.symbol)}
              className={`flex flex-col items-start p-2 rounded-lg border transition-all ${
                symbol.enabled
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs font-medium ${
                    symbol.enabled
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {symbol.symbol}
                </span>
                {symbol.enabled ? (
                  <CheckCircle size={12} className="text-blue-600 dark:text-blue-400" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-gray-500 dark:text-gray-400">${symbol.price}</span>
                <span
                  className={`text-[9px] ${
                    parseFloat(symbol.change24h) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {symbol.change24h}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  {symbol.volume24h}
                </span>
              </div>
            </button>
          ))
        ) : (
          <div className="col-span-4 text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            No symbols found matching "{searchTerm}"
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
        <span>
          Showing {filteredSymbols.length} of {symbols.length} symbols
          {!showAll && symbols.length > 50 && (
            <button
              onClick={() => setShowAll(true)}
              className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show all {symbols.length}
            </button>
          )}
        </span>
        <span>Quote: USDT</span>
      </div>
    </div>
  );
};

// WebSocket Config Panel
const WebSocketConfigPanel = () => {
  const [config, setConfig] = useState<WebSocketConfig>({
    url: BYBIT_WS_URL,
    reconnectDelay: 5000,
    maxReconnectAttempts: 10,
    heartbeatInterval: 30000,
    enableCompression: true,
    batchSize: 10,
  });
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeRef = useRef<() => void | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`].slice(-20));
  };

  const connect = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setMessageCount(0);
    let localCount = 0;
    unsubscribeRef.current = realtimeManager.subscribeTicks((data: any) => {
      localCount++;
      setMessageCount((prev) => prev + 1);
      setStatus('connected');
      addLog('📩 Received tick data');
    });

    setTimeout(() => {
      if (localCount === 0) {
        setStatus('error');
        addLog('⚠️ No messages received during test window');
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      }
    }, 3000);
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setStatus('idle');
    setReconnectAttempts(0);
    addLog('🔌 Disconnected');
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Server size={16} className="text-purple-600 dark:text-purple-400" />
          WebSocket Configuration
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
              status === 'connected'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : status === 'connecting'
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                  : status === 'error'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            {status === 'connected' && <CheckCircle size={10} />}
            {status === 'connecting' && <Loader2 size={10} className="animate-spin" />}
            {status === 'error' && <XCircle size={10} />}
            {status === 'idle' && <WifiOff size={10} />}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          {status === 'connected' && (
            <span className="text-[10px] text-gray-500">Messages: {messageCount}</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            WebSocket URL
          </label>
          <input
            type="text"
            value={config.url}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Reconnect Delay (ms)
            </label>
            <input
              type="number"
              value={config.reconnectDelay}
              onChange={(e) => setConfig({ ...config, reconnectDelay: parseInt(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Max Reconnect Attempts
            </label>
            <input
              type="number"
              value={config.maxReconnectAttempts}
              onChange={(e) =>
                setConfig({ ...config, maxReconnectAttempts: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={config.enableCompression}
              onChange={(e) => setConfig({ ...config, enableCompression: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            Enable Compression
          </label>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mr-2">Batch Size</label>
            <select
              value={config.batchSize}
              onChange={(e) => setConfig({ ...config, batchSize: parseInt(e.target.value) })}
              className="px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {[5, 10, 20, 50].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={connect}
            disabled={status === 'connecting'}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              status === 'connected'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {status === 'connecting' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : status === 'connected' ? (
              <WifiOff size={14} />
            ) : (
              <Wifi size={14} />
            )}
            {status === 'connected'
              ? 'Disconnect'
              : status === 'connecting'
                ? 'Connecting...'
                : 'Connect'}
          </button>
        </div>

        {logs.length > 0 && (
          <div className="p-2 bg-gray-900 dark:bg-gray-950 rounded-lg max-h-32 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="text-[10px] font-mono text-green-400">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Connection Health Panel
const ConnectionHealthPanel = () => {
  const [health, setHealth] = useState<ConnectionHealth>({
    status: 'connected',
    latency: 0,
    messagesReceived: 0,
    messagesSent: 0,
    connectionUptime: '0h 0m 0s',
    reconnectAttempts: 0,
    lastMessage: '-',
    quality: 'excellent',
  });
  const [startTime] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setError(null);
      const start = Date.now();
      const response = await fetch(`${BYBIT_BASE_URL}/v5/market/time`);
      const data = await safeJsonParse(response);
      const latency = Date.now() - start;

      if (data?.retCode === 0) {
        const uptime = (Date.now() - startTime) / 1000;
        const quality: ConnectionHealth['quality'] =
          latency < 100 ? 'excellent' : latency < 200 ? 'good' : latency < 400 ? 'fair' : 'poor';

        setHealth((prev) => ({
          ...prev,
          status: 'connected',
          latency,
          quality,
          connectionUptime: formatTime(uptime),
          lastMessage: new Date().toLocaleString(),
          messagesReceived: prev.messagesReceived + 1,
        }));
      } else {
        setHealth((prev) => ({ ...prev, status: 'error' }));
        setError('Failed to get server time');
      }
    } catch (error) {
      setHealth((prev) => ({ ...prev, status: 'error', latency: 999 }));
      setError('Connection failed');
    } finally {
      setIsLoading(false);
    }
  }, [startTime]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'connecting':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return 'text-green-600 dark:text-green-400';
      case 'good':
        return 'text-blue-600 dark:text-blue-400';
      case 'fair':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'poor':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            Checking connection...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity size={16} className="text-green-600 dark:text-green-400" />
          Connection Health
        </h3>
        <button
          onClick={checkHealth}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
            <div
              className={`text-sm font-semibold flex items-center gap-1 ${getStatusColor(health.status)}`}
            >
              {health.status === 'connected' && <CheckCircle size={14} />}
              {health.status === 'error' && <XCircle size={14} />}
              {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Latency</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {health.latency}ms
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Messages Received</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {health.messagesReceived.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Quality</div>
            <div className={`text-sm font-semibold ${getQualityColor(health.quality)}`}>
              {health.quality.charAt(0).toUpperCase() + health.quality.slice(1)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Uptime: {health.connectionUptime}</span>
          <span>Reconnects: {health.reconnectAttempts}</span>
          <span>Last: {health.lastMessage}</span>
        </div>

        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${
              health.quality === 'excellent'
                ? 'bg-green-500'
                : health.quality === 'good'
                  ? 'bg-blue-500'
                  : health.quality === 'fair'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
            }`}
            style={{
              width:
                health.quality === 'excellent'
                  ? '95%'
                  : health.quality === 'good'
                    ? '75%'
                    : health.quality === 'fair'
                      ? '50%'
                      : '25%',
            }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
          <span>0ms</span>
          <span>100ms</span>
          <span>200ms</span>
          <span>300ms+</span>
        </div>
      </div>
    </div>
  );
};

// ============== MAIN PAGE ==============
export default function SettingsPage() {
  const bybitLink = 'https://www.bybit.com/app/user/api-management';

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <Settings size={20} className="text-gray-900 dark:text-white" />
            </div>
            <div>
              <h1 className="text-gray-900 dark:text-white font-bold text-xl tracking-tight">
                Settings
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                Configure Bybit API credentials, target symbols, WebSocket feeds, and monitor
                connection health
              </p>
            </div>
          </div>
          <a
            href={bybitLink}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ExternalLink size={12} />
            Bybit API Management
          </a>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ApiCredentialsPanel />
          <ConnectionHealthPanel />
          <SymbolSelectorPanel />
          <WebSocketConfigPanel />
        </div>

        {/* Footer note */}
        <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <p className="text-center text-[11px] text-yellow-700 dark:text-yellow-400 flex items-center justify-center gap-2">
            <Shield size={12} />
            API credentials are stored in browser session only. For production use, store keys
            server-side via environment variables.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
