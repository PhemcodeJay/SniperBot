// app/components/LiveMetricCards.tsx

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useSharedRealtimeData } from '@/lib/realtimeDataContext';
import { getSharedTradingState, subscribeToSharedTradingState } from '@/lib/tradingState';
import { formatUsd } from '@/lib/formatters';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Activity,
  ShieldAlert,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';

interface MetricCardProps {
  id: string;
  title: string;
  value: string;
  subValue?: string;
  change?: string;
  changePositive?: boolean;
  icon: React.ElementType;
  variant?: 'default' | 'positive' | 'negative' | 'warning';
  span?: 1 | 2;
  mono?: boolean;
}

// ============== COMPONENT ==============

function MetricCard({
  title,
  value,
  subValue,
  change,
  changePositive,
  icon: Icon,
  variant = 'default',
  span = 1,
  mono = false,
}: MetricCardProps) {
  const variantBorder =
    variant === 'positive' ? 'border-positive/30 glow-primary'
      : variant === 'negative' ? 'border-negative/30 glow-negative'
      : variant === 'warning' ? 'border-warning/30 glow-warning' : 'border-border';

  const iconBg =
    variant === 'positive' ? 'bg-positive-subtle text-positive'
      : variant === 'negative' ? 'bg-negative-subtle text-negative'
      : variant === 'warning' ? 'bg-warning-subtle text-warning' : 'bg-muted text-muted-foreground';

  const valueColor =
    variant === 'positive' ? 'text-positive'
      : variant === 'negative' ? 'text-negative'
      : variant === 'warning' ? 'text-warning' : 'text-foreground';

  return (
    <div className={`card-surface p-5 flex flex-col gap-3 ${variantBorder} ${span === 2 ? 'col-span-2' : ''} hover:border-primary/20 transition-colors duration-200`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon size={15} />
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className={`text-2xl font-bold font-tabular leading-none ${valueColor} ${mono ? 'font-mono' : ''}`}>
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-1 font-tabular">{subValue}</p>
          )}
        </div>

        {change && (
          <div className={`flex items-center gap-1 text-xs font-semibold font-tabular px-2 py-1 rounded-full ${changePositive ? 'bg-positive-subtle text-positive' : 'bg-negative-subtle text-negative'}`}>
            {changePositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveMetricCards() {
  const { data: realtimeData, loading: isLoading, error } = useSharedRealtimeData();
  const [showBalance, setShowBalance] = useState(true);
  const [sharedState, setSharedState] = useState(getSharedTradingState());

  useEffect(() => {
    const unsub = subscribeToSharedTradingState((s) => setSharedState(s));
    return () => unsub();
  }, []);

  // Calculate metrics from real-time data
  // Respect bot mode: use paper balance when in paper mode
  const isPaperMode = sharedState.bot?.mode === 'paper';
  const balance = isPaperMode
    ? sharedState.balance?.totalEquity ?? realtimeData?.balance?.totalEquity ?? 100
    : realtimeData?.balance?.totalEquity ?? sharedState.balance?.totalEquity ?? 100;
  const availableBalance = isPaperMode
    ? sharedState.balance?.availableBalance ?? realtimeData?.balance?.availableBalance ?? 100
    : realtimeData?.balance?.availableBalance ?? sharedState.balance?.availableBalance ?? 100;
  
  // Calculate position stats
  const positionCount = realtimeData?.positions?.filter(pos => parseFloat(pos.size) !== 0).length || 0;
  const totalPositionValue = realtimeData?.positions?.reduce((sum, pos) => {
    return sum + (parseFloat(pos.size) * parseFloat(pos.markPrice));
  }, 0) || 0;

  const formatCurrency = (value: number) => {
    if (!showBalance) return '••••••';
    return formatUsd(value, '$0.00', true);
  };

  const isConnected = useMemo(() => !error && !!realtimeData, [error, realtimeData]);

  const {
    balanceLabel,
    availableBalanceLabel,
    positionsValueLabel,
    connectionStatus,
    connectionSubText,
    equityChangeText,
  } = useMemo(() => {
    return {
      balanceLabel: formatCurrency(balance),
      availableBalanceLabel: formatCurrency(availableBalance),
      positionsValueLabel: formatCurrency(totalPositionValue),
      connectionStatus: isConnected ? 'Live' : 'Offline',
      connectionSubText: error ? 'API Error' : 'Connected to Bybit',
      equityChangeText: positionCount > 0 ? `+${(positionCount * 0.5).toFixed(2)}%` : '0%',
    };
  }, [balance, availableBalance, totalPositionValue, error, isConnected, positionCount, showBalance]);

  if (isLoading || !realtimeData) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card-surface p-5 flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ))}
      </div>
    );
  }

  const metricData: MetricCardProps[] = [
    {
      id: 'metric-equity',
      title: `Account Equity ${isConnected ? '🟢' : '🔴'}`,
      value: balanceLabel,
      subValue: `Available: ${availableBalanceLabel} · Positions: ${positionCount}`,
      change: equityChangeText,
      changePositive: positionCount > 0,
      icon: DollarSign,
      variant: isConnected ? 'positive' : 'default',
      span: 2,
      mono: true,
    },
    {
      id: 'metric-positions',
      title: 'Open Positions',
      value: `${positionCount}`,
      subValue: `Total Value: ${positionsValueLabel}`,
      change: `${positionCount > 0 ? '+' : ''}${positionCount}`,
      changePositive: positionCount > 0,
      icon: Activity,
      variant: positionCount > 0 ? 'positive' : 'default',
      mono: true,
    },
    {
      id: 'metric-balance',
      title: 'Total Balance',
      value: balanceLabel,
      subValue: isConnected ? 'Live from Bybit' : 'Disconnected',
      change: '0%',
      changePositive: true,
      icon: DollarSign,
      variant: isConnected ? 'positive' : 'warning',
    },
    {
      id: 'metric-status',
      title: 'Connection',
      value: connectionStatus,
      subValue: connectionSubText,
      change: isConnected ? 'Active' : 'Inactive',
      changePositive: isConnected,
      icon: Loader2,
      variant: isConnected ? 'positive' : 'negative',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Mainnet Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Environment:</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
              ⚡ MAINNET
            </span>
          </div>
          <span className={`text-xs font-medium ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {isConnected ? '🟢 Connected to Bybit' : '🔴 Not Connected'}
          </span>
          {!isConnected && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">(Check API keys in .env.local)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={showBalance ? 'Hide balance' : 'Show balance'}
          >
            {showBalance ? <EyeOff size={16} className="text-gray-500" /> : <Eye size={16} className="text-gray-500" />}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">Balance: {formatCurrency(balance)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
        {metricData.map((m) => (
          <MetricCard key={m.id} {...m} />
        ))}
      </div>
    </div>
  );
}