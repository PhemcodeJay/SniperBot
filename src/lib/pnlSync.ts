// lib/pnlSync.ts
// Real-time P&L synchronization system

import { logger } from './logger';
import { requestManager } from './requestManager';
import {
  SharedTrade,
  setSharedTrades,
  setSharedBalance,
  setSharedMetrics,
  getSharedTradingState,
} from './tradingState';

interface PnLUpdate {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  liquidationPrice: number;
  leverage: number;
  markPrice: number;
  positionValue: number;
  positionIdx: number;
}

class PnLSync {
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSyncTime = 0;
  private pnlHistory: Map<string, number[]> = new Map();

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    const intervalMs = parseInt(process.env.PNL_SYNC_INTERVAL_MS || '500');

    logger.info('PnLSync', 'Starting real-time P&L synchronization', { intervalMs });

    // Initial sync
    this.sync();

    // Periodic sync
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    logger.info('PnLSync', 'Stopped real-time P&L synchronization');
  }

  private async sync() {
    if (!this.isRunning) return;

    const now = Date.now();
    if (now - this.lastSyncTime < 100) return; // Throttle to 10 updates/sec max

    this.lastSyncTime = now;

    try {
      // Fetch positions from API
      const positions = await this.fetchPositions();
      if (!positions || positions.length === 0) {
        return;
      }

      // Fetch wallet balance
      const balance = await this.fetchBalance();

      // Update shared state
      this.updateSharedState(positions, balance);

      // Calculate metrics
      const metrics = this.calculateMetrics(positions, balance);
      setSharedMetrics(metrics);

      logger.debug('PnLSync', 'P&L synchronized', {
        positions: positions.length,
        totalPnl: metrics.totalPnl,
        winRate: metrics.winRate,
      });
    } catch (error) {
      logger.error('PnLSync', 'Sync failed', { error: error instanceof Error ? error.message : String(error) }, error as Error);
    }
  }

  private async fetchPositions(): Promise<PnLUpdate[] | null> {
    try {
      const response = await requestManager.executeWithRateLimit<any>(
        '/api/bybit',
        {
          method: 'POST',
          body: JSON.stringify({
            endpoint: '/v5/position/list',
            method: 'GET',
          }),
        },
        { maxRetries: 2 }
      );

      if (response.retCode !== 0 || !response.result?.list) {
        return null;
      }

      return response.result.list
        .filter((pos: any) => pos.size !== '0' && pos.side !== 'None')
        .map((pos: any) => ({
          symbol: pos.symbol,
          side: pos.side === 'Buy' ? 'long' : 'short',
          size: Math.abs(parseFloat(pos.size)),
          entryPrice: parseFloat(pos.avgPrice || pos.entryPrice),
          currentPrice: parseFloat(pos.markPrice),
          unrealizedPnl: parseFloat(pos.unrealisedPnl),
          unrealizedPct:
            parseFloat(pos.avgPrice) > 0
              ? (parseFloat(pos.unrealisedPnl) / (parseFloat(pos.avgPrice) * Math.abs(parseFloat(pos.size)))) * 100
              : 0,
          liquidationPrice: parseFloat(pos.liquidationPrice),
          leverage: parseFloat(pos.leverage),
          markPrice: parseFloat(pos.markPrice),
          positionValue: parseFloat(pos.positionValue),
          positionIdx: parseInt(pos.positionIdx),
        }));
    } catch (error) {
      logger.warn('PnLSync', 'Failed to fetch positions', { error });
      return null;
    }
  }

  private async fetchBalance(): Promise<{ equity: number; available: number } | null> {
    try {
      const response = await requestManager.executeWithRateLimit<any>(
        '/api/bybit',
        {
          method: 'POST',
          body: JSON.stringify({
            endpoint: '/v5/account/wallet-balance',
            method: 'GET',
          }),
        },
        { maxRetries: 2 }
      );

      if (response.retCode !== 0 || !response.result?.list?.[0]) {
        return null;
      }

      const wallet = response.result.list[0];
      return {
        equity: parseFloat(wallet.totalEquity),
        available: parseFloat(wallet.totalAvailableBalance),
      };
    } catch (error) {
      logger.warn('PnLSync', 'Failed to fetch balance', { error });
      return null;
    }
  }

  private updateSharedState(positions: PnLUpdate[], balance: any) {
    // Update balance
    if (balance) {
      setSharedBalance({
        totalEquity: balance.equity,
        availableBalance: balance.available,
        lastUpdated: Date.now(),
      });
    }

    // Convert to shared trades
    const trades: SharedTrade[] = positions.map(pos => ({
      id: `${pos.symbol}-${pos.positionIdx}`,
      symbol: pos.symbol,
      side: pos.side.toUpperCase() as 'LONG' | 'SHORT',
      entryPrice: Math.round(pos.entryPrice * 10000) / 10000,
      exitPrice: pos.currentPrice,
      size: pos.size,
      pnl: Math.round(pos.unrealizedPnl * 100) / 100,
      pnlPct: Math.round(pos.unrealizedPct * 100) / 100,
      confidence: 0.85, // Will be set by signal engine
      entryTime: new Date().toISOString(),
      status: 'open',
      leverage: pos.leverage,
      liquidationPrice: pos.liquidationPrice,
      orderId: `pos-${pos.positionIdx}`,
      createdAt: Date.now(),
      source: 'live',
    }));

    setSharedTrades('live', trades);
  }

  private calculateMetrics(positions: PnLUpdate[], balance: any) {
    const totalPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    const totalValue = balance?.equity || 1;
    const totalPnlPct = (totalPnl / (totalValue - totalPnl)) * 100;

    return {
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPct: Math.round(totalPnlPct * 100) / 100,
      dailyPnl: Math.round(totalPnl * 100) / 100, // TODO: Calculate properly
      dailyPnlPct: Math.round(totalPnlPct * 100) / 100,
      openPositions: positions.length,
      totalTrades: 0, // TODO: Fetch from trade history
      winRate: 0,
      maxDrawdown: 0,
      riskExposure: (positions.reduce((sum, pos) => sum + pos.positionValue, 0) / (balance?.equity || 1)) * 100,
    };
  }
}

export const pnlSync = new PnLSync();
