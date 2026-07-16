// lib/realtimeManager.ts
// Singleton manager to centralize WebSocket and polling for realtime Bybit data

import { requestManager } from '@/lib/requestManager';
import { BYBIT_WS_URL } from '@/lib/bybit';
import { logger } from '@/lib/logger';

type DataCallback = (data: any) => void;
type TickCallback = (tick: any) => void;

class RealtimeManager {
  private static _instance: RealtimeManager | null = null;
  private dataSubscribers = new Set<DataCallback>();
  private tickSubscribers = new Set<TickCallback>();
  private pollInterval = 2000;
  private pollTimer: NodeJS.Timeout | null = null;
  private ws: WebSocket | null = null;
  private wsHeartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isStarted = false;

  static get instance() {
    if (!RealtimeManager._instance) RealtimeManager._instance = new RealtimeManager();
    return RealtimeManager._instance;
  }

  subscribeData(cb: DataCallback) {
    this.dataSubscribers.add(cb);
    this.ensureRunning();
    return () => { this.dataSubscribers.delete(cb); this.maybeStop(); };
  }

  subscribeTicks(cb: TickCallback) {
    this.tickSubscribers.add(cb);
    this.ensureRunning();
    return () => { this.tickSubscribers.delete(cb); this.maybeStop(); };
  }

  async fetchOnce() {
    try {
      const [wallet, positions, orders] = await Promise.allSettled([
        requestManager.executeWithRateLimit<any>('/api/bybit', { method: 'POST', body: JSON.stringify({ endpoint: '/v5/account/wallet-balance', method: 'GET' }) }),
        requestManager.executeWithRateLimit<any>('/api/bybit', { method: 'POST', body: JSON.stringify({ endpoint: '/v5/position/list', method: 'GET' }) }),
        requestManager.executeWithRateLimit<any>('/api/bybit', { method: 'POST', body: JSON.stringify({ endpoint: '/v5/order/realtime', method: 'GET' }) }),
      ]);

      const data = {
        wallet: wallet.status === 'fulfilled' ? wallet.value : null,
        positions: positions.status === 'fulfilled' ? positions.value : null,
        orders: orders.status === 'fulfilled' ? orders.value : null,
        lastUpdate: Date.now(),
      };

      this.emitData(data);
    } catch (err) {
      logger.error('RealtimeManager', 'fetchOnce failed', { error: (err as Error).message });
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
    // Start polling
    this.pollTimer = setInterval(() => this.fetchOnce(), this.pollInterval);
    // Do an immediate fetch
    this.fetchOnce().catch(() => {});
    // Try to open WebSocket for ticks
    this.connectWebSocket();
    logger.info('RealtimeManager', 'started');
  }

  stop() {
    this.isStarted = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.wsHeartbeat) { clearInterval(this.wsHeartbeat); this.wsHeartbeat = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    logger.info('RealtimeManager', 'stopped');
  }

  private connectWebSocket() {
    try {
      if (typeof window === 'undefined') return;
      if (this.ws) return;
      console.debug('[RealtimeManager] connectWebSocket: opening connection');
      this.ws = new WebSocket(BYBIT_WS_URL);
      this.ws.onopen = () => {
        logger.info('RealtimeManager', 'ws open');
        console.debug('[RealtimeManager] ws open');
        // Do not auto-subscribe to symbols here; consumers decide via server-side REST or manager polling.
        if (this.wsHeartbeat) clearInterval(this.wsHeartbeat);
        this.wsHeartbeat = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 'ping' }));
        }, 30000);
      };
      this.ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data as string);
          if (payload?.topic && payload.topic.startsWith('tickers')) {
            this.emitTick(payload.data || payload);
            console.debug('[RealtimeManager] received tick', payload?.topic);
          }
        } catch (e) {
          // ignore
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        if (this.wsHeartbeat) { clearInterval(this.wsHeartbeat); this.wsHeartbeat = null; }
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
        console.debug('[RealtimeManager] ws closed, scheduled reconnect');
      };
      this.ws.onerror = (event: Event) => {
        const errorMsg = event instanceof ErrorEvent ? event.message : 'WebSocket connection error (check network/CORS)';
        logger.error('RealtimeManager', 'WebSocket error', { error: errorMsg, state: this.ws?.readyState });
        console.debug('[RealtimeManager] ws error:', errorMsg);
      };
    } catch (err) {
      logger.error('RealtimeManager', 'connectWebSocket failed', { error: (err as Error).message });
    }
  }

  // Allow consumers to request an immediate refresh
  triggerRefresh() {
    console.debug('[RealtimeManager] triggerRefresh called');
    this.fetchOnce().catch(() => {});
  }

  // Expose WS connection state for health checks
  isWsConnected() {
    try {
      return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
    } catch (e) {
      return false;
    }
  }
}

export const realtimeManager = RealtimeManager.instance;
