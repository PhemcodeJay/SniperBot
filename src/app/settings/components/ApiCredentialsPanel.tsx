// app/components/ApiCredentialsPanel.tsx

'use client';

import React, { useState } from 'react';
import { BYBIT_BASE_URL, createBybitAuthHeaders, safeJsonParse } from '@/lib/bybit';
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

type TradingMode = 'paper' | 'live';

interface Credentials {
  apiKey: string;
  apiSecret: string;
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
  latency?: number;
  accountInfo?: { 
    balance: string; 
    uid: string;
    accountType?: string;
    availableBalance?: string;
    totalEquity?: string;
  };
}

// ============== BYBIT API CONFIG ==============

// ============== API HELPERS ==============

// ============== API FUNCTIONS ==============

// Fetch wallet balance
const fetchWalletBalance = async (apiKey: string, apiSecret: string): Promise<{ totalEquity: string; availableBalance: string; uid: string }> => {
  try {
    const recvWindow = '5000';
    const params = 'accountType=UNIFIED';
    const headers = await createBybitAuthHeaders(apiKey, apiSecret, params, recvWindow);

    const response = await fetch(`${BYBIT_BASE_URL}/v5/account/wallet-balance?${params}`, {
      method: 'GET',
      headers,
    });

    const data = await safeJsonParse(response);

    if (data?.retCode === 0) {
      const wallet = data?.result?.list?.[0] || data?.result || {};
      const totalEquity = wallet?.totalEquity ?? wallet?.equity ?? wallet?.walletBalance ?? wallet?.balance ?? '0';
      const availableBalance = wallet?.availableBalance ?? wallet?.available ?? wallet?.walletBalance ?? wallet?.balance ?? '0';
      const uid = data?.result?.uid || data?.result?.accountUid || wallet?.uid || 'N/A';

      return {
        totalEquity: String(totalEquity),
        availableBalance: String(availableBalance),
        uid,
      };
    }

    const errorMsg = data?.retMsg || 'Unknown error';
    const errorCode = data?.retCode || 'Unknown';
    throw new Error(`Error ${errorCode}: ${errorMsg}`);
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    throw error;
  }
};

// Fetch account info
const fetchAccountInfo = async (apiKey: string, apiSecret: string): Promise<{ accountType: string; uid: string }> => {
  try {
    const recvWindow = '5000';
    const params = 'accountType=UNIFIED';
    const headers = await createBybitAuthHeaders(apiKey, apiSecret, params, recvWindow);

    const response = await fetch(`${BYBIT_BASE_URL}/v5/account/info?${params}`, {
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
    
    const errorMsg = data?.retMsg || 'Unknown error';
    const errorCode = data?.retCode || 'Unknown';
    throw new Error(`Error ${errorCode}: ${errorMsg}`);
  } catch (error) {
    console.error('Error fetching account info:', error);
    throw error;
  }
};

// ============== COMPONENT ==============

export default function ApiCredentialsPanel() {
  const [activeMode, setActiveMode] = useState<TradingMode>('live');
  const [showSecret, setShowSecret] = useState<Record<TradingMode, boolean>>({ paper: false, live: false });
  const [credentials, setCredentials] = useState<Record<TradingMode, Credentials>>({
    paper: { apiKey: '', apiSecret: '' },
    live: { apiKey: process.env.NEXT_PUBLIC_BYBIT_API_KEY || '', apiSecret: process.env.NEXT_PUBLIC_BYBIT_API_SECRET || '' },
  });
  const [testResult, setTestResult] = useState<Record<TradingMode, TestResult>>({
    paper: { status: 'idle', message: '' },
    live: { status: 'idle', message: '' },
  });

  const handleChange = (mode: TradingMode, field: keyof Credentials, value: string) => {
    setCredentials((prev) => ({ ...prev, [mode]: { ...prev[mode], [field]: value.trim() } }));
    setTestResult((prev) => ({ ...prev, [mode]: { status: 'idle', message: '' } }));
  };

  const handleTest = async (mode: TradingMode) => {
    const creds = credentials[mode];
    if (!creds.apiKey || !creds.apiSecret) {
      setTestResult((prev) => ({ ...prev, [mode]: { status: 'error', message: 'API Key and Secret are required.' } }));
      return;
    }

    // Validate API key format
    if (creds.apiKey.length < 20) {
      setTestResult((prev) => ({ 
        ...prev, 
        [mode]: { 
          status: 'error', 
          message: '⚠️ API key appears to be invalid. Bybit API keys are typically 32+ characters. Please check your API credentials.' 
        } 
      }));
      return;
    }

    setTestResult((prev) => ({ ...prev, [mode]: { status: 'testing', message: 'Connecting to Bybit Mainnet...' } }));
    const start = Date.now();

    try {
      // Fetch wallet balance first (most reliable endpoint)
      const balanceData = await fetchWalletBalance(creds.apiKey, creds.apiSecret);
      
      // Then fetch account info
      const accountData = await fetchAccountInfo(creds.apiKey, creds.apiSecret);
      
      const latency = Date.now() - start;
      
      const balanceNum = parseFloat(balanceData.totalEquity);
      const availableNum = parseFloat(balanceData.availableBalance);
      const balanceDisplay = Number.isFinite(balanceNum) && balanceNum > 0 ? `${balanceNum.toFixed(2)} USDT` : '0.00 USDT';
      const availableDisplay = Number.isFinite(availableNum) && availableNum > 0 ? `${availableNum.toFixed(2)} USDT` : '0.00 USDT';
      const totalDisplay = Number.isFinite(balanceNum) && balanceNum > 0 ? `${balanceNum.toFixed(2)} USDT` : '0.00 USDT';

      setTestResult((prev) => ({
        ...prev,
        [mode]: {
          status: 'success',
          message: `✅ Connected to Bybit Mainnet Unified Trading Account`,
          latency,
          accountInfo: {
            balance: balanceDisplay,
            uid: accountData.uid,
            accountType: accountData.accountType,
            availableBalance: availableDisplay,
            totalEquity: totalDisplay,
          },
        },
      }));
    } catch (error: any) {
      console.error('Connection test error:', error);
      const latency = Date.now() - start;
      
      let userMessage = error.message || '❌ Failed to connect. Check your credentials and network.';
      
      // Parse common Bybit errors
      if (userMessage.includes('10005')) {
        userMessage = '❌ Invalid API key. Please check your API key.';
      } else if (userMessage.includes('10006')) {
        userMessage = '❌ Invalid API signature. Please check your API secret.';
      } else if (userMessage.includes('10003')) {
        userMessage = '❌ Rate limit exceeded. Please try again later.';
      } else if (userMessage.includes('10010')) {
        userMessage = '❌ API key permissions insufficient. Please ensure your API key has read permissions.';
      } else if (userMessage.includes('fetch') || userMessage.includes('network')) {
        userMessage = '❌ Network error. Please check your internet connection.';
      } else if (userMessage.includes('timeout')) {
        userMessage = '❌ Connection timeout. Please try again.';
      }

      setTestResult((prev) => ({
        ...prev,
        [mode]: {
          status: 'error',
          message: userMessage,
          latency,
        },
      }));
    }
  };

  const result = testResult[activeMode];
  const creds = credentials[activeMode];

  // Check if API key looks valid (basic validation)
  const hasValidKey = creds.apiKey && creds.apiKey.length >= 20;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <ShieldCheck size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">Bybit API Credentials</h2>
          <p className="text-muted-foreground text-xs mt-0.5">Configure keys for Unified Trading Account</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-5 p-1 bg-muted rounded-lg w-fit">
        {(['paper', 'live'] as TradingMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveMode(mode)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 capitalize ${
              activeMode === mode
                ? mode === 'live' ? 'bg-negative text-white shadow-sm' : 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode === 'live' ? '⚡ Live' : '📄 Paper'}
          </button>
        ))}
      </div>

      {/* Live Warning */}
      {activeMode === 'live' && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-negative-subtle border border-negative/20">
          <ShieldAlert size={15} className="text-negative shrink-0 mt-0.5" />
          <p className="text-negative text-xs leading-relaxed">
            Live trading uses real funds. Ensure your API key has <strong>Trade</strong> permission only — never enable withdrawals.
          </p>
        </div>
      )}

      {/* Credential Status */}
      <div className="mb-4 p-2 rounded-lg bg-muted/30 border border-border text-xs flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${hasValidKey ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-muted-foreground">
          {hasValidKey ? 'API key loaded from environment' : 'No API key configured'}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {creds.apiKey ? `${creds.apiKey.slice(0, 8)}...${creds.apiKey.slice(-4)}` : 'Not set'}
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            API Key <span className="text-negative">*</span>
          </label>
          <input
            type="text"
            value={creds.apiKey}
            onChange={(e) => handleChange(activeMode, 'apiKey', e.target.value)}
            placeholder="Enter your Bybit Mainnet API Key"
            className={`w-full bg-background border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono ${
              creds.apiKey && creds.apiKey.length < 20 ? 'border-yellow-500' : 'border-border'
            }`}
          />
          {creds.apiKey && creds.apiKey.length < 20 && (
            <p className="text-yellow-600 dark:text-yellow-400 text-[10px] mt-1">
              ⚠️ API key is shorter than expected. Bybit API keys are typically 32+ characters.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            API Secret <span className="text-negative">*</span>
          </label>
          <div className="relative">
            <input
              type={showSecret[activeMode] ? 'text' : 'password'}
              value={creds.apiSecret}
              onChange={(e) => handleChange(activeMode, 'apiSecret', e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••••••"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret((prev) => ({ ...prev, [activeMode]: !prev[activeMode] }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSecret[activeMode] ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* Test Button */}
      <button
        onClick={() => handleTest(activeMode)}
        disabled={result.status === 'testing'}
        className={`mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
          result.status === 'testing' ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary hover:bg-primary/90 text-white'
        }`}
      >
        {result.status === 'testing' ? (
          <><Loader2 size={15} className="animate-spin" /> Connecting to Bybit Mainnet...</>
        ) : (
          'Test Connection'
        )}
      </button>

      {/* Result */}
      {result.status !== 'idle' && result.status !== 'testing' && (
        <div className={`mt-4 p-3 rounded-lg border flex items-start gap-2.5 ${
          result.status === 'success' ? 'bg-positive-subtle border-positive/20' : 'bg-negative-subtle border-negative/20'
        }`}>
          {result.status === 'success' ? (
            <CheckCircle2 size={15} className="text-positive shrink-0 mt-0.5" />
          ) : (
            <XCircle size={15} className="text-negative shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium ${result.status === 'success' ? 'text-positive' : 'text-negative'}`}>
              {result.message}
            </p>
            {result.latency && (
              <p className="text-muted-foreground text-[11px] mt-0.5">Latency: {result.latency}ms</p>
            )}
            {result.accountInfo && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="bg-background/60 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">Total Equity</p>
                  <p className="text-xs font-mono font-semibold text-foreground">{result.accountInfo.totalEquity || result.accountInfo.balance}</p>
                </div>
                <div className="bg-background/60 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">Available Balance</p>
                  <p className="text-xs font-mono font-semibold text-foreground">{result.accountInfo.availableBalance || '0.00 USDT'}</p>
                </div>
                <div className="bg-background/60 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">Account Type</p>
                  <p className="text-xs font-mono font-semibold text-foreground">{result.accountInfo.accountType || 'Unified'}</p>
                </div>
                <div className="bg-background/60 rounded-md px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">Account UID</p>
                  <p className="text-xs font-mono font-semibold text-foreground">{result.accountInfo.uid}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}