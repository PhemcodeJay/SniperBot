// lib/autoExecutor.ts
// Auto-execution engine for high-confidence signals - optimized for scalping
// FIXED: confidence range handling, signal freshness, performance

import { logger } from './logger';
import {
  SharedSignal,
  appendSharedAlert,
  getSharedTradingState,
} from './tradingState';
import {
  openPaperPosition,
  closePaperPosition,
  getPaperState,
  updatePaperPositions,
} from './paperTrading';
import {
  addLiveTrade,
  type LiveTradeRecord,
} from './liveTrades';
import { BYBIT_BASE_URL } from './bybit';
import { requestManager } from './requestManager';

// Whitelist of supported symbols to prevent injection attacks
const SUPPORTED_SYMBOLS = new Set([
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'MATICUSDT', 'LTCUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT',
]);

interface ExecutionConfig {
  minConfidence: number; // 0-100 scale
  maxRiskPct: number;
  enabled: boolean;
  mode: 'paper' | 'live';
  leverage: number;
}

class AutoExecutor {
  private isRunning = false;
  private config: ExecutionConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private executedSignals = new Set<string>();
  private lastCheckTime = 0;
  private lossCooldownUntil = 0;

  constructor() {
    this.config = {
      minConfidence: 75, // 0-100 scale, default 75%
      maxRiskPct: 1.5,
      enabled: false,
      mode: 'paper',
      leverage: 5,
    };

    logger.info('AutoExecutor', 'Initialized', this.config);
  }

  start() {
    if (this.isRunning) return;

    if (!this.config.enabled) {
      logger.info('AutoExecutor', 'Auto-executor is disabled by configuration; not starting');
      return;
    }

    this.isRunning = true;
    // Faster interval for scalping - 1000ms to avoid excessive API calls
    const intervalMs = 1000;

    logger.info('AutoExecutor', 'Started signal monitoring', { intervalMs, config: this.config });

    this.checkInterval = setInterval(() => this.checkAndExecuteSignals(), intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    this.executedSignals.clear();
    logger.info('AutoExecutor', 'Stopped signal monitoring');
  }

  setConfig(config: Partial<ExecutionConfig>) {
    this.config = { ...this.config, ...config };
    logger.info('AutoExecutor', 'Configuration updated', this.config);
  }

  getMode() {
    return this.config.mode;
  }

  setMode(mode: 'paper' | 'live') {
    this.config.mode = mode;
    logger.info('AutoExecutor', 'Mode changed', { mode });
  }

  private async checkAndExecuteSignals() {
    if (!this.isRunning || !this.config.enabled) return;

    // Rate limit checks
    const now = Date.now();
    if (now - this.lastCheckTime < 500) return; // Max 2 checks per second
    this.lastCheckTime = now;

    // Check if we're in loss cooldown
    if (now < this.lossCooldownUntil) {
      return;
    }

    try {
      const state = getSharedTradingState();

      // Get pending/live signals that haven't been executed yet
      const pendingSignals = state.signals.filter(
        (sig: SharedSignal) => 
          (sig.status === 'pending' || sig.status === 'live') && 
          !this.executedSignals.has(sig.id)
      );

      if (pendingSignals.length === 0) return;

      for (const signal of pendingSignals) {
        // FIXED: signal.confidence is already 0-100, not 0-1
        if (signal.confidence < this.config.minConfidence) {
          logger.debug('AutoExecutor', `Signal ${signal.id} confidence ${signal.confidence}% < min ${this.config.minConfidence}%`);
          continue;
        }

        // Check risk limits
        const riskCheck = this.checkRiskLimits(signal, state);
        if (!riskCheck.allowed) {
          logger.warn('AutoExecutor', `Risk check failed: ${riskCheck.reason}`, {
            signalId: signal.id,
            symbol: signal.symbol,
          });

          appendSharedAlert({
            id: `alert-${Date.now()}`,
            type: 'risk',
            priority: 'high',
            title: 'Risk Limit Exceeded',
            message: riskCheck.reason || 'Signal execution blocked due to risk limits',
            time: new Date().toLocaleTimeString(),
            read: false,
            timestamp: Date.now(),
            symbol: signal.symbol,
          });

          continue;
        }

        // Execute the signal
        await this.executeSignal(signal);
      }

      // Update paper positions periodically (every 10 checks)
      if (this.config.mode === 'paper' && Math.random() < 0.1) {
        try {
          const symbols = Array.from(SUPPORTED_SYMBOLS);
          const results = await Promise.allSettled(
            symbols.map((sym) =>
              fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${sym}`, {
                signal: AbortSignal.timeout(3000),
              }).then(r => r.json()).catch(() => null)
            )
          );
          const tickers: Record<string, any> = {};
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value?.retCode === 0 && result.value?.result?.list?.[0]) {
              const t = result.value.result.list[0];
              tickers[t.symbol] = t;
            }
          });
          updatePaperPositions(tickers);
        } catch { /* silent */ }
      }
    } catch (error) {
      logger.error('AutoExecutor', 'Error checking signals', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private checkRiskLimits(signal: SharedSignal, state: any): { allowed: boolean; reason?: string } {
    // Check current exposure
    const currentExposure = state.metrics.riskExposure || 0;
    const maxExposure = 15;

    if (currentExposure + this.config.maxRiskPct > maxExposure) {
      return {
        allowed: false,
        reason: `Exposure ${currentExposure.toFixed(1)}% + risk ${this.config.maxRiskPct}% exceeds max ${maxExposure}%`,
      };
    }

    // Check daily loss
    const dailyLossPct = state.metrics.dailyPnlPct || 0;
    if (dailyLossPct < -3) {
      return {
        allowed: false,
        reason: `Daily loss limit (-3%) reached: ${dailyLossPct.toFixed(2)}%`,
      };
    }

    // Check max position count (scalping: max 3)
    if (state.metrics.openPositions >= 3) {
      return {
        allowed: false,
        reason: 'Max open positions (3) reached for scalping',
      };
    }

    // Check consecutive losses
    if (this.config.mode === 'paper') {
      const paperState = getPaperState();
      if (paperState.consecutiveLosses >= 3) {
        return {
          allowed: false,
          reason: 'Too many consecutive losses (3) - taking a break',
        };
      }
    }

    return { allowed: true };
  }

  private async executeSignal(signal: SharedSignal) {
    try {
      // Validate symbol against whitelist
      if (!SUPPORTED_SYMBOLS.has(signal.symbol)) {
        throw new Error(`Unsupported symbol: ${signal.symbol}`);
      }

      logger.info('AutoExecutor', 'Executing signal', {
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        confidence: `${signal.confidence}%`,
      });

      // Get current price from a quick ticker fetch
      let currentPrice = signal.entryPrice;
      try {
        const resp = await fetch(`${BYBIT_BASE_URL}/v5/market/tickers?category=linear&symbol=${signal.symbol}`, {
          signal: AbortSignal.timeout(3000),
        });
        const data = await resp.json();
        if (data?.retCode === 0 && data?.result?.list?.[0]) {
          currentPrice = parseFloat(data.result.list[0].lastPrice) || currentPrice;
        }
      } catch { /* use signal entry price */ }

      if (!isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error(`Invalid price for ${signal.symbol}: ${currentPrice}`);
      }

      // Calculate position size with risk-based sizing
      const state = getSharedTradingState();
      const accountRisk = state.balance.totalEquity * (this.config.maxRiskPct / 100);
      const priceDiff = Math.abs(signal.entryPrice - signal.sl);
      let qty = priceDiff > 0 ? accountRisk / priceDiff : 0;

      // Apply leverage
      qty = qty * this.config.leverage;

      // Minimum practical qty
      const MIN_QTY = 0.001;
      if (qty < MIN_QTY) {
        qty = MIN_QTY;
      }

      // Normalize quantity to exchange requirements
      const normalizedQty = await this.normalizeQty(signal.symbol, qty);
      if (!normalizedQty || normalizedQty <= 0) {
        logger.warn('AutoExecutor', 'Invalid normalized quantity', { signalId: signal.id, qty });
        return;
      }

      const sl = signal.sl;
      const tp = signal.tp1;
      const leverage = this.config.leverage;

      if (this.config.mode === 'paper') {
        const result = openPaperPosition(
          signal.symbol,
          signal.direction,
          currentPrice,
          normalizedQty,
          leverage,
          sl,
          tp,
          signal.confidence
        );

        if (result.success) {
          this.executedSignals.add(signal.id);

          appendSharedAlert({
            id: `alert-${Date.now()}`,
            type: 'trade',
            priority: 'high',
            title: '📄 Paper Trade Executed',
            message: `${signal.direction} ${signal.symbol} @ $${currentPrice.toFixed(2)} (Confidence: ${signal.confidence}%)`,
            time: new Date().toLocaleTimeString(),
            read: false,
            timestamp: Date.now(),
            symbol: signal.symbol,
            price: currentPrice,
          });

          logger.info('AutoExecutor', 'Paper trade executed', {
            signalId: signal.id,
            positionId: result.positionId,
            symbol: signal.symbol,
            qty: normalizedQty,
          });
        } else {
          throw new Error(result.error || 'Paper trade failed');
        }
       } else {
         // Live trading execution - use secure server-side API proxy
         const orderResult = await this.executeLiveOrder({
           symbol: signal.symbol,
           side: signal.direction,
           qty: normalizedQty,
           leverage,
           stopLoss: sl,
           takeProfit: tp,
           confidence: signal.confidence,
           signalId: signal.id,
         });

        if (orderResult.success) {
          this.executedSignals.add(signal.id);

          // Record the trade
          const trade: LiveTradeRecord = {
            id: `live-${Date.now()}`,
            symbol: signal.symbol,
            side: signal.direction,
            entryPrice: currentPrice,
            exitPrice: 0,
            size: normalizedQty,
            pnl: 0,
            pnlPct: 0,
            confidence: signal.confidence,
            regime: signal.regime || 'unknown',
            entryTime: new Date().toLocaleString(),
            exitTime: '',
            duration: '0m',
            exitReason: '',
            slippage: 0,
            entryTimestamp: Date.now(),
            exitTimestamp: 0,
            status: 'open',
            leverage,
            liquidationPrice: leverage > 0 ? currentPrice * (1 - 1 / leverage) : 0,
            orderId: orderResult.orderId,
            source: 'live',
            highestPrice: currentPrice,
            lowestPrice: currentPrice,
            signalId: signal.id,
          };

          addLiveTrade(trade);

          appendSharedAlert({
            id: `alert-${Date.now()}`,
            type: 'trade',
            priority: 'high',
            title: '✅ Live Trade Executed',
            message: `${signal.direction} ${signal.symbol} @ $${currentPrice.toFixed(2)} (Confidence: ${signal.confidence}%)`,
            time: new Date().toLocaleTimeString(),
            read: false,
            timestamp: Date.now(),
            symbol: signal.symbol,
            price: currentPrice,
          });

          logger.info('AutoExecutor', 'Live trade executed', {
            signalId: signal.id,
            orderId: orderResult.orderId,
            symbol: signal.symbol,
            qty: normalizedQty,
          });
        } else {
          throw new Error(orderResult.error || 'Order execution failed');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error('AutoExecutor', 'Failed to execute signal', {
        signalId: signal.id,
        error: message,
      });

      appendSharedAlert({
        id: `alert-${Date.now()}`,
        type: 'system',
        priority: 'high',
        title: '⚠️ Execution Failed',
        message: `Failed to execute ${signal.symbol} signal: ${message}`,
        time: new Date().toLocaleTimeString(),
        read: false,
        timestamp: Date.now(),
        symbol: signal.symbol,
      });
    }
  }

  private async executeLiveOrder(params: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    qty: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
    confidence: number;
    signalId: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const response = await requestManager.executeWithRateLimit<any>('/api/bybit/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: params.symbol,
          side: params.side === 'LONG' ? 'Buy' : 'Sell',
          orderType: 'Market',
          qty: params.qty.toString(),
          leverage: params.leverage,
          stopLoss: params.stopLoss?.toString(),
          takeProfit: params.takeProfit?.toString(),
          confidence: params.confidence,
          signalId: params.signalId,
        }),
      });

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Order execution failed',
      };
    }
  }

  private async normalizeQty(symbol: string, qty: number): Promise<number> {
    try {
      const url = `${BYBIT_BASE_URL}/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const data = await resp.json();

      if (data?.retCode === 0 && data?.result?.list?.[0]) {
        const info = data.result.list[0];
        const lot = info.lotSizeFilter || info.lot_size_filter || info.sizeFilter || info.size_filter || {};
        const minOrderQty = parseFloat(lot.minOrderQty || lot.min_qty || lot.min || '0') || 0;
        const qtyStep = parseFloat(lot.qtyStep || lot.stepSize || lot.qty_step || lot.step || '0') || 0;

        let normalizedQty = qty;

        if (qtyStep > 0) {
          normalizedQty = Math.floor(qty / qtyStep) * qtyStep;
          if (normalizedQty < qtyStep) normalizedQty = qtyStep;
        }

        if (minOrderQty > 0 && normalizedQty < minOrderQty) {
          normalizedQty = minOrderQty;
        }

        return parseFloat(normalizedQty.toFixed(8));
      }

      return parseFloat(qty.toFixed(8));
    } catch (error) {
      logger.warn('AutoExecutor', 'Failed to normalize qty', { symbol, qty, error });
      return parseFloat(qty.toFixed(8));
    }
  }
}

export const autoExecutor = new AutoExecutor();
