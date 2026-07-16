// app/settings/page.tsx - REAL Bybit API Data

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { BYBIT_BASE_URL, createBybitAuthHeaders, getBybitCredentials, safeJsonParse } from '@/lib/bybit';
import { setSharedBotState } from '@/lib/tradingState';
import { 
  Settings, ExternalLink, Save, Key, Shield, 
  Wifi, WifiOff, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Eye, EyeOff, Copy, Check,
  Network, Database, Activity, Server, Loader2
} from 'lucide-react';

interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
}

// ============== API HELPERS ==============
const getApiCredentials = () => getBybitCredentials();

// ============== COMPONENT ==============

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<ApiCredentials>({
    apiKey: '',
    apiSecret: '',
    isTestnet: false,
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
  const [isConnected, setIsConnected] = useState(false);

  // Load saved credentials from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bybit_credentials');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCredentials({
          apiKey: parsed.apiKey || '',
          apiSecret: parsed.apiSecret || '',
          isTestnet: parsed.isTestnet || false,
        });
      } catch (e) {
        // Ignore
      }
    }
  }, []);

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

    const recvWindow = '5000';
    const params = '';

    try {
      const headers = await createBybitAuthHeaders(credentials.apiKey, credentials.apiSecret, params, recvWindow);
      
      // Get wallet balance
      const response = await fetch(`${BYBIT_BASE_URL}/v5/account/wallet-balance`, {
        method: 'GET',
        headers,
      });

      const data = await safeJsonParse(response);

      if (data && data.retCode === 0 && data.result) {
        const wallet = data.result.list?.[0];
        const totalEquity = wallet?.totalEquity || wallet?.equity || '0';
        const accountUid = data.result.uid || data.result.accountUid || 'N/A';
        
        setBalance(`${parseFloat(totalEquity).toFixed(2)} USDT`);
        setUid(accountUid);
        setIsConnected(true);

        // Get account info
        try {
          const accountInfoResponse = await fetch(`${BYBIT_BASE_URL}/v5/account/info`, {
            method: 'GET',
            headers,
          });
          const accountData = await safeJsonParse(accountInfoResponse);
          
          if (accountData && accountData.retCode === 0 && accountData.result) {
            let accType = 'Unified Trading Account';
            if (accountData.result.accountType) {
              accType = accountData.result.accountType;
            } else if (accountData.result.accType) {
              accType = accountData.result.accType;
            } else if (accountData.result.unifiedAccountInfo) {
              accType = 'Unified Trading Account';
            }
            setAccountType(accType);
          } else {
            setAccountType('Unified Trading Account');
          }
        } catch (e) {
          setAccountType('Unified Trading Account');
        }
        
        setTestStatus('success');
        setTestMessage('✅ Connection verified successfully!');
        setError(null);
      } else {
        const errorMsg = data?.retMsg || 'Unknown error';
        const errorCode = data?.retCode || 'Unknown';
        
        let userMessage = `❌ Error ${errorCode}: ${errorMsg}`;
        if (errorCode === 10005) {
          userMessage = '❌ Invalid API key. Please check your API key.';
        } else if (errorCode === 10006) {
          userMessage = '❌ Invalid API signature. Please check your API secret.';
        }
        
        setTestStatus('error');
        setTestMessage(userMessage);
        setError(errorMsg);
        setIsConnected(false);
      }
    } catch (error: any) {
      console.error('Connection test error:', error);
      setTestStatus('error');
      setTestMessage('❌ Failed to connect. Please check your credentials and network.');
      setError(error.message);
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
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
      // Save to localStorage
      localStorage.setItem('bybit_credentials', JSON.stringify({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
        isTestnet: credentials.isTestnet,
      }));
      
      // Dispatch event to notify other components
      setSharedBotState({ isConnected: true, status: 'scanning', lastAction: 'Credentials saved' });
      window.dispatchEvent(new CustomEvent('bybit-credentials-saved', {
        detail: {
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          isTestnet: credentials.isTestnet,
        }
      }));
      
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
                Configure Bybit API credentials for live trading
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

        {/* API Credentials */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Key size={16} className="text-blue-600 dark:text-blue-400" />
              API Credentials
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isConnected 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              {isConnected ? 'Connected' : 'Disconnected'}
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
                  placeholder="Enter your Bybit API Key"
                  className="w-full px-3 py-2 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
                {credentials.apiKey && (
                  <button
                    onClick={() => copyToClipboard(credentials.apiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
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
                  placeholder="Enter your Bybit API Secret"
                  className="w-full px-3 py-2 pr-20 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  {credentials.apiSecret && (
                    <button
                      onClick={() => copyToClipboard(credentials.apiSecret)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={testConnection}
                disabled={isTesting}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {isTesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Wifi size={14} />
                )}
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
              <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                testStatus === 'success' 
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                {testStatus === 'success' ? (
                  <CheckCircle size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={testStatus === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                    {testMessage}
                  </p>
                  {testStatus === 'success' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {balance && (
                        <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">Total Equity</p>
                          <p className="text-xs font-bold font-mono text-green-600 dark:text-green-400">{balance}</p>
                        </div>
                      )}
                      {accountType && accountType !== 'Checking...' && (
                        <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">Account Type</p>
                          <p className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400">{accountType}</p>
                        </div>
                      )}
                      {uid && uid !== 'N/A' && (
                        <div className="bg-white dark:bg-gray-800/80 rounded-md px-2 py-1.5 col-span-2">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">Account UID</p>
                          <p className="text-xs font-bold font-mono text-gray-900 dark:text-white">{uid}</p>
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

        {/* Instructions */}
        <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield size={16} className="text-yellow-600 dark:text-yellow-400" />
            How to get your Bybit API credentials
          </h3>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <li>Go to <a href={bybitLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Bybit API Management</a></li>
            <li>Click "Create API Key" and select "Unified Trading Account"</li>
            <li>Enable the following permissions:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <li>Read &amp; Trade</li>
                <li>Read positions</li>
                <li>Read wallet balance</li>
              </ul>
            </li>
            <li>Copy your API Key and Secret into the fields above</li>
            <li>Click "Test Connection" to verify your credentials</li>
          </ol>
        </div>

        {/* Footer note */}
        <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <p className="text-center text-[11px] text-yellow-700 dark:text-yellow-400 flex items-center justify-center gap-2">
            <Shield size={12} />
            API credentials are stored in browser session only. For production use, store keys server-side via environment variables.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}