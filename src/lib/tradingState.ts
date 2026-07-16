export type SharedTradeSource = 'paper' | 'live' | 'bybit';

export interface SharedTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  regime?: string;
  entryTime: string;
  exitTime?: string;
  duration?: string;
  exitReason?: string;
  slippage?: number;
  entryTimestamp?: number;
  exitTimestamp?: number;
  status: 'open' | 'closed' | 'partial';
  leverage: number;
  liquidationPrice?: number;
  orderId?: string;
  tradeType?: 'market' | 'limit';
  positionIdx?: number;
  source?: SharedTradeSource;
  createdAt?: number;
}

export interface SharedSignal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  rr: number;
  timeframe: string;
  status: 'pending' | 'live' | 'rejected' | 'executed';
  generatedAt: string;
  change24h: number;
  volume: number;
  regime: string;
  signalSource: 'ml' | 'technical' | 'hybrid';
  timestamp?: number;
}

export interface SharedAlert {
  id: string;
  type: 'signal' | 'trade' | 'risk' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  time: string;
  read: boolean;
  timestamp: number;
  symbol?: string;
  price?: number;
  change24h?: number;
}

export interface SharedBotState {
  isRunning: boolean;
  mode: 'paper' | 'live';
  status: 'idle' | 'scanning' | 'trading' | 'error';
  lastAction: string;
  lastActionTime: string;
  uptime: string;
  autoTradingEnabled: boolean;
  isConnected: boolean;
}

export interface SharedMetrics {
  totalPnl: number;
  totalPnlPct: number;
  dailyPnl: number;
  dailyPnlPct: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  riskExposure: number;
}

export function calculateLivePnl(entryPrice: number, currentPrice: number, size: number, side: 'LONG' | 'SHORT' | 'long' | 'short') {
  const normalizedSide = side.toUpperCase() as 'LONG' | 'SHORT';
  const move = normalizedSide === 'LONG' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnl = move * size;
  const pnlPct = entryPrice > 0 ? (pnl / (entryPrice * Math.abs(size))) * 100 : 0;

  return {
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 10) / 10,
  };
}

export interface SharedBalance {
  totalEquity: number;
  availableBalance: number;
  baseEquity: number;
  lastUpdated: number;
}

export interface SharedTradingState {
  version: number;
  trades: {
    paper: SharedTrade[];
    live: SharedTrade[];
  };
  balance: SharedBalance;
  metrics: SharedMetrics;
  signals: SharedSignal[];
  alerts: SharedAlert[];
  bot: SharedBotState;
  lastUpdated: number;
}

const STORAGE_KEY = 'sniperbot_shared_state';
const listeners = new Set<(state: SharedTradingState) => void>();

const defaultBotState: SharedBotState = {
  isRunning: false,
  mode: 'live',
  status: 'idle',
  lastAction: 'Waiting...',
  lastActionTime: '',
  uptime: '0h 0m',
  autoTradingEnabled: true,
  isConnected: false,
};

const defaultMetrics: SharedMetrics = {
  totalPnl: 0,
  totalPnlPct: 0,
  dailyPnl: 0,
  dailyPnlPct: 0,
  openPositions: 0,
  totalTrades: 0,
  winRate: 0,
  maxDrawdown: 0,
  riskExposure: 0,
};

const defaultBalance: SharedBalance = {
  totalEquity: 100,
  availableBalance: 100,
  baseEquity: 100,
  lastUpdated: Date.now(),
};

const buildDefaultState = (): SharedTradingState => ({
  version: 1,
  trades: { paper: [], live: [] },
  balance: defaultBalance,
  metrics: defaultMetrics,
  signals: [],
  alerts: [],
  bot: defaultBotState,
  lastUpdated: Date.now(),
});

export function getSharedTradingState(): SharedTradingState {
  if (typeof window === 'undefined') {
    return buildDefaultState();
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return buildDefaultState();
    }

    const parsed = JSON.parse(saved) as Partial<SharedTradingState>;
    return {
      ...buildDefaultState(),
      ...parsed,
      trades: {
        paper: parsed?.trades?.paper ?? [],
        live: parsed?.trades?.live ?? [],
      },
      balance: { ...defaultBalance, ...(parsed?.balance ?? {}) },
      metrics: { ...defaultMetrics, ...(parsed?.metrics ?? {}) },
      signals: parsed?.signals ?? [],
      alerts: parsed?.alerts ?? [],
      bot: { ...defaultBotState, ...(parsed?.bot ?? {}) },
      lastUpdated: parsed?.lastUpdated ?? Date.now(),
    };
  } catch {
    return buildDefaultState();
  }
}

function emitSharedState(state: SharedTradingState) {
  listeners.forEach((listener) => listener(state));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sniperbot-shared-state-updated', { detail: state }));
  }
}

function persistSharedState(state: SharedTradingState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function syncSharedTradingState(patch: Partial<SharedTradingState>): SharedTradingState {
  const next: SharedTradingState = {
    ...getSharedTradingState(),
    ...patch,
    trades: {
      paper: patch?.trades?.paper ?? getSharedTradingState().trades.paper,
      live: patch?.trades?.live ?? getSharedTradingState().trades.live,
    },
    balance: { ...getSharedTradingState().balance, ...(patch?.balance ?? {}) },
    metrics: { ...getSharedTradingState().metrics, ...(patch?.metrics ?? {}) },
    bot: { ...getSharedTradingState().bot, ...(patch?.bot ?? {}) },
    lastUpdated: Date.now(),
  };

  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function setSharedTrades(source: 'paper' | 'live', trades: SharedTrade[]) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    trades: {
      ...state.trades,
      [source]: trades,
    },
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function appendSharedAlert(alert: SharedAlert) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    alerts: [alert, ...state.alerts].slice(0, 100),
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function setSharedSignals(signals: SharedSignal[]) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    signals: signals.slice(0, 100),
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function setSharedBalance(balance: Partial<SharedBalance>) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    balance: { ...state.balance, ...balance, lastUpdated: Date.now() },
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function setSharedMetrics(metrics: Partial<SharedMetrics>) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    metrics: { ...state.metrics, ...metrics },
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function setSharedBotState(bot: Partial<SharedBotState>) {
  const state = getSharedTradingState();
  const next = {
    ...state,
    bot: { ...state.bot, ...bot },
    lastUpdated: Date.now(),
  };
  persistSharedState(next);
  emitSharedState(next);
  return next;
}

export function subscribeToSharedTradingState(listener: (state: SharedTradingState) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
