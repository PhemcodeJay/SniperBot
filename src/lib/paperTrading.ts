// lib/paperTrading.ts
// Paper trading engine - simulates trades using live prices with proper risk management

const PAPER_STORAGE_KEY = 'sniperbot_paper_state';
const MAX_TRADES = 200;

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  duration: string;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  entryTimestamp: number;
  highestPrice?: number;  // For trailing stops
  lowestPrice?: number;   // For trailing stops
  tp1Hit?: boolean;       // Partial profit taking
  breakevenSet?: boolean; // Move SL to breakeven after TP1
}

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  exitTime: string;
  exitReason: string;
  leverage: number;
  confidence: number;
  signalId?: string;
}

export interface PaperState {
  balance: number;
  startingBalance: number;
  positions: PaperPosition[];
  closedTrades: PaperTrade[];
  totalPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  consecutiveLosses: number;
  maxDrawdown: number;
  peakBalance: number;
  lastTradeTime: number;
}

const DEFAULT_PAPER_STATE: PaperState = {
  balance: 100,
  startingBalance: 100,
  positions: [],
  closedTrades: [],
  totalPnl: 0,
  totalTrades: 0,
  wins: 0,
  losses: 0,
  consecutiveLosses: 0,
  maxDrawdown: 0,
  peakBalance: 100,
  lastTradeTime: 0,
};

export function getPaperState(): PaperState {
  if (typeof window === 'undefined') return { ...DEFAULT_PAPER_STATE };
  try {
    const saved = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PAPER_STATE };
    const parsed = JSON.parse(saved);
    return { ...DEFAULT_PAPER_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_PAPER_STATE };
  }
}

export function savePaperState(state: PaperState): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(state));
  }
}

export function resetPaperState(): PaperState {
  const fresh = { ...DEFAULT_PAPER_STATE };
  savePaperState(fresh);
  return fresh;
}

export function openPaperPosition(
  symbol: string,
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  size: number,
  leverage: number,
  stopLoss: number,
  takeProfit: number,
  confidence: number = 80
): { success: boolean; error?: string; positionId?: string } {
  const state = getPaperState();
  
  // Risk checks
  const notional = size * entryPrice;
  const requiredMargin = notional / leverage;
  
  // Check if we have enough balance (use 80% max to leave room)
  const maxAllowedMargin = state.balance * 0.8;
  if (requiredMargin > maxAllowedMargin) {
    return { success: false, error: `Insufficient paper balance. Required: $${requiredMargin.toFixed(2)}, Available: $${state.balance.toFixed(2)}` };
  }
  
  // Check max positions (scalping: max 3 open positions)
  if (state.positions.length >= 3) {
    return { success: false, error: 'Maximum 3 open positions allowed for scalping' };
  }
  
  // Check cooldown (minimum 30s between trades to overtrading)
  const now = Date.now();
  if (now - state.lastTradeTime < 30000) {
    return { success: false, error: 'Trade cooldown: wait 30s between trades' };
  }

  const position: PaperPosition = {
    id: `paper-${symbol}-${Date.now()}`,
    symbol,
    side,
    entryPrice,
    currentPrice: entryPrice,
    size,
    pnl: 0,
    pnlPct: 0,
    entryTime: new Date().toLocaleString(),
    duration: '0m',
    leverage,
    stopLoss,
    takeProfit,
    entryTimestamp: Date.now(),
    highestPrice: entryPrice,
    lowestPrice: entryPrice,
    tp1Hit: false,
    breakevenSet: false,
  };

  state.positions.push(position);
  state.balance -= requiredMargin;
  state.lastTradeTime = now;
  
  // Update peak balance
  if (state.balance > state.peakBalance) {
    state.peakBalance = state.balance;
  }
  
  savePaperState(state);
  return { success: true, positionId: position.id };
}

export function closePaperPosition(
  positionId: string,
  exitPrice: number,
  exitReason: string = 'MANUAL',
  closeSize?: number
): { success: boolean; error?: string; pnl?: number } {
  const state = getPaperState();
  const idx = state.positions.findIndex(p => p.id === positionId);
  if (idx === -1) return { success: false, error: 'Position not found' };

  const pos = state.positions[idx];
  const closeQty = closeSize || pos.size;
  const move = pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
  const pnl = move * closeQty;
  const notional = closeQty * pos.entryPrice;
  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;

  // Return margin + PnL to balance
  const marginRatio = closeQty / pos.size;
  const returnedMargin = (notional / pos.leverage) * marginRatio;
  state.balance += returnedMargin + pnl;

  // Track drawdown
  if (state.balance > state.peakBalance) {
    state.peakBalance = state.balance;
  }
  const drawdown = ((state.peakBalance - state.balance) / state.peakBalance) * 100;
  if (drawdown > state.maxDrawdown) {
    state.maxDrawdown = drawdown;
  }

  const trade: PaperTrade = {
    id: `paper-trade-${pos.id}`,
    symbol: pos.symbol,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice,
    size: closeQty,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 10) / 10,
    entryTime: pos.entryTime,
    exitTime: new Date().toLocaleString(),
    exitReason,
    leverage: pos.leverage,
    confidence: 80,
  };

  state.closedTrades.push(trade);
  state.totalPnl += trade.pnl;
  state.totalTrades++;
  
  if (trade.pnl > 0) {
    state.wins++;
    state.consecutiveLosses = 0;
  } else if (trade.pnl < 0) {
    state.losses++;
    state.consecutiveLosses++;
  }

  // Remove position if fully closed
  if (!closeSize || closeSize >= pos.size) {
    state.positions.splice(idx, 1);
  } else {
    // Partial close - reduce position size
    pos.size -= closeSize;
  }

  savePaperState(state);
  return { success: true, pnl: trade.pnl };
}

export function updatePaperPositions(tickers: Record<string, any>): void {
  const state = getPaperState();
  if (state.positions.length === 0) return;

  let changed = false;
  const toClose: Array<{ pos: PaperPosition; reason: string; price: number }> = [];

  for (const pos of state.positions) {
    const ticker = tickers[pos.symbol];
    if (!ticker) continue;

    const currentPrice = parseFloat(ticker.lastPrice);
    if (!isFinite(currentPrice) || currentPrice <= 0) continue;

    pos.currentPrice = currentPrice;
    const move = pos.side === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
    pos.pnl = Math.round(move * pos.size * 100) / 100;
    pos.pnlPct = pos.entryPrice > 0 ? Math.round((pos.pnl / (pos.entryPrice * Math.abs(pos.size))) * 1000) / 10 : 0;
    pos.duration = `${Math.floor((Date.now() - pos.entryTimestamp) / 60000)}m`;
    changed = true;

    // Update highest/lowest for trailing stops
    if (pos.side === 'LONG') {
      if (!pos.highestPrice || currentPrice > pos.highestPrice) {
        pos.highestPrice = currentPrice;
      }
      // Trailing stop for long (1% below highest)
      const trailingStop = pos.highestPrice * 0.99;
      if (pos.breakevenSet && pos.stopLoss < trailingStop) {
        pos.stopLoss = trailingStop;
      }
    } else {
      if (!pos.lowestPrice || currentPrice < pos.lowestPrice) {
        pos.lowestPrice = currentPrice;
      }
      // Trailing stop for short (1% above lowest)
      const trailingStop = pos.lowestPrice * 1.01;
      if (pos.breakevenSet && pos.stopLoss > trailingStop) {
        pos.stopLoss = trailingStop;
      }
    }

    // Check stop loss
    if (pos.side === 'LONG' && currentPrice <= pos.stopLoss) {
      toClose.push({ pos, reason: 'SL_HIT', price: pos.stopLoss });
      continue;
    } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLoss) {
      toClose.push({ pos, reason: 'SL_HIT', price: pos.stopLoss });
      continue;
    }

    // Check take profit
    if (pos.side === 'LONG' && currentPrice >= pos.takeProfit) {
      toClose.push({ pos, reason: 'TP_HIT', price: pos.takeProfit });
      continue;
    } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfit) {
      toClose.push({ pos, reason: 'TP_HIT', price: pos.takeProfit });
      continue;
    }

    // Partial TP at 50% of target (take profit halfway)
    if (!pos.tp1Hit) {
      const halfwayTP = pos.side === 'LONG'
        ? pos.entryPrice + (pos.takeProfit - pos.entryPrice) * 0.5
        : pos.entryPrice - (pos.entryPrice - pos.takeProfit) * 0.5;
      
      if ((pos.side === 'LONG' && currentPrice >= halfwayTP) || 
          (pos.side === 'SHORT' && currentPrice <= halfwayTP)) {
        // Take partial profit (50%)
        const halfSize = pos.size * 0.5;
        closePaperPosition(pos.id, currentPrice, 'TP1_PARTIAL', halfSize);
        pos.tp1Hit = true;
        pos.breakevenSet = true;
        pos.size = halfSize;
        // Move SL to breakeven
        pos.stopLoss = pos.entryPrice;
        changed = true;
      }
    }
  }

  // Close positions that hit SL/TP
  for (const { pos, reason, price } of toClose) {
    closePaperPosition(pos.id, price, reason);
  }

  if (changed) {
    savePaperState(state);
  }
}