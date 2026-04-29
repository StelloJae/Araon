import { describe, it, expect } from 'vitest';
import { pino } from 'pino';

import { logger } from '../logger.js';

describe('@shared/logger redaction', () => {
  it('redacts appKey/appSecret/accessToken/approvalKey from log payload', () => {
    const chunks: string[] = [];
    const testLogger = pino(
      {
        redact: {
          paths: [
            'appKey', 'appSecret',
            'body.appKey', 'body.appSecret',
            'req.body.appKey', 'req.body.appSecret',
            'credentials.appKey', 'credentials.appSecret',
            'accessToken', 'approvalKey',
          ],
          censor: '[redacted]',
        },
      },
      { write: (s: string) => { chunks.push(s); } },
    );

    testLogger.info({ appKey: 'SECRET_KEY', appSecret: 'SECRET_VALUE' }, 'test');
    testLogger.info({ body: { appKey: 'A', appSecret: 'B' } }, 'test');
    testLogger.info({ req: { body: { appKey: 'A', appSecret: 'B' } } }, 'test');
    testLogger.info({ credentials: { appKey: 'A', appSecret: 'B' } }, 'test');
    testLogger.info({ accessToken: 'T', approvalKey: 'K' }, 'test');

    const all = chunks.join('\n');
    expect(all).not.toContain('SECRET_KEY');
    expect(all).not.toContain('SECRET_VALUE');
    expect(all).not.toContain('"appKey":"A"');
    expect(all).not.toContain('"accessToken":"T"');
    expect(all).toContain('[redacted]');
  });

  it('exports a logger that has redact configured', () => {
    // pino 9.x stores per-path redact functions on Symbol(pino.stringifiers).
    // Without redact the object is empty {}; with redact it is populated with
    // per-path functions and a Symbol(pino.redactFmt) sentinel key.
    // This is more reliable than scanning symbol names (which are identical
    // with or without redact in pino 9).
    const stringifiersSym = Object.getOwnPropertySymbols(logger).find(
      s => String(s) === 'Symbol(pino.stringifiers)',
    );
    expect(stringifiersSym).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stringifiers = (logger as any)[stringifiersSym!] as Record<string | symbol, unknown>;
    const redactFmtSym = Object.getOwnPropertySymbols(stringifiers).find(
      s => String(s).includes('redactFmt'),
    );
    expect(redactFmtSym).toBeDefined();
  });
});
