/**
 * Pino-based app logger.
 *
 * Dev: pretty-printed human-readable output via `pino-pretty`.
 * Prod: structured JSON on stdout for downstream capture (Phase 10 Windows
 * EventLog transport will be wired at the marker below).
 */

import { pino, type Logger } from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';

// Phase 10: EventLog transport hook here
const transport = isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    };

const REDACT_PATHS = [
  'appKey',
  'appSecret',
  'body.appKey',
  'body.appSecret',
  'req.body.appKey',
  'req.body.appSecret',
  'credentials.appKey',
  'credentials.appSecret',
  'accessToken',
  'approvalKey',
];

export const logger: Logger = pino({
  level: process.env['LOG_LEVEL'] ?? (isProduction ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  ...(transport ? { transport } : {}),
});

/**
 * Create a child logger scoped to a named subsystem (e.g. 'kis-ws', 'sse').
 * The `name` appears in every log line for easy filtering.
 */
export function createChildLogger(name: string): Logger {
  return logger.child({ name });
}
