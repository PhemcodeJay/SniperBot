// app/components/EquityCurveChartInner.tsx

'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { formatUsd } from '@/lib/formatters';

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

interface EquityStats {
  startEquity: number;
  currentEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  peakEquity: number;
}

// ============== BYBIT API CONFIG ==============
const BYBIT_BASE_URL = 'https://api.bybit.com';

// ============== API HELPERS ==============
const safeJsonParse = async (response: Response) => {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ============== API FUNCTIONS ==============

// Fetch kline data
const fetchKline = async (symbol: string = 'BTCUSDT', interval: string = '240', limit: number = 30): Promise<any[]> => {
  try {
    const response = await fetch(
      `${BYBIT_BASE_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const data = await safeJsonParse(response);
    
    if (data?.retCode === 0 && data?.result?.list) {
      return data.result.list;
    }
    return [];
  } catch (error) {
    console.error('Error fetching kline data:', error);
    return [];
  }
};

// ============== COMPONENT ==============

const BASE_EQUITY = 100000;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pnl = d.equity - BASE_EQUITY;
  return (
    <div className="card-surface p-3 shadow-xl text-xs font-mono min-w-[160px]">
      <p className="text-muted-foreground mb-2 font-sans">{label}</p>
      <p className="text-foreground">
        Equity: <span className="text-primary">{formatUsd(d.equity)}</span>
      </p>
      <p className={pnl >= 0 ? 'text-positive' : 'text-negative'}>
        Net P&L: {pnl >= 0 ? '+' : ''}{formatUsd(pnl, '---', true)}
      </p>
      {d.drawdown < 0 && (
        <p className="text-negative">DD: {d.drawdown.toFixed(2)}%</p>
      )}
    </div>
  );
};

export default function EquityCurveChartInner() {
  const [data, setData] = useState<EquityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [stats, setStats] = useState<EquityStats>({
    startEquity: BASE_EQUITY,
    currentEquity: BASE_EQUITY,
    totalReturn: 0,
    maxDrawdown: 0,
    peakEquity: BASE_EQUITY,
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch real kline data for BTCUSDT
      const klines = await fetchKline('BTCUSDT', '240', 30);
      
      if (klines.length === 0) {
        throw new Error('No kline data available');
      }
      
      const startPrice = parseFloat(klines[0][1]);
      const baseEquity = BASE_EQUITY;
      
      let peakEquity = baseEquity;
      let maxDrawdown = 0;
      let peakPrice = startPrice;
      
      // Calculate equity and drawdown from real price data
      const equityData: EquityPoint[] = klines.map((k: any) => {
        const close = parseFloat(k[4]);
        const priceChange = ((close - startPrice) / startPrice);
        const equity = baseEquity * (1 + priceChange * 0.5);
        
        // Track peak equity for drawdown calculation
        if (equity > peakEquity) {
          peakEquity = equity;
          peakPrice = close;
        }
        
        // Calculate drawdown from peak equity
        const drawdown = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;
        
        // Track max drawdown
        if (drawdown < maxDrawdown) {
          maxDrawdown = drawdown;
        }
        
        const date = new Date(parseInt(k[0]));
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        return {
          date: `${dateStr} ${timeStr}`,
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round(drawdown * 100) / 100,
        };
      });
      
      // Create enhanced data with more points for smoother curve
      const enhancedData: EquityPoint[] = [];
      equityData.forEach((point, i) => {
        enhancedData.push(point);
        if (i < equityData.length - 1) {
          const nextPoint = equityData[i + 1];
          const midEquity = (point.equity + nextPoint.equity) / 2;
          const midDrawdown = (point.drawdown + nextPoint.drawdown) / 2;
          
          enhancedData.push({
            date: `${point.date} → ${nextPoint.date}`,
            equity: Math.round(midEquity * 100) / 100,
            drawdown: Math.round(midDrawdown * 100) / 100,
          });
        }
      });
      
      // Calculate final stats
      const finalEquity = enhancedData[enhancedData.length - 1]?.equity || baseEquity;
      const totalReturn = ((finalEquity - baseEquity) / baseEquity) * 100;
      
      setData(enhancedData);
      setStats({
        startEquity: baseEquity,
        currentEquity: finalEquity,
        totalReturn: totalReturn,
        maxDrawdown: Math.round(Math.abs(maxDrawdown) * 100) / 100,
        peakEquity: peakEquity,
      });
      
      setError(null);
    } catch (error) {
      console.error('Failed to fetch equity data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load equity data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="card-surface p-5">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading equity data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-surface p-5">
        <div className="flex items-center gap-3 text-negative">
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
          <button
            onClick={fetchData}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card-surface p-5">
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">No equity data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Equity Curve
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on BTC price action · {data.length} data points
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDrawdown(false)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-150 ${
                !showDrawdown
                  ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Equity
            </button>
            <button
              onClick={() => setShowDrawdown(true)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-150 ${
                showDrawdown
                  ? 'bg-negative-subtle text-negative' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Drawdown
            </button>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Total Return</p>
            <p className={`text-sm font-bold font-tabular ${stats.totalReturn >= 0 ? 'text-positive' : 'text-negative'}`}>
              {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="equityCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--negative)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            dataKey={showDrawdown ? 'drawdown' : 'equity'}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              showDrawdown ? `${v.toFixed(1)}%` : `$${(v / 1000).toFixed(1)}k`
            }
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={stats.startEquity}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.4}
            label={{ value: 'Start', fill: 'var(--muted-foreground)', fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey={showDrawdown ? 'drawdown' : 'equity'}
            stroke={showDrawdown ? 'var(--negative)' : 'var(--primary)'}
            strokeWidth={2}
            fill={showDrawdown ? 'url(#drawdownGrad)' : 'url(#equityCurveGrad)'}
            dot={false}
            activeDot={{
              r: 4,
              fill: showDrawdown ? 'var(--negative)' : 'var(--primary)',
              stroke: 'var(--card)',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            Start Equity: <span className="text-foreground font-mono">{formatUsd(stats.startEquity)}</span>
          </span>
          <span>
            Current: <span className="text-foreground font-mono">{formatUsd(stats.currentEquity)}</span>
          </span>
          <span>
            Max DD: <span className="text-negative font-mono">{stats.maxDrawdown.toFixed(1)}%</span>
          </span>
          <span>
            Peak: <span className="text-foreground font-mono">{formatUsd(stats.peakEquity)}</span>
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          <span className="text-muted-foreground">Data source:</span> Bybit BTCUSDT 4h klines
        </p>
      </div>
    </div>
  );
}