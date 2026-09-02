/**
 * Structured logging convention (PROGRESS.md Phase 1). One JSON line per event, always
 * carrying requestId and (once known) userId. Never logs tokens, secrets, or full
 * memory/message content (.claude/rules/auth-security.md § Errors and logging).
 */

type LogLevel = 'info' | 'warn' | 'error';

const REDACTED_KEYS = new Set([
  'token',
  'idtoken',
  'authorization',
  'password',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'serviceRoleKey',
  'service_role_key',
]);

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LoggerContext {
  requestId: string;
  userId?: string;
}

function write(level: LogLevel, context: LoggerContext, message: string, meta: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    message,
    requestId: context.requestId,
    userId: context.userId,
    timestamp: new Date().toISOString(),
    ...redact(meta),
  });
  console[level === 'info' ? 'log' : level](line);
}

export function createLogger(context: LoggerContext): Logger {
  return {
    info: (message, meta = {}) => write('info', context, message, meta),
    warn: (message, meta = {}) => write('warn', context, message, meta),
    error: (message, meta = {}) => write('error', context, message, meta),
  };
}
