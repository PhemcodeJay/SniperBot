// lib/autoExecutor.ts
// Auto-execution engine for high-confidence signals

import { logger } from './logger';
import { requestManager } from './requestManager';
import {
  SharedSignal,
  appendSharedAlert,
  getSharedTradingState,
} from './tradingState';

interface ExecutionConfig {
  minConfidence: number;
  maxRiskPct: number;
  enabled: boolean;
}

class AutoExecutor {
  private isRunning = false;
  private config: ExecutionConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private executedSignals = new Set<string>();

  constructor() {
    this.config = {
      minConfidence: parseFloat(process.env.NEXT_PUBLIC_AUTO_EXECUTE_MIN_CONFIDENCE || process.env.AUTO_EXECUTE_MIN_CONFIDENCE || '0.80'),
      maxRiskPct: parseFloat(process.env.NEXT_PUBLIC_AUTO_EXECUTE_MAX_RISK_PCT || process.env.AUTO_EXECUTE_MAX_RISK_PCT || '2.0'),
      enabled: (process.env.NEXT_PUBLIC_AUTO_EXECUTE === 'true') || (process.env.AUTO_EXECUTE_ENABLED === 'true'),
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
    const intervalMs = parseInt(process.env.NEXT_PUBLIC_SIGNAL_CHECK_INTERVAL_MS || process.env.SIGNAL_CHECK_INTERVAL_MS || '1000');

    logger.info('AutoExecutor', 'Started signal monitoring', { intervalMs, config: this.config });

    this.checkInterval = setInterval(() => this.checkAndExecuteSignals(), intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('AutoExecutor', 'Stopped signal monitoring');
  }

  setConfig(config: Partial<ExecutionConfig>) {
    this.config = { ...this.config, ...config };
    logger.info('AutoExecutor', 'Configuration updated', this.config);
  }

  private async checkAndExecuteSignals() {
    if (!this.isRunning || !this.config.enabled) return;

    try {
      const state = getSharedTradingState();
      const pendingSignals = state.signals.filter(
        (sig: SharedSignal) => sig.status === 'pending' && !this.executedSignals.has(sig.id)
      );

      for (const signal of pendingSignals) {
        if (signal.confidence < this.config.minConfidence) {
          logger.debug('AutoExecutor', `Skipping signal - low confidence: ${signal.confidence}`, {
            signalId: signal.id,
            symbol: signal.symbol,
          });
          continue;
        }

        // Check risk limits
        const riskCheck = this.checkRiskLimits(signal);
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
    } catch (error) {
      logger.error(
        'AutoExecutor',
        'Error checking signals',
        { error: error instanceof Error ? error.message : String(error) },
        error as Error
      );
    }
  }

  private checkRiskLimits(signal: SharedSignal): { allowed: boolean; reason?: string } {
    const state = getSharedTradingState();

    // Check current exposure
    const currentExposure = state.metrics.riskExposure;
    const maxExposure = 100;

    if (currentExposure + this.config.maxRiskPct > maxExposure) {
      return {
        allowed: false,
        reason: `Exposure ${currentExposure}% + risk ${this.config.maxRiskPct}% exceeds max ${maxExposure}%`,
      };
    }

    // Check daily loss
    if (state.metrics.dailyPnl < -(state.balance.baseEquity * 0.05)) {
      return {
        allowed: false,
        reason: 'Daily loss limit (-5%) reached',
      };
    }

    // Check max position count
    if (state.metrics.openPositions >= 5) {
      return {
        allowed: false,
        reason: 'Max open positions (5) reached',
      };
    }

    return { allowed: true };
  }

  private async executeSignal(signal: SharedSignal) {
    try {
      logger.info('AutoExecutor', 'Executing high-confidence signal', {
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        confidence: signal.confidence,
        riskReward: signal.rr,
      });

      // Calculate position size (risk-based sizing)
      const state = getSharedTradingState();
      const accountRisk = state.balance.totalEquity * (this.config.maxRiskPct / 100);
      const priceDiff = Math.abs(signal.entryPrice - signal.sl);
      let qty = priceDiff > 0 ? accountRisk / priceDiff : 0; // qty in base asset

      // Minimum practical qty to avoid tiny orders
      const MIN_QTY = 0.0001;
      if (qty < MIN_QTY) {
        logger.warn('AutoExecutor', 'Position size too small', { signalId: signal.id, qty });
        return;
      }

      // Ensure sufficient available balance for initial margin
      const leverage = 5; // same as used when placing order
      const notional = qty * signal.entryPrice; // USD exposure
      const requiredMargin = notional / leverage;
      const available = state.balance.availableBalance || state.balance.totalEquity;

      if (requiredMargin > available) {
        // Adjust qty down to available balance (use 80% buffer)
        const adjustedQty = (available * 0.8 * leverage) / signal.entryPrice;
        if (adjustedQty < MIN_QTY) {
          logger.warn('AutoExecutor', 'Not enough available balance to open position', { signalId: signal.id, requiredMargin, available });
          return;
        }
        qty = adjustedQty;
      }

      // Execute order
      const response = await requestManager.executeWithRateLimit<any>(
        '/api/bybit/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            symbol: signal.symbol,
            side: signal.direction === 'LONG' ? 'Buy' : 'Sell',
            orderType: 'Market',
            qty: qty.toString(),
            stopLoss: signal.sl.toString(),
            takeProfit: signal.tp1.toString(),
            leverage: 5,
            timeInForce: 'GTC',
            positionIdx: 0,
            signalId: signal.id,
            confidence: signal.confidence,
          }),
        },
        { maxRetries: 2 }
      );

      if (!response.success) {
        throw new Error(response.error || 'Execution failed');
      }

      // Mark signal as executed
      this.executedSignals.add(signal.id);

      // Create success alert
      appendSharedAlert({
        id: `alert-${Date.now()}`,
        type: 'trade',
        priority: 'high',
        title: '✅ Signal Executed',
        message: `${signal.direction} ${signal.symbol} @ ${signal.entryPrice} (Confidence: ${(signal.confidence * 100).toFixed(0)}%)`,
        time: new Date().toLocaleTimeString(),
        read: false,
        timestamp: Date.now(),
        symbol: signal.symbol,
        price: signal.entryPrice,
        change24h: 0,
      });

      logger.info('AutoExecutor', 'Signal executed successfully', {
        signalId: signal.id,
        orderId: response.orderId,
        symbol: signal.symbol,
        qty,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error('AutoExecutor', 'Failed to execute signal', {
        signalId: signal.id,
        error: message,
      }, error as Error);

      // Create error alert
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
}

export const autoExecutor = new AutoExecutor();
