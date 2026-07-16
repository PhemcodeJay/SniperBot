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
}

const LIVE_TRADES_KEY = 'live_trades';

export function readLiveTrades(): LiveTradeRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    return JSON.parse(window.localStorage.getItem(LIVE_TRADES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function writeLiveTrades(trades: LiveTradeRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LIVE_TRADES_KEY, JSON.stringify(trades));
  window.dispatchEvent(new CustomEvent('bybit-trades-updated'));
}
