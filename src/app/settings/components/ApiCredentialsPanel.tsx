// ApiCredentialsPanel.tsx
'use client';

import React, { useState } from 'react';
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
  accountInfo?: { balance: string; uid: string };
}

// Bybit API endpoints
const BYBIT_API = {
  paper: 'https://api-testnet.bybit.com',
  live: 'https://api.bybit.com',
};

export default function ApiCredentialsPanel() {
  const [activeMode, setActiveMode] = useState<TradingMode>('paper');
  const [showSecret, setShowSecret] = useState<Record<TradingMode, boolean>>({ paper: false, live: false });
  const [credentials, setCredentials] = useState<Record<TradingMode, Credentials>>({
    paper: { apiKey: '', apiSecret: '' },
    live: { apiKey: '', apiSecret: '' },
  });
  const [testResult, setTestResult] = useState<Record<TradingMode, TestResult>>({
    paper: { status: 'idle', message: '' },
    live: { status: 'idle', message: '' },
  });

  const handleChange = (mode: TradingMode, field: keyof Credentials, value: string) => {
    setCredentials((prev) => ({ ...prev, [mode]: { ...prev[mode], [field]: value } }));
    setTestResult((prev) => ({ ...prev, [mode]: { status: 'idle', message: '' } }));
  };

  // Generate signature for Bybit API
  const generateSignature = (apiSecret: string, timestamp: string, recvWindow: string, params: string) => {
    const crypto = require('crypto');
    const paramStr = timestamp + apiSecret + recvWindow + params;
    return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
  };

  const handleTest = async (mode: TradingMode) => {
    const creds = credentials[mode];
    if (!creds.apiKey || !creds.apiSecret) {
      setTestResult((prev) => ({ ...prev, [mode]: { status: 'error', message: 'API Key and Secret are required.' } }));
      return;
    }

    setTestResult((prev) => ({ ...prev, [mode]: { status: 'testing', message: 'Connecting to Bybit...' } }));
    const start = Date.now();

    try {
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const params = '';

      // Generate signature for wallet balance endpoint
      const signature = generateSignature(creds.apiSecret, timestamp, recvWindow, params);

      const response = await fetch(`${BYBIT_API[mode]}/v5/account/wallet-balance`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': creds.apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      });

      const data = await response.json();
      const latency = Date.now() - start;

      if (data.retCode === 0 && data.result) {
        const wallet = data.result.list?.[0];
        const totalBalance = wallet?.totalEquity || '0';
        const uid = data.result.uid || 'N/A';

        setTestResult((prev) => ({
          ...prev,
          [mode]: {
            status: 'success',
            message: 'Connection verified successfully.',
            latency,
            accountInfo: {
              balance: `${parseFloat(totalBalance).toFixed(2)} USDT`,
              uid: uid,
            },
          },
        }));
      } else {
        throw new Error(data.retMsg || 'Invalid credentials or API error');
      }
    } catch (error: any) {
      const latency = Date.now() - start;
      setTestResult((prev) => ({
        ...prev,
        [mode]: {
          status: 'error',
          message: error.message || 'Failed to connect. Check your credentials and network.',
          latency,
        },
      }));
    }
  };

  const result = testResult[activeMode];
  const creds = credentials[activeMode];

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <ShieldCheck size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">Bybit API Credentials</h2>
          <p className="text-muted-foreground text-xs mt-0.5">Configure keys for paper and live trading modes</p>
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
                ? mode === 'live' ?'bg-negative text-white shadow-sm' :'bg-primary text-white shadow-sm' :'text-muted-foreground hover:text-foreground'
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
            placeholder={activeMode === 'paper' ? 'Bybit Testnet API Key' : 'Bybit Mainnet API Key'}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
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
          result.status === 'testing' ?'bg-muted text-muted-foreground cursor-not-allowed' :'bg-primary hover:bg-primary/90 text-white'
        }`}
      >
        {result.status === 'testing' ? (
          <><Loader2 size={15} className="animate-spin" /> Testing Connection...</>
        ) : (
          'Test Connection'
        )}
      </button>

      {/* Result */}
      {result.status !== 'idle' && result.status !== 'testing' && (
        <div className={`mt-4 p-3 rounded-lg border flex items-start gap-2.5 ${
          result.status === 'success' ?'bg-positive-subtle border-positive/20' :'bg-negative-subtle border-negative/20'
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
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                  <p className="text-xs font-mono font-semibold text-foreground">{result.accountInfo.balance}</p>
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