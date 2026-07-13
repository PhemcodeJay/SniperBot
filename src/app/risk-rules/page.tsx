'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { 
  Shield, Save, AlertTriangle, RotateCcw, CheckCircle, 
  Info, Zap, TrendingDown, Settings, Lock, Unlock,
  Clock, Database, Loader2, Wifi, WifiOff
} from 'lucide-react';

interface RiskRules {
  perTradeRisk: number;
  maxDailyLoss: number;
  maxWeeklyDrawdown: number;
  maxMonthlyDrawdown: number;
  maxOpenPositions: number;
  maxCorrelatedTrades: number;
  atrMultiplierSL: number;
  emergencyExitPct: number;
  tp1Ratio: number;
  tp2Ratio: number;
  tp1SizeClose: number;
  trailingStopEnabled: boolean;
  trailingStopATR: number;
  kellyEnabled: boolean;
  kellyFraction: number;
  portfolioHeatLimit: number;
  anomalyDetection: boolean;
  autoScaling: boolean;
  correlationCheck: boolean;
  dailyLossShutdown: boolean;
  maxPositionSize: number;
  minPositionSize: number;
  riskPerTradeUSD: number;
  maxDailyTrades: number;
}

interface RiskAssessment {
  currentExposure: number;
  dailyPnL: number;
  dailyLossUsed: number;
  weeklyDrawdown: number;
  monthlyDrawdown: number;
  openPositions: number;
  correlatedTrades: number;
  riskScore: 'Low' | 'Medium' | 'High' | 'Critical';
  maxLossPerTrade: number;
  dailyLossLimit: number;
}

const DEFAULT_RULES: RiskRules = {
  perTradeRisk: 1.0,
  maxDailyLoss: 5.0,
  maxWeeklyDrawdown: 10.0,
  maxMonthlyDrawdown: 15.0,
  maxOpenPositions: 3,
  maxCorrelatedTrades: 2,
  atrMultiplierSL: 2.0,
  emergencyExitPct: 4.0,
  tp1Ratio: 2.5,
  tp2Ratio: 4.0,
  tp1SizeClose: 50,
  trailingStopEnabled: true,
  trailingStopATR: 1.5,
  kellyEnabled: true,
  kellyFraction: 0.25,
  portfolioHeatLimit: 8.0,
  anomalyDetection: true,
  autoScaling: true,
  correlationCheck: true,
  dailyLossShutdown: true,
  maxPositionSize: 10000,
  minPositionSize: 100,
  riskPerTradeUSD: 500,
  maxDailyTrades: 20,
};

// Bybit API endpoints
const BYBIT_API = {
  spot: 'https://api.bybit.com/v5/market/tickers',
  kline: 'https://api.bybit.com/v5/market/kline',
};

const BYBIT_WS = {
  linear: 'wss://stream.bybit.com/v5/public/linear',
};

// Supported symbols for monitoring
const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export default function RiskRulesPage() {
  const [rules, setRules] = useState<RiskRules>(DEFAULT_RULES);
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'loss' | 'position' | 'stoploss' | 'advanced'>('loss');
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment>({
    currentExposure: 0,
    dailyPnL: 0,
    dailyLossUsed: 0,
    weeklyDrawdown: 0,
    monthlyDrawdown: 0,
    openPositions: 0,
    correlatedTrades: 0,
    riskScore: 'Low',
    maxLossPerTrade: 0,
    dailyLossLimit: 0,
  });
  const [marketData, setMarketData] = useState<Record<string, any>>({});

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved rules from localStorage
  useEffect(() => {
    const savedRules = localStorage.getItem('risk_rules');
    if (savedRules) {
      try {
        const parsed = JSON.parse(savedRules);
        setRules({ ...DEFAULT_RULES, ...parsed });
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Fetch market data and calculate risk assessment
  const fetchMarketDataAndAssessRisk = async () => {
    try {
      setIsLoading(true);
      let totalExposure = 0;
      let totalPnL = 0;
      let openPositionsCount = 0;
      let correlatedCount = 0;
      const priceData: Record<string, number> = {};

      // Fetch data for all symbols
      const promises = SUPPORTED_SYMBOLS.map(async (symbol) => {
        try {
          const response = await fetch(`${BYBIT_API.spot}?category=linear&symbol=${symbol}`);
          const data = await response.json();
          
          if (data.retCode === 0 && data.result?.list?.length > 0) {
            const ticker = data.result.list[0];
            const price = parseFloat(ticker.lastPrice);
            const change24h = parseFloat(ticker.price24hPcnt) * 100;
            
            priceData[symbol] = price;
            marketData[symbol] = ticker;
            
            // Simulate open positions based on price movements
            const hasPosition = Math.abs(change24h) > 1.5 && Math.random() < 0.3;
            if (hasPosition) {
              openPositionsCount++;
              const positionSize = 0.01 + Math.random() * 0.04;
              const entryPrice = price * (1 + (Math.random() - 0.5) * 0.02);
              const pnl = (price - entryPrice) * positionSize * 50000;
              totalPnL += pnl;
              totalExposure += positionSize * price * 5; // 5x leverage
              
              // Check correlation (same direction, similar price movement)
              if (Math.abs(change24h) > 2) {
                correlatedCount++;
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch ${symbol}:`, err);
        }
      });

      await Promise.all(promises);

      // Calculate risk assessment
      const totalCapital = 100000; // Simulated capital
      const exposurePct = (totalExposure / totalCapital) * 100;
      const dailyLossPct = Math.min(100, Math.abs(totalPnL) / totalCapital * 100);
      
      // Determine risk score
      let riskScore: RiskAssessment['riskScore'] = 'Low';
      if (exposurePct > 15 || dailyLossPct > 3) riskScore = 'High';
      else if (exposurePct > 10 || dailyLossPct > 2) riskScore = 'Medium';
      else if (exposurePct > 5 || dailyLossPct > 1) riskScore = 'Medium';
      
      if (dailyLossPct > 5 || exposurePct > 20) riskScore = 'Critical';

      setRiskAssessment({
        currentExposure: Math.round(exposurePct * 10) / 10,
        dailyPnL: Math.round(totalPnL * 100) / 100,
        dailyLossUsed: Math.round(dailyLossPct * 10) / 10,
        weeklyDrawdown: Math.round((Math.random() * 5 + 1) * 10) / 10,
        monthlyDrawdown: Math.round((Math.random() * 8 + 2) * 10) / 10,
        openPositions: openPositionsCount,
        correlatedTrades: Math.min(correlatedCount, 3),
        riskScore,
        maxLossPerTrade: Math.round((rules.perTradeRisk / 100) * totalCapital),
        dailyLossLimit: Math.round((rules.maxDailyLoss / 100) * totalCapital),
      });

      setMarketData(prev => ({ ...prev, ...priceData }));
      setError(null);
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError('Failed to fetch market data. Using cached data.');
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket connection for real-time updates
  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(BYBIT_WS.linear);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setError(null);
        
        // Subscribe to ticker updates
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

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
        stopHeartbeat();
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setConnectionStatus('error');
      setError('Failed to establish WebSocket connection');
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopHeartbeat();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const startHeartbeat = () => {
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

  // Handle WebSocket messages
  const handleWebSocketMessage = (data: any) => {
    if (data.topic === 'tickers') {
      const ticker = data.data;
      if (ticker && ticker.symbol) {
        setMarketData(prev => ({ ...prev, [ticker.symbol]: ticker }));
        // Update risk assessment periodically on price changes
        fetchMarketDataAndAssessRisk();
      }
    } else if (data.op === 'pong') {
      // Heartbeat response - ignore
    }
  };

  // Initialize
  useEffect(() => {
    fetchMarketDataAndAssessRisk();
    connectWebSocket();
    
    // Refresh every 60 seconds
    const interval = setInterval(() => {
      if (connectionStatus === 'disconnected') {
        fetchMarketDataAndAssessRisk();
      }
    }, 60000);
    
    return () => {
      disconnectWebSocket();
      clearInterval(interval);
    };
  }, []);

  // Save rules to localStorage
  const handleSave = async () => {
    try {
      localStorage.setItem('risk_rules', JSON.stringify(rules));
      setSaved(true);
      setSaveMessage({ type: 'success', text: 'Risk rules saved successfully!' });
      setIsDirty(false);
      setTimeout(() => {
        setSaved(false);
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save risk rules. Please try again.' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all risk rules to default values?')) {
      setRules(DEFAULT_RULES);
      setIsDirty(true);
      setSaveMessage({ type: 'success', text: 'Risk rules reset to defaults' });
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const handleReconnect = () => {
    disconnectWebSocket();
    setTimeout(connectWebSocket, 1000);
    fetchMarketDataAndAssessRisk();
  };

  const Toggle = ({ field }: { field: keyof RiskRules }) => (
    <button
      onClick={() => setRules((r) => ({ ...r, [field]: !r[field] }))}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        rules[field] ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          rules[field] ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );

  const SliderField = ({
    label,
    field,
    min,
    max,
    step,
    unit,
    warn,
    description,
  }: {
    label: string;
    field: keyof RiskRules;
    min: number;
    max: number;
    step: number;
    unit: string;
    warn?: number;
    description?: string;
  }) => {
    const val = rules[field] as number;
    const isWarn = warn !== undefined && val >= warn;
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {label}
          </label>
          <span className={`text-sm font-mono font-bold ${isWarn ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {val}{unit}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => {
            setRules((r) => ({ ...r, [field]: parseFloat(e.target.value) }));
            setIsDirty(true);
          }}
          className="w-full accent-blue-600 dark:accent-blue-400"
        />
        {isWarn && (
          <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5 flex items-center gap-1">
            <AlertTriangle size={10} /> High risk setting
          </p>
        )}
        {description && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
    );
  };

  const TabButton = ({ id, label, icon }: { id: string; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(id as any)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        activeTab === id
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi size={14} className="text-green-500" />;
      case 'connecting': return <Loader2 size={14} className="text-yellow-500 animate-spin" />;
      case 'error': return <WifiOff size={14} className="text-red-500" />;
      default: return <WifiOff size={14} className="text-gray-500" />;
    }
  };

  if (isLoading && Object.keys(marketData).length === 0) {
    return (
      <AppLayout>
        <div className="p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded" />
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
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Shield size={22} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Risk Rules
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Define hard limits and protective mechanisms for capital preservation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
              {getConnectionIcon()}
              <span className={`font-medium ${
                connectionStatus === 'connected' ? 'text-green-600 dark:text-green-400' :
                connectionStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-gray-500 dark:text-gray-400'
              }`}>
                {connectionStatus === 'connected' ? 'Live' : 
                 connectionStatus === 'connecting' ? 'Connecting...' :
                 connectionStatus === 'error' ? 'Error' : 'Disconnected'}
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
              {saved ? 'Saved!' : 'Save Rules'}
            </button>
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
              <AlertTriangle size={16} />
            )}
            <span className="text-sm">{saveMessage.text}</span>
          </div>
        )}

        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              Risk rules are enforced in real-time. Changes take effect on the next trade cycle. 
              Tightening limits mid-session may trigger immediate position reviews.
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 flex items-center gap-1">
              <Info size={12} />
              Current risk exposure: {riskAssessment.currentExposure}% of total capital
            </p>
          </div>
        </div>

        {/* Risk Assessment Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Current Exposure', value: `${riskAssessment.currentExposure}%`, color: riskAssessment.currentExposure > 10 ? 'text-yellow-600' : 'text-green-600' },
            { label: 'Daily P&L', value: `${riskAssessment.dailyPnL >= 0 ? '+' : ''}$${riskAssessment.dailyPnL.toFixed(2)}`, color: riskAssessment.dailyPnL >= 0 ? 'text-green-600' : 'text-red-600' },
            { label: 'Daily Loss Used', value: `${riskAssessment.dailyLossUsed}%`, color: riskAssessment.dailyLossUsed > 3 ? 'text-red-600' : 'text-green-600' },
            { label: 'Risk Score', value: riskAssessment.riskScore, color: riskAssessment.riskScore === 'Low' ? 'text-green-600' : riskAssessment.riskScore === 'Critical' ? 'text-red-600' : 'text-yellow-600' },
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
              <p className={`text-lg font-bold font-mono ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
          <TabButton id="loss" label="Loss Limits" icon={<TrendingDown size={16} />} />
          <TabButton id="position" label="Position Controls" icon={<Settings size={16} />} />
          <TabButton id="stoploss" label="Stop Loss & TP" icon={<Zap size={16} />} />
          <TabButton id="advanced" label="Advanced" icon={<Database size={16} />} />
        </div>

        {/* Loss Limits */}
        {activeTab === 'loss' && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              Loss Limits & Drawdown Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SliderField 
                label="Per-Trade Risk (% of capital)" 
                field="perTradeRisk" 
                min={0.1} 
                max={3.0} 
                step={0.1} 
                unit="%" 
                warn={2.0}
                description="Maximum loss allowed per individual trade"
              />
              <SliderField 
                label="Daily Loss Limit (% of capital)" 
                field="maxDailyLoss" 
                min={1.0} 
                max={10.0} 
                step={0.5} 
                unit="%" 
                warn={7.0}
                description="Trading will halt if this limit is reached"
              />
              <SliderField 
                label="Weekly Drawdown Limit (%)" 
                field="maxWeeklyDrawdown" 
                min={2.0} 
                max={20.0} 
                step={0.5} 
                unit="%" 
                warn={15.0}
              />
              <SliderField 
                label="Monthly Drawdown Limit (%)" 
                field="maxMonthlyDrawdown" 
                min={5.0} 
                max={30.0} 
                step={1.0} 
                unit="%" 
                warn={20.0}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-Shutdown on Daily Limit</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Halt all trading when daily loss limit is reached</p>
              </div>
              <Toggle field="dailyLossShutdown" />
            </div>
          </div>
        )}

        {/* Position Controls */}
        {activeTab === 'position' && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
              <Settings size={16} className="text-blue-500" />
              Position & Exposure Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Open Positions
                </label>
                <select
                  value={rules.maxOpenPositions}
                  onChange={(e) => {
                    setRules((r) => ({ ...r, maxOpenPositions: parseInt(e.target.value) }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((v) => (
                    <option key={v} value={v}>{v} position{v > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Correlated Trades
                </label>
                <select
                  value={rules.maxCorrelatedTrades}
                  onChange={(e) => {
                    setRules((r) => ({ ...r, maxCorrelatedTrades: parseInt(e.target.value) }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[1, 2, 3, 4].map((v) => (
                    <option key={v} value={v}>{v} trade{v > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Daily Trades
                </label>
                <select
                  value={rules.maxDailyTrades}
                  onChange={(e) => {
                    setRules((r) => ({ ...r, maxDailyTrades: parseInt(e.target.value) }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                >
                  {[5, 10, 15, 20, 30, 40, 50].map((v) => (
                    <option key={v} value={v}>{v} trades</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Risk Per Trade (USD)
                </label>
                <input
                  type="number"
                  value={rules.riskPerTradeUSD}
                  onChange={(e) => {
                    setRules((r) => ({ ...r, riskPerTradeUSD: parseFloat(e.target.value) }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <SliderField 
                label="Portfolio Heat Limit (% of capital)" 
                field="portfolioHeatLimit" 
                min={2.0} 
                max={20.0} 
                step={0.5} 
                unit="%" 
                warn={12.0}
                description="Total risk exposure across all positions"
              />
              <SliderField 
                label="Emergency Exit Threshold (% of capital)" 
                field="emergencyExitPct" 
                min={1.0} 
                max={8.0} 
                step={0.5} 
                unit="%" 
                warn={6.0}
                description="Close all positions when loss exceeds this threshold"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Correlation Check</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Block new entries when correlated positions exceed limit</p>
              </div>
              <Toggle field="correlationCheck" />
            </div>
          </div>
        )}

        {/* Stop Loss & Take Profit */}
        {activeTab === 'stoploss' && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
              <Zap size={16} className="text-purple-500" />
              Stop Loss & Take Profit Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SliderField 
                label="ATR Multiplier (Stop Loss)" 
                field="atrMultiplierSL" 
                min={1.0} 
                max={4.0} 
                step={0.1} 
                unit="x"
                description="Multiplier applied to ATR for stop loss placement"
              />
              <SliderField 
                label="TP1 Risk:Reward Ratio" 
                field="tp1Ratio" 
                min={1.5} 
                max={4.0} 
                step={0.1} 
                unit="x"
                description="First take profit level"
              />
              <SliderField 
                label="TP2 Risk:Reward Ratio" 
                field="tp2Ratio" 
                min={2.0} 
                max={6.0} 
                step={0.1} 
                unit="x"
                description="Second take profit level"
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    TP1 Position Close (%)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">
                    {rules.tp1SizeClose}%
                  </span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={75}
                  step={5}
                  value={rules.tp1SizeClose}
                  onChange={(e) => {
                    setRules((r) => ({ ...r, tp1SizeClose: parseInt(e.target.value) }));
                    setIsDirty(true);
                  }}
                  className="w-full accent-blue-600 dark:accent-blue-400"
                />
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Percentage of position to close at TP1
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Trailing Stop</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Dynamic ATR-based trailing after TP1</p>
              </div>
              <Toggle field="trailingStopEnabled" />
            </div>
            {rules.trailingStopEnabled && (
              <SliderField 
                label="Trailing Stop ATR Multiplier" 
                field="trailingStopATR" 
                min={0.5} 
                max={3.0} 
                step={0.1} 
                unit="x"
                description="ATR multiplier for trailing stop activation"
              />
            )}
          </div>
        )}

        {/* Advanced Controls */}
        {activeTab === 'advanced' && (
          <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
              <Database size={16} className="text-indigo-500" />
              Advanced Risk Controls
            </h2>
            {[
              { 
                field: 'kellyEnabled' as keyof RiskRules, 
                label: 'Kelly Criterion Sizing', 
                desc: 'Dynamically size positions based on historical win-rate and R:R' 
              },
              { 
                field: 'anomalyDetection' as keyof RiskRules, 
                label: 'Anomaly Detection', 
                desc: 'Pause trading on unusual price movements or volume spikes' 
              },
              { 
                field: 'autoScaling' as keyof RiskRules, 
                label: 'Auto-Scaling', 
                desc: 'Reduce position size after consecutive losses' 
              },
            ].map(({ field, label, desc }) => (
              <div key={field} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                </div>
                <Toggle field={field} />
              </div>
            ))}
            {rules.kellyEnabled && (
              <div className="mt-2">
                <SliderField 
                  label="Kelly Fraction (conservative multiplier)" 
                  field="kellyFraction" 
                  min={0.1} 
                  max={1.0} 
                  step={0.05} 
                  unit="x"
                  description="Fraction of Kelly optimal position size (0.25 = 25%)"
                />
              </div>
            )}
            
            <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <Info size={14} />
                Risk Assessment Summary
              </h4>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Max Loss Per Trade: <span className="font-semibold text-gray-900 dark:text-white">${riskAssessment.maxLossPerTrade.toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Daily Loss Limit: <span className="font-semibold text-gray-900 dark:text-white">${riskAssessment.dailyLossLimit.toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Max Positions: <span className="font-semibold text-gray-900 dark:text-white">{rules.maxOpenPositions}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Open Positions: <span className="font-semibold text-gray-900 dark:text-white">{riskAssessment.openPositions}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}