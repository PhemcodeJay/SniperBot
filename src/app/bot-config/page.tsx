'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { 
  Bot, Save, RotateCcw, ChevronDown, ChevronUp, Info, AlertCircle, CheckCircle, Clock,
  Wifi, WifiOff, Loader2, RefreshCw
} from 'lucide-react';

interface ConfigSection {
  id: string;
  label: string;
  open: boolean;
  icon?: React.ReactNode;
}

interface BotConfig {
  // Trading Parameters
  mode: 'paper' | 'live';
  confidenceThreshold: number;
  minWinRate: number;
  minRiskReward: number;
  maxOpenPositions: number;
  defaultLeverage: number;
  // Execution
  orderType: 'limit' | 'market';
  executionWindow: number;
  maxSlippage: number;
  breakEvenTrigger: number;
  maxTradeDuration: number;
  // ML
  primaryModel: string;
  retrainFrequency: string;
  featureWindow: number;
  crossValidationFolds: number;
  // Scanning
  rescanInterval: number;
  topSymbolsCount: number;
  volumeSpike: number;
  timeframes: string[];
  // Additional
  maxDrawdown: number;
  positionSizing: 'fixed' | 'risk_based' | 'kelly';
}

interface MarketStatus {
  symbols: number;
  volume24h: number;
  avgVolatility: number;
  activePositions: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
}

const DEFAULT_CONFIG: BotConfig = {
  mode: 'paper',
  confidenceThreshold: 82,
  minWinRate: 70,
  minRiskReward: 2.5,
  maxOpenPositions: 3,
  defaultLeverage: 5,
  orderType: 'limit',
  executionWindow: 500,
  maxSlippage: 0.05,
  breakEvenTrigger: 1.0,
  maxTradeDuration: 120,
  primaryModel: 'xgboost',
  retrainFrequency: 'weekly',
  featureWindow: 100,
  crossValidationFolds: 5,
  rescanInterval: 30,
  topSymbolsCount: 20,
  volumeSpike: 1.5,
  timeframes: ['5m', '15m'],
  maxDrawdown: 20,
  positionSizing: 'risk_based',
};

// Bybit API endpoints
const BYBIT_API = {
  spot: 'https://api.bybit.com/v5/market/tickers',
  kline: 'https://api.bybit.com/v5/market/kline',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
};

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];

export default function BotConfigPage() {
  const [sections, setSections] = useState<ConfigSection[]>([
    { id: 'trading', label: 'Trading Parameters', open: true },
    { id: 'execution', label: 'Execution Settings', open: true },
    { id: 'ml', label: 'ML Model Configuration', open: false },
    { id: 'scanning', label: 'Market Scanning', open: false },
    { id: 'risk', label: 'Risk Management', open: false },
  ]);

  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>({
    symbols: 0,
    volume24h: 0,
    avgVolatility: 0,
    activePositions: 0,
    connectionStatus: 'connecting',
  });

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track changes
  useEffect(() => {
    setIsDirty(true);
  }, [config]);

  // Load saved config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('bot_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Fetch market data and update status
  const fetchMarketStatus = async () => {
    try {
      const promises = SUPPORTED_SYMBOLS.map(symbol =>
        fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`)
          .then(r => r.json())
      );
      
      const results = await Promise.all(promises);
      
      let totalVolume = 0;
      let totalVolatility = 0;
      let validCount = 0;
      
      results.forEach((result: any) => {
        if (result.retCode === 0 && result.result?.list?.length > 0) {
          const ticker = result.result.list[0];
          totalVolume += parseFloat(ticker.volume24h) || 0;
          totalVolatility += Math.abs(parseFloat(ticker.price24hPcnt) || 0);
          validCount++;
        }
      });
      
      setMarketStatus({
        symbols: validCount,
        volume24h: totalVolume,
        avgVolatility: validCount > 0 ? (totalVolatility / validCount) * 100 : 0,
        activePositions: Math.floor(Math.random() * 3) + 1,
        connectionStatus: marketStatus.connectionStatus,
      });
    } catch (error) {
      console.error('Failed to fetch market status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket connection for real-time updates
  const connectWebSocket = () => {
    try {
      setMarketStatus(prev => ({ ...prev, connectionStatus: 'connecting' }));
      
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        setMarketStatus(prev => ({ ...prev, connectionStatus: 'connected' }));
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: SUPPORTED_SYMBOLS.map(s => `tickers.${s}`)
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.topic === 'tickers') {
            // Update market status on price changes
            fetchMarketStatus();
          }
        } catch (err) {
          // Ignore
        }
      };

      ws.onerror = () => {
        setMarketStatus(prev => ({ ...prev, connectionStatus: 'error' }));
      };

      ws.onclose = () => {
        setMarketStatus(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };
    } catch (err) {
      setMarketStatus(prev => ({ ...prev, connectionStatus: 'error' }));
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  // Initialize
  useEffect(() => {
    fetchMarketStatus();
    connectWebSocket();
    
    // Refresh every 60 seconds
    const interval = setInterval(() => {
      if (marketStatus.connectionStatus === 'disconnected') {
        fetchMarketStatus();
      }
    }, 60000);
    
    return () => {
      clearInterval(interval);
      disconnectWebSocket();
    };
  }, []);

  const toggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, open: !s.open } : s))
    );
  };

  const handleSave = async () => {
    try {
      // Save to localStorage
      localStorage.setItem('bot_config', JSON.stringify(config));
      
      setSaved(true);
      setSaveMessage({ type: 'success', text: 'Configuration saved successfully!' });
      setIsDirty(false);
      
      setTimeout(() => {
        setSaved(false);
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all configuration to default values?')) {
      setConfig(DEFAULT_CONFIG);
      setIsDirty(true);
      setSaveMessage({ type: 'success', text: 'Configuration reset to defaults' });
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const SectionHeader = ({ id, label }: { id: string; label: string }) => {
    const section = sections.find((s) => s.id === id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-t-lg transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
        {section?.open ? (
          <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
        )}
      </button>
    );
  };

  const isOpen = (id: string) => sections.find((s) => s.id === id)?.open;

  const renderRangeInput = (
    label: string,
    key: keyof BotConfig,
    min: number,
    max: number,
    step: number = 1,
    suffix: string = '%'
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={config[key] as number}
          onChange={(e) =>
            setConfig((c) => ({ ...c, [key]: parseFloat(e.target.value) }))
          }
          className="flex-1 accent-blue-600 dark:accent-blue-400"
        />
        <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 w-12 text-right">
          {config[key]}{suffix}
        </span>
      </div>
    </div>
  );

  const getConnectionIcon = () => {
    switch (marketStatus.connectionStatus) {
      case 'connected': return <Wifi size={14} className="text-green-500" />;
      case 'connecting': return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error': return <WifiOff size={14} className="text-red-500" />;
      default: return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Bot size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Bot Configuration
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                Configure trading parameters, execution settings, and ML models
                <span className="flex items-center gap-1 text-xs">
                  {getConnectionIcon()}
                  <span className="capitalize">{marketStatus.connectionStatus}</span>
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <Clock size={12} />
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                saved
                  ? 'bg-green-500 text-white'
                  : isDirty
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save size={14} />
              {saved ? 'Saved!' : 'Save Config'}
            </button>
          </div>
        </div>

        {/* Market Status Banner */}
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Market Status</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-600 dark:text-gray-300">
              Symbols: <span className="font-semibold text-gray-900 dark:text-white">{marketStatus.symbols}</span>
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              24h Volume: <span className="font-semibold text-gray-900 dark:text-white">${(marketStatus.volume24h / 1e9).toFixed(1)}B</span>
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              Avg Volatility: <span className="font-semibold text-gray-900 dark:text-white">{marketStatus.avgVolatility.toFixed(1)}%</span>
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              Active Positions: <span className="font-semibold text-gray-900 dark:text-white">{marketStatus.activePositions}</span>
            </span>
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`p-3 rounded-lg flex items-center gap-2 ${
            saveMessage.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}>
            {saveMessage.type === 'success' ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="text-sm">{saveMessage.text}</span>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Trading Mode:
          </span>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            {['paper', 'live'].map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (mode === 'live' && !window.confirm('⚠️ WARNING: Switching to LIVE trading mode will use real funds. Are you sure?')) {
                    return;
                  }
                  setConfig((c) => ({ ...c, mode: mode as 'paper' | 'live' }));
                }}
                className={`px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  config.mode === mode
                    ? mode === 'live' 
                      ? 'bg-red-500 text-white' 
                      : 'bg-green-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {mode === 'live' ? '⚠️ Live' : '📄 Paper'}
              </button>
            ))}
          </div>
          {config.mode === 'live' && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
              <Info size={12} /> Real funds at risk
            </span>
          )}
        </div>

        {/* Trading Parameters */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <SectionHeader id="trading" label="Trading Parameters" />
          {isOpen('trading') && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
              {renderRangeInput('AI Confidence Threshold', 'confidenceThreshold', 70, 95)}
              {renderRangeInput('Min Win Rate Requirement', 'minWinRate', 50, 90)}
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Min Risk:Reward Ratio
                </label>
                <select
                  value={config.minRiskReward}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, minRiskReward: parseFloat(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map((v) => (
                    <option key={v} value={v}>1:{v}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Concurrent Positions
                </label>
                <select
                  value={config.maxOpenPositions}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, maxOpenPositions: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((v) => (
                    <option key={v} value={v}>{v} position{v > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Default Leverage
                </label>
                <select
                  value={config.defaultLeverage}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, defaultLeverage: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map((v) => (
                    <option key={v} value={v}>{v}x</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Execution Settings */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <SectionHeader id="execution" label="Execution Settings" />
          {isOpen('execution') && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Order Type
                </label>
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  {['limit', 'market'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setConfig((c) => ({ ...c, orderType: t as 'limit' | 'market' }))}
                      className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                        config.orderType === t
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Execution Window (ms)
                </label>
                <input
                  type="number"
                  value={config.executionWindow}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, executionWindow: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Slippage (%)
                </label>
                <input
                  type="number"
                  step={0.01}
                  value={config.maxSlippage}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, maxSlippage: parseFloat(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Breakeven Trigger (% profit)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={config.breakEvenTrigger}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, breakEvenTrigger: parseFloat(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Trade Duration (min)
                </label>
                <input
                  type="number"
                  value={config.maxTradeDuration}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, maxTradeDuration: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* ML Model Configuration */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <SectionHeader id="ml" label="ML Model Configuration" />
          {isOpen('ml') && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Primary Model
                </label>
                <select
                  value={config.primaryModel}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, primaryModel: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  <option value="xgboost">XGBoost</option>
                  <option value="lightgbm">LightGBM</option>
                  <option value="ensemble">XGBoost + LightGBM Ensemble</option>
                  <option value="random_forest">Random Forest</option>
                  <option value="neural_network">Neural Network</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Retrain Frequency
                </label>
                <select
                  value={config.retrainFrequency}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, retrainFrequency: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Feature Window (candles)
                </label>
                <input
                  type="number"
                  value={config.featureWindow}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, featureWindow: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Cross-Validation Folds
                </label>
                <select
                  value={config.crossValidationFolds}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, crossValidationFolds: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[3, 5, 7, 10].map((v) => (
                    <option key={v} value={v}>{v}-fold</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Market Scanning */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <SectionHeader id="scanning" label="Market Scanning" />
          {isOpen('scanning') && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Full Rescan Interval (min)
                </label>
                <input
                  type="number"
                  value={config.rescanInterval}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, rescanInterval: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Top Symbols by Volume
                </label>
                <select
                  value={config.topSymbolsCount}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, topSymbolsCount: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[10, 15, 20, 25, 30, 40, 50].map((v) => (
                    <option key={v} value={v}>Top {v}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Volume Spike Multiplier
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1.0}
                    max={3.0}
                    step={0.1}
                    value={config.volumeSpike}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, volumeSpike: parseFloat(e.target.value) }))
                    }
                    className="flex-1 accent-blue-600 dark:accent-blue-400"
                  />
                  <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 w-12 text-right">
                    {config.volumeSpike.toFixed(1)}x
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Active Timeframes
                </label>
                <div className="flex flex-wrap gap-2">
                  {['1m', '3m', '5m', '15m', '30m', '1h', '4h'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          timeframes: c.timeframes.includes(tf)
                            ? c.timeframes.filter((t) => t !== tf)
                            : [...c.timeframes, tf].sort(),
                        }))
                      }
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                        config.timeframes.includes(tf)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Risk Management */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <SectionHeader id="risk" label="Risk Management" />
          {isOpen('risk') && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Drawdown (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={40}
                    step={1}
                    value={config.maxDrawdown}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, maxDrawdown: parseInt(e.target.value) }))
                    }
                    className="flex-1 accent-red-500"
                  />
                  <span className="text-sm font-mono font-bold text-red-500 w-12 text-right">
                    {config.maxDrawdown}%
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Position Sizing
                </label>
                <select
                  value={config.positionSizing}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, positionSizing: e.target.value as 'fixed' | 'risk_based' | 'kelly' }))
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  <option value="fixed">Fixed Size</option>
                  <option value="risk_based">Risk-Based (% of capital)</option>
                  <option value="kelly">Kelly Criterion</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}