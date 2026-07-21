// lib/realtimeManager.ts
// Singleton manager to centralize WebSocket and polling for realtime Bybit data
// OPTIMIZED: reduced polling frequency, better WS reconnection, memory management

import { requestManager } from '@/lib/requestManager';
import { BYBIT_WS_URL } from '@/lib/bybit';
import { logger } from '@/lib/logger';

type DataCallback = (data: any) => void;
type TickCallback = (tick: any) => void;

class RealtimeManager {
  private static _instance: RealtimeManager | null = null;
  private dataSubscribers = new Set<DataCallback>();
  private tickSubscribers = new Set<TickCallback>();
  private pollInterval = 30000; // 30s to reduce Bybit API spam (was 2000ms)
  private pollTimer: NodeJS.Timeout | null = null;
  private ws: WebSocket | null = null;
  private wsHeartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isStarted = false;
  private lastPayload: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  static get instance() {
    if (!RealtimeManager._instance) RealtimeManager._instance = new RealtimeManager();
    return RealtimeManager._instance;
  }

  subscribeData(cb: DataCallback) {
    this.dataSubscribers.add(cb);
    this.ensureRunning();
    return () => {
      this.dataSubscribers.delete(cb);
      this.maybeStop();
    };
  }

  subscribeTicks(cb: TickCallback) {
    this.tickSubscribers.add(cb);
    this.ensureRunning();
    return () => {
      this.tickSubscribers.delete(cb);
      this.maybeStop();
    };
  }

  async fetchOnce() {
    try {
      const [wallet, positions] = await Promise.allSettled([
        requestManager.executeWithRateLimit<any>('/api/bybit', {
          method: 'POST',
          body: JSON.stringify({ endpoint: '/v5/account/wallet-balance', method: 'GET' }),
        }),
        requestManager.executeWithRateLimit<any>('/api/bybit', {
          method: 'POST',
          body: JSON.stringify({ endpoint: '/v5/position/list', method: 'GET' }),
        }),
      ]);

      const data = {
        wallet: wallet.status === 'fulfilled' ? wallet.value : null,
        positions: positions.status === 'fulfilled' ? positions.value : null,
        lastUpdate: Date.now(),
      };

      // Memory optimization: only emit if data actually changed
      const payloadStr = JSON.stringify(data);
      if (payloadStr !== this.lastPayload) {
        this.lastPayload = payloadStr;
        this.emitData(data);
      }
    } catch (err) {
      // Silent fail to reduce log spam
    }
  }

  private emitData(data: any) {
    for (const cb of Array.from(this.dataSubscribers)) {
      try { cb(data); } catch (e) { /* swallow */ }
    }
  }

  private emitTick(tick: any) {
    for (const cb of Array.from(this.tickSubscribers)) {
      try { cb(tick); } catch (e) { /* swallow */ }
    }
  }

  private ensureRunning() {
    if (this.isStarted) return;
    if (this.dataSubscribers.size === 0 && this.tickSubscribers.size === 0) return;
    this.start();
  }

  private maybeStop() {
    if (this.dataSubscribers.size === 0 && this.tickSubscribers.size === 0) {
      this.stop();
    }
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;
    this.reconnectAttempts = 0;
    // Start polling at configured interval
    this.pollTimer = setInterval(() => this.fetchOnce(), this.pollInterval);
    // Do an immediate fetch
    this.fetchOnce().catch(() => {});
    // Try to open WebSocket for ticks
    this.connectWebSocket();
  }

  stop() {
    this.isStarted = false;
    this.reconnectAttempts = 0;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.wsHeartbeat) {
      clearInterval(this.wsHeartbeat);
      this.wsHeartbeat = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  private connectWebSocket() {
    try {
      if (typeof window === 'undefined') return;
      if (this.ws) return;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.warn('RealtimeManager', 'Max WS reconnect attempts reached, switching to polling only');
        return;
      }
      
      this.ws = new WebSocket(BYBIT_WS_URL);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0; // Reset on successful connection
        if (this.wsHeartbeat) clearInterval(this.wsHeartbeat);
        this.wsHeartbeat = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN)
            this.ws.send(JSON.stringify({ op: 'ping' }));
        }, 30000);
        
        // Subscribe to ticker topics
        const symbols = [
          'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
          'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
          'MATICUSDT', 'LTCUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT',
        ];
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            op: 'subscribe',
            args: symbols.map((s) => `tickers.${s}`),
          }));
        }
      };
      
      this.ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data as string);
          if (payload?.topic && payload.topic.startsWith('tickers')) {
            this.emitTick(payload.data || payload);
          }
        } catch (e) { /* ignore */ }
      };
      
      this.ws.onclose = () => {
        this.ws = null;
        if (this.wsHeartbeat) {
          clearInterval(this.wsHeartbeat);
          this.wsHeartbeat = null;
        }
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        // Exponential backoff: 5s, 10s, 20s, 40s...
        const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
      };
      
      this.ws.onerror = () => {
        // Silent error to reduce log spam
      };
    } catch (err) {
      // Silent fail
    }
  }

  triggerRefresh() {
    this.fetchOnce().catch(() => {});
  }

  isWsConnected() {
    try {
      return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
    } catch (e) {
      return false;
    }
  }
}

export const realtimeManager = RealtimeManager.instance;