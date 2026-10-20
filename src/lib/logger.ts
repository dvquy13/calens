/**
 * Logging Utility
 * Standardized logging across the extension with consistent prefixes
 */

type LogLevel = 'log' | 'warn' | 'error' | 'debug';

export class Logger {
  constructor(private context: string) {}

  private formatMessage(_level: LogLevel, message: string, ...args: any[]): [string, ...any[]] {
    return [`[${this.context}] ${message}`, ...args];
  }

  log(message: string, ...args: any[]) {
    console.log(...this.formatMessage('log', message, ...args));
  }

  warn(message: string, ...args: any[]) {
    console.warn(...this.formatMessage('warn', message, ...args));
  }

  error(message: string, ...args: any[]) {
    console.error(...this.formatMessage('error', message, ...args));
  }

  debug(message: string, ...args: any[]) {
    console.debug(...this.formatMessage('debug', message, ...args));
  }
}

