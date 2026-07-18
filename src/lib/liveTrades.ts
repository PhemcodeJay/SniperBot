// lib/liveTrades.ts
// Live Bybit trade records - tracks real trades with proper risk management

const LIVE_TRADES_KEY = 'live_trades';
const MAX_HISTORY = 200;

export interface LiveTradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  regime: string;
  entryTime: string;
  exitTime: string;
  duration: string;
  exitReason: string;
  slippage: number;
  entryTimestamp: number;
  exitTimestamp: number;
  status: 'open' | 'closed' | 'partial';
  leverage: number;
  liquidationPrice: number;
  source?: 'paper' | 'live' | 'bybit';
  orderId?: string;
  highestPrice?: number;
  lowestPrice?: number;
  tp1Hit?: boolean;
  breakevenSet?: boolean;
  signalId?: string;
}

export function readLiveTrades(): LiveTradeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(LIVE_TRADES_KEY);
    if (!saved) return [];
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

export function writeLiveTrades(trades: LiveTradeRecord[]) {
  if (typeof window === 'undefined') return;
  const capped = trades.slice(-MAX_HISTORY);
  window.localStorage.setItem(LIVE_TRADES_KEY, JSON.stringify(capped));
  window.dispatchEvent(new CustomEvent('bybit-trades-updated'));
}

export function addLiveTrade(trade: LiveTradeRecord): LiveTradeRecord[] {
  const trades = readLiveTrades();
  trades.unshift(trade);
  writeLiveTrades(trades);
  return trades;
}

export function updateLiveTrade(
  orderId: string,
  patch: Partial<LiveTradeRecord>
): LiveTradeRecord[] {
  const trades = readLiveTrades();
  const idx = trades.findIndex(t => t.orderId === orderId || t.id === orderId);
  if (idx !== -1) {
    trades[idx] = { ...trades[idx], ...patch };
    writeLiveTrades(trades);
  }
  return trades;
}

export function getOpenLiveTrades(): LiveTradeRecord[] {
  return readLiveTrades().filter(t => t.status === 'open');
}

export function closeLiveTrade(
  orderId: string,
  exitPrice: number,
  exitReason: string,
  closeSize?: number
): LiveTradeRecord[] {
  const trades = readLiveTrades();
  const idx = trades.findIndex(t => (t.orderId === orderId || t.id === orderId) && t.status === 'open');
  if (idx === -1) return trades;

  const trade = trades[idx];
  const closeQty = closeSize || trade.size;
  const move = trade.side === 'LONG' ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
  const pnl = move * closeQty;
  const notional = closeQty * trade.entryPrice;
  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;

  trades[idx] = {
    ...trade,
    exitPrice,
    exitTime: new Date().toLocaleString(),
    exitTimestamp: Date.now(),
    duration: `${Math.floor((Date.now() - trade.entryTimestamp) / 60000)}m`,
    exitReason,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 10) / 10,
    status: closeSize && closeSize < trade.size ? 'partial' : 'closed',
    size: closeSize ? trade.size - closeSize : trade.size,
  };

  // If full close, move to closed (already handled above by status)
  if (trades[idx].status === 'closed') {
    // Finalize
  }

  writeLiveTrades(trades);
  return trades;
}