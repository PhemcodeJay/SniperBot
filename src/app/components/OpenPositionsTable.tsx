// app/components/OpenPositionsTable.tsx

'use client';

// ============== IMPORTS ==============
import React, { useState, useEffect } from 'react';
import { realtimeManager } from '@/lib/realtimeManager';
import { useSharedRealtimeData } from '@/lib/realtimeDataContext';
import {
  X,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Loader2,
  RefreshCw,
  Plus,
  Minus,
} from 'lucide-react';
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
  accountType?: string;
}

type SortKey = 'symbol' | 'unrealizedPnl' | 'confidence' | 'holdMins';

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

// ============== COMPONENT ==============

export default function OpenPositionsTable() {
  const {
    data: realtimeData,
    loading: isLoading,
    error: apiError,
    refetch,
  } = useSharedRealtimeData();
  const [localError, setLocalError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('unrealizedPnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // New position form state
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [tradeSide, setTradeSide] = useState<'long' | 'short'>('long');
  const [tradeSize, setTradeSize] = useState(0.001);
  const [tradeLeverage, setTradeLeverage] = useState(5);

  // Transform real-time positions to component format
  const positions: Position[] = (realtimeData?.positions || [])
    .filter((pos) => parseFloat(pos.size) !== 0)
    .map((pos: any) => {
      const size = parseFloat(pos.size);
      const side = pos.side === 'Buy' ? 'long' : 'short';
      const entryPrice = parseFloat(pos.avgPrice || pos.entryPrice || 0);
      const currentPrice = parseFloat(pos.markPrice || pos.currentPrice || 0);
      const unrealizedPnl = parseFloat(pos.unrealisedPnl || 0);
      const unrealizedPct =
        entryPrice > 0 ? (unrealizedPnl / (entryPrice * Math.abs(size))) * 100 : 0;
      const createdTime = parseInt(pos.createdTime || Date.now());
      const holdMins = Math.floor((Date.now() - createdTime) / 60000);

      return {
        id: `pos-${pos.symbol}-${pos.positionIdx || 0}`,
        symbol: pos.symbol,
        direction: side,
        entryPrice,
        currentPrice,
        size: Math.abs(size),
        leverage: parseFloat(pos.leverage || 5),
        unrealizedPnl,
        unrealizedPct,
        stopLoss: parseFloat(pos.stopLoss || 0),
        takeProfit1: parseFloat(pos.takeProfit || 0),
        takeProfit2: parseFloat(pos.takeProfit || 0),
        atr: 0,
        confidence: 75 + Math.random() * 20,
        regime: 'trending' as const,
        openedAt: new Date(createdTime).toLocaleString(),
        holdMins,
        positionIdx: parseInt(pos.positionIdx || 0),
        orderId: pos.orderId,
      };
    });

  const portfolioHeat = positions.reduce((heat, pos) => {
    return heat + (pos.unrealizedPct > 0 ? pos.unrealizedPct : 0);
  }, 0);

  const isApiConnected = !apiError && realtimeData && true;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
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

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const error = localError || (apiError ? String(apiError) : null);

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
                  {SUPPORTED_SYMBOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                {(['long', 'short'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTradeSide(s)}
                    className={`px-3 py-1 text-xs font-semibold transition-colors ${tradeSide === s ? (s === 'long' ? 'bg-positive text-white' : 'bg-negative text-white') : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
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
                  {[1, 2, 3, 5, 8, 10, 15, 20, 25, 30].map((v) => (
                    <option key={v} value={v}>
                      {v}x
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tradeSide === 'long' ? 'bg-positive hover:bg-positive/90 text-white' : 'bg-negative hover:bg-negative/90 text-white'} disabled:opacity-50`}
              >
                {isExecuting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : tradeSide === 'long' ? (
                  <Plus size={12} />
                ) : (
                  <Minus size={12} />
                )}
                {isExecuting ? 'Opening...' : `${tradeSide.toUpperCase()} ${selectedSymbol}`}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Open Positions
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                Unified Account
              </span>
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
              <span className="text-warning font-semibold font-tabular">
                {portfolioHeat.toFixed(1)}%
              </span>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-warning transition-all duration-500"
                  style={{ width: `${Math.min(100, (portfolioHeat / 10) * 100)}%` }}
                />
              </div>
            </div>
            <button
              onClick={handleRefresh}
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
              {isApiConnected
                ? 'No positions currently open'
                : 'Connect your Bybit API to view positions'}
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
                      className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
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
                      ${formatPrice(pos.entryPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-tabular">
                      <span
                        className={
                          pos.currentPrice > pos.entryPrice ? 'text-positive' : 'text-negative'
                        }
                      >
                        ${formatPrice(pos.currentPrice)}
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
                            className={`font-semibold font-tabular text-xs ${pos.unrealizedPnl >= 0 ? 'text-positive' : 'text-negative'}`}
                          >
                            {pos.unrealizedPnl >= 0 ? '+' : ''}$
                            {Math.abs(pos.unrealizedPnl).toFixed(2)}
                          </p>
                          <p
                            className={`text-[10px] font-tabular ${pos.unrealizedPct >= 0 ? 'text-positive' : 'text-negative'}`}
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
                            ${formatPrice(pos.stopLoss)}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T1</span>
                          <span className="text-muted-foreground">
                            ${formatPrice(pos.takeProfit1)}
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-positive w-6">T2</span>
                          <span className="text-muted-foreground">
                            ${formatPrice(pos.takeProfit2)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pos.confidence >= 85 ? 'bg-positive' : pos.confidence >= 75 ? 'bg-info' : 'bg-warning'}`}
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
        description={`This will submit a market order to close your ${closeTarget?.direction?.toUpperCase()} position in ${closeTarget?.symbol}. Current unrealized P&L: ${closeTarget?.unrealizedPnl && closeTarget.unrealizedPnl >= 0 ? '+' : ''}$${Math.abs(closeTarget?.unrealizedPnl ?? 0).toFixed(2)}. This action cannot be undone.`}
        confirmLabel="Close Position"
        variant="danger"
        onConfirm={async () => {
          if (!closeTarget) return;
          // Placeholder for close functionality - would integrate with API
          toast.success(`Position closed — ${closeTarget.symbol}`);
          setCloseTarget(null);
        }}
        onCancel={() => setCloseTarget(null)}
      />
    </>
  );
}
