// lib/database.ts
// Server-side SQLite database for persistent storage of trades, signals, alerts, and bot state

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'sniperbot.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('LONG', 'SHORT')),
      entry_price REAL NOT NULL,
      exit_price REAL,
      size REAL NOT NULL,
      pnl REAL DEFAULT 0,
      pnl_pct REAL DEFAULT 0,
      confidence REAL DEFAULT 0,
      regime TEXT,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      duration TEXT,
      exit_reason TEXT,
      slippage REAL,
      entry_timestamp INTEGER,
      exit_timestamp INTEGER,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'partial')),
      leverage REAL DEFAULT 1,
      liquidation_price REAL,
      order_id TEXT,
      trade_type TEXT DEFAULT 'market',
      position_idx INTEGER,
      source TEXT DEFAULT 'live' CHECK(source IN ('paper', 'live', 'bybit')),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('LONG', 'SHORT')),
      confidence REAL NOT NULL,
      entry_price REAL NOT NULL,
      sl REAL,
      tp1 REAL,
      tp2 REAL,
      rr REAL,
      timeframe TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'live', 'rejected', 'executed')),
      generated_at TEXT NOT NULL,
      change_24h REAL DEFAULT 0,
      volume REAL DEFAULT 0,
      regime TEXT,
      signal_source TEXT DEFAULT 'technical' CHECK(signal_source IN ('ml', 'technical', 'hybrid')),
      timestamp INTEGER,
      executed_at INTEGER,
      order_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('signal', 'trade', 'risk', 'system')),
      priority TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      time TEXT,
      read INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      symbol TEXT,
      price REAL,
      change_24h REAL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS balance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_equity REAL NOT NULL,
      available_balance REAL NOT NULL,
      base_equity REAL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
    CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);
    CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_balance_history_timestamp ON balance_history(timestamp);
  `);
}

// ============== TRADES ==============

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  exit_price: number | null;
  size: number;
  pnl: number;
  pnl_pct: number;
  confidence: number;
  regime: string | null;
  entry_time: string;
  exit_time: string | null;
  duration: string | null;
  exit_reason: string | null;
  slippage: number | null;
  entry_timestamp: number | null;
  exit_timestamp: number | null;
  status: 'open' | 'closed' | 'partial';
  leverage: number;
  liquidation_price: number | null;
  order_id: string | null;
  trade_type: string | null;
  position_idx: number | null;
  source: 'paper' | 'live' | 'bybit';
  created_at: number;
  updated_at: number;
}

export function insertTrade(trade: Omit<TradeRecord, 'created_at' | 'updated_at'>) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO trades (
      id, symbol, side, entry_price, exit_price, size, pnl, pnl_pct,
      confidence, regime, entry_time, exit_time, duration, exit_reason,
      slippage, entry_timestamp, exit_timestamp, status, leverage,
      liquidation_price, order_id, trade_type, position_idx, source
    ) VALUES (
      @id, @symbol, @side, @entry_price, @exit_price, @size, @pnl, @pnl_pct,
      @confidence, @regime, @entry_time, @exit_time, @duration, @exit_reason,
      @slippage, @entry_timestamp, @exit_timestamp, @status, @leverage,
      @liquidation_price, @order_id, @trade_type, @position_idx, @source
    )
  `);
  stmt.run(trade);
}

export function updateTrade(id: string, updates: Partial<TradeRecord>) {
  const db = getDatabase();
  const fields = Object.keys(updates)
    .filter(k => k !== 'id' && k !== 'created_at')
    .map(k => `${k} = @${k}`)
    .join(', ');
  if (!fields) return;
  const stmt = db.prepare(`UPDATE trades SET ${fields}, updated_at = (strftime('%s','now') * 1000) WHERE id = @id`);
  stmt.run({ ...updates, id });
}

export function getTrades(options: {
  status?: 'open' | 'closed' | 'partial';
  source?: 'paper' | 'live' | 'bybit';
  symbol?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
} = {}): TradeRecord[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any = {};

  if (options.status) {
    conditions.push('status = @status');
    params.status = options.status;
  }
  if (options.source) {
    conditions.push('source = @source');
    params.source = options.source;
  }
  if (options.symbol) {
    conditions.push('symbol = @symbol');
    params.symbol = options.symbol;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = options.orderBy || 'created_at';
  const orderDir = options.orderDir || 'DESC';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const stmt = db.prepare(`SELECT * FROM trades ${where} ORDER BY ${orderBy} ${orderDir} LIMIT @limit OFFSET @offset`);
  return stmt.all({ ...params, limit, offset }) as TradeRecord[];
}

export function getTradeStats() {
  const db = getDatabase();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_trades,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_positions,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
      COALESCE(SUM(pnl), 0) as total_pnl,
      COALESCE(AVG(CASE WHEN status = 'closed' THEN pnl ELSE NULL END), 0) as avg_pnl
    FROM trades
  `).get() as any;

  const winRate = (stats.winning_trades + stats.losing_trades) > 0
    ? (stats.winning_trades / (stats.winning_trades + stats.losing_trades)) * 100
    : 0;

  return { ...stats, win_rate: Math.round(winRate * 10) / 10 };
}

// ============== SIGNALS ==============

export interface SignalRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  entry_price: number;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  timeframe: string | null;
  status: 'pending' | 'live' | 'rejected' | 'executed';
  generated_at: string;
  change_24h: number;
  volume: number;
  regime: string | null;
  signal_source: 'ml' | 'technical' | 'hybrid';
  timestamp: number | null;
  executed_at: number | null;
  order_id: string | null;
  created_at: number;
}

export function insertSignal(signal: Omit<SignalRecord, 'created_at'>) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO signals (
      id, symbol, direction, confidence, entry_price, sl, tp1, tp2, rr,
      timeframe, status, generated_at, change_24h, volume, regime,
      signal_source, timestamp, executed_at, order_id
    ) VALUES (
      @id, @symbol, @direction, @confidence, @entry_price, @sl, @tp1, @tp2, @rr,
      @timeframe, @status, @generated_at, @change_24h, @volume, @regime,
      @signal_source, @timestamp, @executed_at, @order_id
    )
  `);
  stmt.run(signal);
}

export function updateSignal(id: string, updates: Partial<SignalRecord>) {
  const db = getDatabase();
  const fields = Object.keys(updates)
    .filter(k => k !== 'id' && k !== 'created_at')
    .map(k => `${k} = @${k}`)
    .join(', ');
  if (!fields) return;
  const stmt = db.prepare(`UPDATE signals SET ${fields} WHERE id = @id`);
  stmt.run({ ...updates, id });
}

export function getSignals(options: {
  status?: 'pending' | 'live' | 'rejected' | 'executed';
  symbol?: string;
  limit?: number;
  offset?: number;
} = {}): SignalRecord[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any = {};

  if (options.status) {
    conditions.push('status = @status');
    params.status = options.status;
  }
  if (options.symbol) {
    conditions.push('symbol = @symbol');
    params.symbol = options.symbol;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const stmt = db.prepare(`SELECT * FROM signals ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`);
  return stmt.all({ ...params, limit, offset }) as SignalRecord[];
}

// ============== ALERTS ==============

export interface AlertRecord {
  id: string;
  type: 'signal' | 'trade' | 'risk' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  time: string | null;
  read: number;
  timestamp: number;
  symbol: string | null;
  price: number | null;
  change_24h: number | null;
  created_at: number;
}

export function insertAlert(alert: Omit<AlertRecord, 'created_at'>) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO alerts (
      id, type, priority, title, message, time, read, timestamp, symbol, price, change_24h
    ) VALUES (
      @id, @type, @priority, @title, @message, @time, @read, @timestamp, @symbol, @price, @change_24h
    )
  `);
  stmt.run(alert);
}

export function getAlerts(options: {
  limit?: number;
  unreadOnly?: boolean;
} = {}): AlertRecord[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any = {};

  if (options.unreadOnly) {
    conditions.push('read = 0');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;

  const stmt = db.prepare(`SELECT * FROM alerts ${where} ORDER BY timestamp DESC LIMIT @limit`);
  return stmt.all({ ...params, limit }) as AlertRecord[];
}

export function markAlertRead(id: string) {
  const db = getDatabase();
  db.prepare('UPDATE alerts SET read = 1 WHERE id = @id').run({ id });
}

// ============== BOT STATE ==============

export function setBotState(key: string, value: string) {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO bot_state (key, value, updated_at)
    VALUES (@key, @value, (strftime('%s','now') * 1000))
  `).run({ key, value });
}

export function getBotState(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM bot_state WHERE key = @key').get({ key }) as { value: string } | undefined;
  return row?.value || null;
}

export function getAllBotState(): Record<string, string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM bot_state').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ============== BALANCE HISTORY ==============

export function recordBalanceSnapshot(totalEquity: number, availableBalance: number, baseEquity?: number) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO balance_history (total_equity, available_balance, base_equity, timestamp)
    VALUES (@totalEquity, @availableBalance, @baseEquity, (strftime('%s','now') * 1000))
  `).run({ totalEquity, availableBalance, baseEquity: baseEquity || totalEquity });
}

export function getBalanceHistory(options: {
  limit?: number;
  since?: number;
} = {}): Array<{ total_equity: number; available_balance: number; timestamp: number }> {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any = {};

  if (options.since) {
    conditions.push('timestamp >= @since');
    params.since = options.since;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 500;

  const stmt = db.prepare(`SELECT total_equity, available_balance, timestamp FROM balance_history ${where} ORDER BY timestamp DESC LIMIT @limit`);
  return stmt.all({ ...params, limit }) as any[];
}

// ============== EXPORT DATA ==============

export function getExportData(type: 'trades' | 'signals', options: {
  status?: string;
  source?: string;
  startDate?: number;
  endDate?: number;
} = {}) {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any = {};

  if (options.status) {
    conditions.push('status = @status');
    params.status = options.status;
  }
  if (options.source && type === 'trades') {
    conditions.push('source = @source');
    params.source = options.source;
  }
  if (options.startDate) {
    conditions.push('created_at >= @startDate');
    params.startDate = options.startDate;
  }
  if (options.endDate) {
    conditions.push('created_at <= @endDate');
    params.endDate = options.endDate;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const table = type === 'trades' ? 'trades' : 'signals';
  const stmt = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC`);
  return stmt.all(params);
}

// ============== CLEANUP ==============

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}