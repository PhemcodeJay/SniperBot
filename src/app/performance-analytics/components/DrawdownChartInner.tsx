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
  Loader2,
  AlertCircle,
} from 'recharts';

interface DrawdownPoint {
  time: string;
  dd: number;
}

interface DrawdownStats {
  maxDD: number;
  currentDD: number;
  recoveryTime: number;
  limitUsed: number;
  peakPrice: number;
  troughPrice: number;
}

// Bybit API endpoints
const BYBIT_API = {
  kline: 'https://api.bybit.com/v5/market/kline',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card-surface p-3 shadow-xl text-xs font-mono">
      <p className="text-muted-foreground mb-1 font-sans text-[10px]">{label}</p>
      <p className={d.dd < -1 ? 'text-negative font-semibold' : d.dd < 0 ? 'text-warning' : 'text-positive'}>
        Drawdown: {d.dd.toFixed(2)}%
      </p>
      {d.dd < -3 && (
        <p className="text-negative text-[10px] mt-1">⚠ Significant drawdown</p>
      )}
    </div>
  );
};

export default function DrawdownChartInner() {
  const [data, setData] = useState<DrawdownPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DrawdownStats>({
    maxDD: 0,
    currentDD: 0,
    recoveryTime: 0,
    limitUsed: 0,
    peakPrice: 0,
    troughPrice: 0,
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch real kline data for BTCUSDT
      const response = await fetch(`${BYBIT_API.kline}?category=linear&symbol=BTCUSDT&interval=60&limit=72`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch kline data');
      }
      
      const result = await response.json();
      
      if (result.retCode === 0 && result.result?.list) {
        const klines = result.result.list;
        
        // Calculate drawdown from real price data
        let peak = 0;
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let peakPrice = 0;
        let troughPrice = 0;
        let peakTime = 0;
        let troughTime = 0;
        
        const drawdownData: DrawdownPoint[] = klines.map((k: any, i: number) => {
          const close = parseFloat(k[4]);
          const timestamp = parseInt(k[0]);
          const time = new Date(timestamp).toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          // Track peak
          if (close > peak) {
            peak = close;
            peakPrice = close;
            peakTime = timestamp;
          }
          
          // Calculate drawdown from peak
          const drawdown = peak > 0 ? ((close - peak) / peak) * 100 : 0;
          
          // Track max drawdown
          if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown;
            troughPrice = close;
            troughTime = timestamp;
          }
          
          // Track current drawdown
          if (i === klines.length - 1) {
            currentDrawdown = drawdown;
          }
          
          return {
            time,
            dd: Math.round(drawdown * 100) / 100,
          };
        });
        
        // Calculate recovery time (if recovered)
        const recoveryTime = maxDrawdown < 0 && peakTime > 0 && troughTime > 0
          ? Math.round((peakTime - troughTime) / 3600000)
          : 0;
        
        // Calculate limit used based on max drawdown vs 15% limit
        const limitUsed = maxDrawdown < 0 
          ? Math.round((Math.abs(maxDrawdown) / 15) * 100 * 10) / 10
          : 0;
        
        setData(drawdownData);
        setStats({
          maxDD: Math.round(Math.abs(maxDrawdown) * 100) / 100,
          currentDD: Math.round(currentDrawdown * 100) / 100,
          recoveryTime: Math.max(0, recoveryTime),
          limitUsed: Math.min(100, limitUsed),
          peakPrice: peakPrice,
          troughPrice: troughPrice,
        });
        
        setError(null);
      } else {
        throw new Error(result.retMsg || 'Failed to fetch kline data');
      }
    } catch (error) {
      console.error('Failed to fetch drawdown data:', error);
      setError('Failed to load drawdown data');
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
          <span className="ml-3 text-sm text-muted-foreground">Loading drawdown data...</span>
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
          <span className="text-sm text-muted-foreground">No drawdown data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Drawdown Tracking
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Peak-to-trough decline · Max drawdown limit: 15%
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Max DD</p>
            <p className="font-bold text-negative font-tabular">-{stats.maxDD}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Current DD</p>
            <p className={`font-bold font-tabular ${stats.currentDD < -1 ? 'text-negative' : stats.currentDD < 0 ? 'text-warning' : 'text-positive'}`}>
              {stats.currentDD.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Limit Used</p>
            <p className={`font-bold font-tabular ${stats.limitUsed > 50 ? 'text-warning' : 'text-positive'}`}>
              {stats.limitUsed}%
            </p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="drawdownAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
            dataKey="time"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={6}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            domain={[-8, 0.5]}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={-15}
            stroke="var(--negative)"
            strokeDasharray="6 3"
            strokeOpacity={0.5}
            label={{ value: 'Limit -15%', fill: 'var(--negative)', fontSize: 9, position: 'right' }}
          />
          <ReferenceLine
            y={-5}
            stroke="var(--warning)"
            strokeDasharray="4 4"
            strokeOpacity={0.4}
            label={{ value: 'Alert -5%', fill: 'var(--warning)', fontSize: 9, position: 'right' }}
          />
          <Area
            type="monotone"
            dataKey="dd"
            stroke="var(--negative)"
            strokeWidth={1.5}
            fill="url(#drawdownAreaGrad)"
            dot={false}
            activeDot={{
              r: 3,
              fill: 'var(--negative)',
              stroke: 'var(--card)',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            Peak: <span className="text-foreground font-mono">${stats.peakPrice.toFixed(2)}</span>
          </span>
          <span>
            Trough: <span className="text-foreground font-mono">${stats.troughPrice.toFixed(2)}</span>
          </span>
          <span>
            Recovery: <span className="text-foreground font-mono">{stats.recoveryTime > 0 ? `${stats.recoveryTime}h` : 'N/A'}</span>
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          <span className="text-muted-foreground">Data source:</span> Bybit BTCUSDT 1h klines
        </p>
      </div>
    </div>
  );
}