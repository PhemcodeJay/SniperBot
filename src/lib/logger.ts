// lib/logger.ts
// Production-grade logging system with levels and storage

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: any;
  stack?: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  log(service: string, level: LogLevel, message: string, data?: any, error?: Error) {
    // Only log if level is enabled
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      data,
      stack: error?.stack,
    };

    this.logs.push(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console
    this.logToConsole(entry);

    // Send critical errors to monitoring
    if (level === 'error') {
      this.sendToMonitoring(entry);
    }
  }

  debug(service: string, message: string, data?: any) {
    this.log(service, 'debug', message, data);
  }

  info(service: string, message: string, data?: any) {
    this.log(service, 'info', message, data);
  }

  warn(service: string, message: string, data?: any) {
    this.log(service, 'warn', message, data);
  }

  error(service: string, message: string, data?: any, error?: Error) {
    this.log(service, 'error', message, data, error);
  }

  getLogs(service?: string, level?: LogLevel, limit = 100): LogEntry[] {
    let filtered = [...this.logs];

    if (service) {
      filtered = filtered.filter((log) => log.service === service);
    }

    if (level) {
      filtered = filtered.filter((log) => log.level === level);
    }

    return filtered.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const logLevelIndex = levels.indexOf(this.logLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= logLevelIndex;
  }

  private logToConsole(entry: LogEntry) {
    const prefix = `[${entry.timestamp}] [${entry.service}]`;
    const method = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log';

    // Format data for better readability
    const dataStr = entry.data
      ? typeof entry.data === 'string'
        ? entry.data
        : JSON.stringify(entry.data)
      : '';
    (console[method as keyof typeof console] as any)(prefix, entry.message, dataStr);

    if (entry.stack) {
      (console[method as keyof typeof console] as any)(entry.stack);
    }
  }

  private sendToMonitoring(entry: LogEntry) {
    // Send critical errors to monitoring service (e.g., Sentry, LogRocket)
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'error-log', entry }, '*');
      } catch (e) {
        // Silently fail
      }
    }
  }
}

export const logger = new Logger();
