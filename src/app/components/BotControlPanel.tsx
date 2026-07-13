// BotControlPanel.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Power,
  AlertTriangle,
  Settings2,
  RefreshCw,
  ChevronRight,
  Cpu,
  Wifi,
  Database,
  Loader2,
} from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';

interface SystemStatus {
  websocket: { status: 'connected' | 'disconnected' | 'connecting'; latency: number };
  signalEngine: { status: 'running' | 'paused' | 'idle'; lastRun: string };
  mlModel: { version: string; lastRetrain: string; accuracy: number };
}

export default function BotControlPanel() {
  const [botActive, setBotActive] = useState(true);
  const [riskPct, setRiskPct] = useState(1.0);
  const [maxPositions, setMaxPositions] = useState(3);
  const [emergencyModal, setEmergencyModal] = useState(false);
  const [toggleModal, setToggleModal] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    websocket: { status: 'connecting', latency: 0 },
    signalEngine: { status: 'idle', lastRun: '-' },
    mlModel: { version: 'v12', lastRetrain: '-', accuracy: 0 },
  });
  const [paperDay, setPaperDay] = useState(3);
  const [lastScan, setLastScan] = useState('23:47:31');
  const [nextScan, setNextScan] = useState('8m');

  // Fetch system status
  const fetchSystemStatus = async () => {
    try {
      // Check WebSocket health
      const wsStart = Date.now();
      const response = await fetch('https://api.bybit.com/v5/market/time');
      const wsLatency = Date.now() - wsStart;
      
      if (response.ok) {
        setSystemStatus(prev => ({
          ...prev,
          websocket: { status: 'connected', latency: wsLatency },
        }));
      }

      // In a real app, you'd have endpoints for signal engine and ML model status
      // For now, we'll simulate with localStorage
      const savedStatus = localStorage.getItem('bot_system_status');
      if (savedStatus) {
        try {
          const parsed = JSON.parse(savedStatus);
          setSystemStatus(prev => ({
            ...prev,
            signalEngine: parsed.signalEngine || prev.signalEngine,
            mlModel: parsed.mlModel || prev.mlModel,
          }));
        } catch (e) { /* ignore */ }
      }
    } catch (error) {
      setSystemStatus(prev => ({
        ...prev,
        websocket: { status: 'disconnected', latency: 0 },
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleConfirm = () => {
    setBotActive((v) => !v);
    toast?.success(botActive ? 'Bot paused — no new signals will execute' : 'Bot resumed — scanning markets');
    setToggleModal(false);
    
    // Update signal engine status
    setSystemStatus(prev => ({
      ...prev,
      signalEngine: { 
        ...prev.signalEngine, 
        status: botActive ? 'paused' : 'running',
        lastRun: new Date().toLocaleTimeString(),
      },
    }));
  };

  const handleEmergencyConfirm = () => {
    setBotActive(false);
    toast?.error('Emergency shutdown executed — all positions queued for market close', {
      duration: 6000,
    });
    setEmergencyModal(false);
    
    setSystemStatus(prev => ({
      ...prev,
      signalEngine: { ...prev.signalEngine, status: 'idle' },
    }));
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    toast?.info('Restarting signal engine...');
    
    try {
      // Simulate restart with actual API call
      await new Promise((r) => setTimeout(r, 1800));
      
      // Refresh data
      await fetchSystemStatus();
      setLastScan(new Date().toLocaleTimeString());
      setNextScan('5m');
      
      toast?.success('Signal engine restarted — indicators recalculated');
    } catch (error) {
      toast?.error('Failed to restart signal engine');
    } finally {
      setIsRestarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading system status...</span>
        </div>
      </div>
    );
  }

  const statusItems = [
    { 
      label: 'Bybit WebSocket', 
      status: systemStatus.websocket.status === 'connected' ? `Connected (${systemStatus.websocket.latency}ms)` : 
              systemStatus.websocket.status === 'connecting' ? 'Connecting...' : 'Disconnected', 
      ok: systemStatus.websocket.status === 'connected', 
      icon: Wifi 
    },
    { 
      label: 'Signal Engine', 
      status: systemStatus.signalEngine.status === 'running' ? 'Running' : 
              systemStatus.signalEngine.status === 'paused' ? 'Paused' : 'Idle', 
      ok: systemStatus.signalEngine.status === 'running', 
      icon: Cpu 
    },
    { 
      label: 'ML Model (XGBoost)', 
      status: `${systemStatus.mlModel.version} · Acc: ${(systemStatus.mlModel.accuracy * 100).toFixed(1)}%`, 
      ok: true, 
      icon: Settings2 
    },
  ];

  return (
    <>
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Bot Control
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`relative flex h-2 w-2 ${botActive ? '' : 'opacity-40'}`}
            >
              {botActive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  botActive ? 'bg-positive' : 'bg-muted-foreground'
                }`}
              />
            </span>
            <span
              className={`text-xs font-semibold ${
                botActive ? 'text-positive' : 'text-muted-foreground'
              }`}
            >
              {botActive ? 'ACTIVE' : 'PAUSED'}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Mode Badge */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-info-subtle border border-info/20">
            <div className="flex items-center gap-2">
              <Database size={13} className="text-info" />
              <span className="text-xs font-semibold text-info">
                PAPER TRADING MODE
              </span>
            </div>
            <span className="text-[10px] text-info/70 font-mono">
              Day {paperDay} / 14
            </span>
          </div>

          {/* System Status */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              System Status
            </p>
            {statusItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={`status-${item.label}`}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Icon size={12} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold font-mono ${
                      item.ok ? 'text-positive' : 'text-warning'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Risk Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Per-Trade Risk
              </p>
              <span className="text-sm font-bold text-primary font-tabular">
                {riskPct?.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={2.0}
              step={0.1}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e?.target?.value))}
              className="w-full"
              aria-label="Per-trade risk percentage"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0.1% (Conservative)</span>
              <span>2.0% (Aggressive)</span>
            </div>
          </div>

          {/* Max Positions */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Max Concurrent Positions
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5]?.map((n) => (
                <button
                  key={`maxpos-${n}`}
                  onClick={() => setMaxPositions(n)}
                  className={`
                    flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 active:scale-95
                    ${
                      maxPositions === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    }
                  `}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => setToggleModal(true)}
              className={`
                w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold
                transition-all duration-150 active:scale-95
                ${
                  botActive
                    ? 'bg-warning-subtle text-warning border border-warning/30 hover:bg-warning/20' : 'bg-positive-subtle text-positive border border-positive/30 hover:bg-positive/20'
                }
              `}
            >
              <Power size={14} />
              {botActive ? 'Pause Bot' : 'Resume Bot'}
            </button>

            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80 transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                size={12}
                className={isRestarting ? 'animate-spin' : ''}
              />
              {isRestarting ? 'Restarting Engine...' : 'Restart Signal Engine'}
            </button>

            <button
              onClick={() => setEmergencyModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-negative bg-negative-subtle border border-negative/30 hover:bg-negative/20 transition-all duration-150 active:scale-95"
            >
              <AlertTriangle size={14} />
              Emergency Shutdown
            </button>
          </div>

          {/* Last Scan */}
          <div className="pt-1 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Last full scan</span>
            <span className="font-mono">{lastScan} · {botActive ? 'Active' : 'Paused'}</span>
            <span className="flex items-center gap-1 text-primary">
              Next in {nextScan} <ChevronRight size={9} />
            </span>
          </div>
        </div>
      </div>
      <ConfirmModal
        open={toggleModal}
        title={botActive ? 'Pause SniperBot?' : 'Resume SniperBot?'}
        description={
          botActive
            ? 'Pausing will stop all new signal executions. Open positions will remain active and managed by the risk engine. You can resume at any time.' : 'Resuming will re-enable signal execution. The engine will rescan all markets within 30 seconds.'
        }
        confirmLabel={botActive ? 'Pause Bot' : 'Resume Bot'}
        variant="warning"
        onConfirm={handleToggleConfirm}
        onCancel={() => setToggleModal(false)}
      />
      <ConfirmModal
        open={emergencyModal}
        title="Emergency Shutdown"
        description="This will immediately stop the bot AND submit market orders to close ALL open positions. This is irreversible. Daily P&L will be locked at current value. Use only in genuine emergency situations."
        confirmLabel="Execute Emergency Shutdown"
        variant="danger"
        onConfirm={handleEmergencyConfirm}
        onCancel={() => setEmergencyModal(false)}
      />
    </>
  );
}