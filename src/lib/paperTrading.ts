// lib/paperTrading.ts
// Paper trading engine - simulates trades using live prices without real Bybit orders

const PAPER_STORAGE_KEY = 'sniperbot_paper_state';

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
};

export function getPaperState(): PaperState {
  if (typeof window === 'undefined') return { ...DEFAULT_PAPER_STATE };
  try {
    const saved = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PAPER_STATE };
    return JSON.parse(saved);
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
  takeProfit: number
): { success: boolean; error?: string } {
  const state = getPaperState();
  const notional = size * entryPrice;
  const requiredMargin = notional / leverage;

  if (requiredMargin > state.balance) {
    return { success: false, error: 'Insufficient paper balance' };
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
  };

  state.positions.push(position);
  state.balance -= requiredMargin;
  savePaperState(state);
  return { success: true };
}

export function closePaperPosition(
  positionId: string,
  exitPrice: number,
  exitReason: string = 'MANUAL'
): { success: boolean; error?: string } {
  const state = getPaperState();
  const idx = state.positions.findIndex(p => p.id === positionId);
  if (idx === -1) return { success: false, error: 'Position not found' };

  const pos = state.positions[idx];
  const move = pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
  const pnl = move * pos.size;
  const pnlPct = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * Math.abs(pos.size))) * 100 : 0;

  // Return margin + PnL to balance
  const notional = pos.size * pos.entryPrice;
  const returnedMargin = notional / pos.leverage;
  state.balance += returnedMargin + pnl;

  const trade: PaperTrade = {
    id: `paper-trade-${pos.id}`,
    symbol: pos.symbol,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice,
    size: pos.size,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 10) / 10,
    entryTime: pos.entryTime,
    exitTime: new Date().toLocaleString(),
    exitReason,
    leverage: pos.leverage,
    confidence: 80,
  };

  state.closedTrades.push(trade);
  state.positions.splice(idx, 1);
  state.totalPnl += trade.pnl;
  state.totalTrades++;
  if (trade.pnl > 0) state.wins++;
  else if (trade.pnl < 0) state.losses++;

  savePaperState(state);
  return { success: true };
}

export function updatePaperPositions(tickers: Record<string, any>): void {
  const state = getPaperState();
  if (state.positions.length === 0) return;

  let changed = false;
  for (const pos of state.positions) {
    const ticker = tickers[pos.symbol];
    if (!ticker) continue;

    const currentPrice = parseFloat(ticker.lastPrice);
    if (!isNaN(currentPrice) && currentPrice > 0) {
      pos.currentPrice = currentPrice;
      const move = pos.side === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
      pos.pnl = Math.round(move * pos.size * 100) / 100;
      pos.pnlPct = pos.entryPrice > 0 ? Math.round((pos.pnl / (pos.entryPrice * Math.abs(pos.size))) * 1000) / 10 : 0;
      pos.duration = `${Math.floor((Date.now() - pos.entryTimestamp) / 60000)}m`;
      changed = true;

      // Check stop loss
      if (pos.side === 'LONG' && currentPrice <= pos.stopLoss) {
        closePaperPosition(pos.id, pos.stopLoss, 'SL_HIT');
        changed = true;
      } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLoss) {
        closePaperPosition(pos.id, pos.stopLoss, 'SL_HIT');
        changed = true;
      }
      // Check take profit
      else if (pos.side === 'LONG' && currentPrice >= pos.takeProfit) {
        closePaperPosition(pos.id, pos.takeProfit, 'TP_HIT');
        changed = true;
      } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfit) {
        closePaperPosition(pos.id, pos.takeProfit, 'TP_HIT');
        changed = true;
      }
    }
  }

  if (changed) {
    savePaperState(state);
  }
}