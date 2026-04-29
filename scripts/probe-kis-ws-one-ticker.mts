/**
 * NXT3 — KIS H0UNCNT0 one-ticker live WebSocket smoke.
 *
 * Executes exactly one dry-run WebSocket probe:
 *   - issue one approval key
 *   - open one WebSocket connection
 *   - subscribe H0UNCNT0 / 005930
 *   - collect 1-3 live tick frames, then unsubscribe/disconnect
 *
 * The approval key and KIS credentials are never written to stdout, docs, or
 * fixtures. The live tick frame is stored only after secret-pattern guards pass.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createFileCredentialStore } from '../src/server/credential-store.js';
import {
  createApprovalIssuer,
  type ApprovalRequest,
} from '../src/server/kis/kis-approval.js';
import { createKisRestClient } from '../src/server/kis/kis-rest-client.js';
import {
  parseKisTickFrame,
  type KisRealtimeTick,
} from '../src/server/kis/kis-tick-parser.js';
import { createKisWsClient } from '../src/server/kis/kis-ws-client.js';

const TR_ID = 'H0UNCNT0';
const TICKER = '005930';
const TICKER_NAME = '삼성전자';
const MAX_LIVE_TICK_FRAMES = 3;
const NO_TICK_TIMEOUT_MS = 60_000;
const FIRST_TICK_GRACE_MS = 1_500;

const REPORT_PATH = 'docs/research/nxt3-live-ws-smoke.md';
const FIXTURE_PATH =
  'src/server/kis/__fixtures__/ws-tick-h0uncnt0-005930-live.redacted.json';

type ProbeOutcome =
  | 'ok'
  | 'no_live_tick_observed'
  | 'approval_failed'
  | 'websocket_failed'
  | 'subscribe_failed'
  | 'parse_failed';

interface SafeError {
  code: string;
  message: string;
  status?: number;
  rtCd?: string | null;
  msgCd?: string | null;
}

interface ControlFrameSummary {
  trId: string | null;
  trKey: string | null;
  rtCd: string | null;
  msgCd: string | null;
}

interface ParsedTickSummary {
  trId: string;
  source: string;
  ticker: string;
  price: number;
  changeAbs: number;
  changeRate: number;
  volume: number;
  tradeTime: string;
  isSnapshot: false;
}

interface ProbeReport {
  probeRunAt: string;
  completedAt: string;
  elapsedMs: number;
  environment: 'live' | 'paper';
  outcome: ProbeOutcome;
  target: {
    trId: typeof TR_ID;
    ticker: typeof TICKER;
    name: typeof TICKER_NAME;
  };
  approvalKeyCallCount: number;
  websocket: {
    connectionAttemptCount: number;
    connected: boolean;
    finalState: unknown;
  };
  subscribe: {
    attempted: boolean;
    sent: boolean;
    ack: 'success' | 'failure' | 'unknown';
    controlFrames: ControlFrameSummary[];
  };
  collection: {
    timeoutMs: number;
    frameCount: number;
    tickCount: number;
    reason: string;
    fixturePath: string | null;
  };
  parsedTickSummary: ParsedTickSummary | null;
  integrationGuard: {
    priceStoreSetPriceCalls: 0;
    ssePriceUpdateEmits: 0;
    uiChanges: 0;
    websocketEnabledDefaultChanged: false;
    reconnectLoop: false;
  };
  error?: SafeError;
}

interface FixtureFile {
  description: string;
  source: string;
  capturedAt: string;
  trId: typeof TR_ID;
  ticker: typeof TICKER;
  name: typeof TICKER_NAME;
  redaction: {
    containsApprovalKey: false;
    containsAppKey: false;
    containsAppSecret: false;
    containsAccessToken: false;
    checkedBeforeWrite: true;
  };
  raw: string;
  expected: {
    kind: 'ticks';
    tick: {
      trId: typeof TR_ID;
      source: 'integrated';
      ticker: typeof TICKER;
    };
  };
}

class SafeTransportError extends Error {
  readonly status?: number;
  readonly rtCd?: string | null;
  readonly msgCd?: string | null;

  constructor(error: SafeError) {
    super(error.message);
    this.name = 'SafeTransportError';
    this.status = error.status;
    this.rtCd = error.rtCd;
    this.msgCd = error.msgCd;
  }
}

function sanitizeText(text: string): string {
  return text
    .replace(/approval[_-]?key\s*[:=]\s*[^\s&"',}]+/gi, 'approval_key=[REDACTED]')
    .replace(/appkey\s*[:=]\s*[^\s&"',}]+/gi, 'appkey=[REDACTED]')
    .replace(/appsecret\s*[:=]\s*[^\s&"',}]+/gi, 'appsecret=[REDACTED]')
    .replace(/secretkey\s*[:=]\s*[^\s&"',}]+/gi, 'secretkey=[REDACTED]')
    .replace(/access[_-]?token\s*[:=]\s*[^\s&"',}]+/gi, 'access_token=[REDACTED]')
    .replace(/bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

function toSafeError(err: unknown, fallbackCode: string): SafeError {
  if (err instanceof Error) {
    const rec = err as {
      code?: unknown;
      status?: unknown;
      rtCd?: unknown;
      msgCd?: unknown;
    };
    return {
      code: typeof rec.code === 'string' ? rec.code : fallbackCode,
      message: sanitizeText(err.message),
      ...(typeof rec.status === 'number' ? { status: rec.status } : {}),
      ...(typeof rec.rtCd === 'string' || rec.rtCd === null
        ? { rtCd: rec.rtCd }
        : {}),
      ...(typeof rec.msgCd === 'string' || rec.msgCd === null
        ? { msgCd: rec.msgCd }
        : {}),
    };
  }
  return { code: fallbackCode, message: sanitizeText(String(err)) };
}

function assertNoSecretLikeText(label: string, text: string): void {
  const checks: Array<[RegExp, string]> = [
    [/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'approval_key'],
    [/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'approvalKey'],
    [/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'appkey'],
    [/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'appsecret'],
    [/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'secretkey'],
    [/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i, 'access token'],
    [/Bearer\s+[A-Za-z0-9_-]{20,}/i, 'bearer token'],
    [/[A-Za-z0-9_-]{40,}/, 'long token-like run'],
  ];
  for (const [pattern, name] of checks) {
    if (pattern.test(text)) {
      throw new Error(`LEAK GUARD: ${label} contains ${name}`);
    }
  }
}

function parseControlFrame(raw: string): ControlFrameSummary | null {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const header =
      typeof parsed['header'] === 'object' && parsed['header'] !== null
        ? (parsed['header'] as Record<string, unknown>)
        : {};
    const body =
      typeof parsed['body'] === 'object' && parsed['body'] !== null
        ? (parsed['body'] as Record<string, unknown>)
        : {};
    return {
      trId: typeof header['tr_id'] === 'string' ? header['tr_id'] : null,
      trKey: typeof header['tr_key'] === 'string' ? header['tr_key'] : null,
      rtCd: typeof body['rt_cd'] === 'string' ? body['rt_cd'] : null,
      msgCd: typeof body['msg_cd'] === 'string' ? body['msg_cd'] : null,
    };
  } catch {
    return null;
  }
}

function summarizeTick(tick: KisRealtimeTick): ParsedTickSummary {
  return {
    trId: tick.trId,
    source: tick.source,
    ticker: tick.ticker,
    price: tick.price,
    changeAbs: tick.changeAbs,
    changeRate: tick.changeRate,
    volume: tick.volume,
    tradeTime: tick.tradeTime,
    isSnapshot: tick.isSnapshot,
  };
}

function renderMarkdown(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# NXT3 — H0UNCNT0 live WebSocket smoke');
  lines.push('');
  lines.push(`**실행 일시 (UTC)**: ${report.probeRunAt}`);
  lines.push(`**완료 일시 (UTC)**: ${report.completedAt}`);
  lines.push(`**소요 시간**: ${report.elapsedMs}ms`);
  lines.push(`**환경**: ${report.environment}`);
  lines.push(`**결과**: ${report.outcome}`);
  lines.push('');
  lines.push('## Target');
  lines.push('');
  lines.push(`- TR_ID: \`${report.target.trId}\``);
  lines.push(`- ticker: \`${report.target.ticker}\` (${report.target.name})`);
  lines.push('- subscribe count: 1');
  lines.push('');
  lines.push('## Safe Summary');
  lines.push('');
  lines.push(`- approval key call count: ${report.approvalKeyCallCount}`);
  lines.push(`- websocket connected: ${report.websocket.connected}`);
  lines.push(`- subscribe sent: ${report.subscribe.sent}`);
  lines.push(`- subscribe ack: ${report.subscribe.ack}`);
  lines.push(`- live tick frame count: ${report.collection.frameCount}`);
  lines.push(`- parsed tick count: ${report.collection.tickCount}`);
  lines.push(`- collection reason: ${report.collection.reason}`);
  lines.push(`- fixture path: ${report.collection.fixturePath ?? '(none)'}`);
  lines.push('');
  if (report.parsedTickSummary !== null) {
    lines.push('## Parsed Tick Summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.parsedTickSummary, null, 2));
    lines.push('```');
    lines.push('');
  }
  if (report.error !== undefined) {
    lines.push('## Safe Error');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.error, null, 2));
    lines.push('```');
    lines.push('');
  }
  lines.push('## Integration Guard');
  lines.push('');
  lines.push('- [x] priceStore.setPrice 호출 0회');
  lines.push('- [x] SSE price-update 발행 0회');
  lines.push('- [x] UI 변경 0회');
  lines.push('- [x] websocketEnabled 기본값 변경 0회');
  lines.push('- [x] reconnect loop 0회');
  lines.push('- [x] approval_key/appKey/appSecret/access token 원문 저장 0회');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Raw live frame은 이 문서에 포함하지 않는다.');
  lines.push('- 성공 시 raw tick frame은 secret-pattern guard 통과 후 redacted fixture 파일에만 저장한다.');
  lines.push('');
  return lines.join('\n');
}

async function writeText(path: string, text: string): Promise<void> {
  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf8');
}

async function writeFixture(raw: string, capturedAt: string): Promise<ParsedTickSummary> {
  assertNoSecretLikeText('live tick frame', raw);
  const parsed = parseKisTickFrame(raw);
  if (parsed.kind !== 'ticks') {
    throw new Error(`expected live frame to parse as ticks, got ${parsed.kind}`);
  }
  const firstTick = parsed.ticks[0];
  if (firstTick === undefined) {
    throw new Error('live frame parsed as ticks but contained no tick rows');
  }
  if (
    firstTick.trId !== TR_ID ||
    firstTick.source !== 'integrated' ||
    firstTick.ticker !== TICKER
  ) {
    throw new Error(
      `unexpected live tick identity trId=${firstTick.trId} source=${firstTick.source} ticker=${firstTick.ticker}`,
    );
  }

  const fixture: FixtureFile = {
    description:
      'NXT3 KIS H0UNCNT0 one-ticker live smoke fixture. Contains one live tick frame for parser regression; no approval key, app key, app secret, access token, or account identifier is present.',
    source: 'KIS live WebSocket H0UNCNT0 dry-run smoke',
    capturedAt,
    trId: TR_ID,
    ticker: TICKER,
    name: TICKER_NAME,
    redaction: {
      containsApprovalKey: false,
      containsAppKey: false,
      containsAppSecret: false,
      containsAccessToken: false,
      checkedBeforeWrite: true,
    },
    raw,
    expected: {
      kind: 'ticks',
      tick: {
        trId: TR_ID,
        source: 'integrated',
        ticker: TICKER,
      },
    },
  };

  const text = `${JSON.stringify(fixture, null, 2)}\n`;
  assertNoSecretLikeText('live fixture JSON', text);
  await writeText(FIXTURE_PATH, text);
  return summarizeTick(firstTick);
}

async function main(): Promise<void> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let approvalKeyCallCount = 0;
  let connectionAttemptCount = 0;
  let connected = false;
  let subscribeAttempted = false;
  let subscribeSent = false;
  let subscribeAck: ProbeReport['subscribe']['ack'] = 'unknown';
  let collectionReason = 'not_started';
  let outcome: ProbeOutcome = 'websocket_failed';
  let safeError: SafeError | undefined;
  let parsedTickSummary: ParsedTickSummary | null = null;
  const controlFrames: ControlFrameSummary[] = [];
  const tickFrames: string[] = [];
  let tickCount = 0;

  const store = createFileCredentialStore();
  const payload = await store.load();
  if (payload === null) {
    safeError = {
      code: 'missing_credentials',
      message: 'data/credentials.enc is not configured',
    };
    outcome = 'approval_failed';
  }

  const credentials = payload?.credentials;
  const environment: 'live' | 'paper' =
    credentials?.isPaper === true ? 'paper' : 'live';

  let client: ReturnType<typeof createKisWsClient> | null = null;
  let firstTickGraceTimer: NodeJS.Timeout | null = null;

  try {
    if (credentials === undefined) {
      throw new SafeTransportError(safeError!);
    }

    const restClient = createKisRestClient({
      isPaper: credentials.isPaper,
      maxAttempts: 1,
    });
    const transport = {
      request: async <T,>(req: ApprovalRequest): Promise<T> => {
        try {
          return await restClient.request<T>(req);
        } catch (err: unknown) {
          throw new SafeTransportError(toSafeError(err, 'approval_request_failed'));
        }
      },
    };
    const issuer = createApprovalIssuer({
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      transport,
    });

    let resolveCollection:
      | ((value: { reason: string; outcome: ProbeOutcome }) => void)
      | undefined;
    const collection = new Promise<{ reason: string; outcome: ProbeOutcome }>(
      (resolvePromise) => {
        resolveCollection = resolvePromise;
      },
    );

    const timeout = setTimeout(() => {
      resolveCollection?.({
        reason: 'no_live_tick_observed',
        outcome: 'no_live_tick_observed',
      });
    }, NO_TICK_TIMEOUT_MS);

    client = createKisWsClient({
      isPaper: credentials.isPaper,
      getApprovalKey: async () => {
        approvalKeyCallCount += 1;
        return issuer.issue();
      },
      maxReconnectAttempts: 0,
      reconnectDelaysMs: [],
      jitterRatio: 0,
      stableResetMs: NO_TICK_TIMEOUT_MS + 10_000,
    });

    client.onMessage((raw) => {
      const control = parseControlFrame(raw);
      if (control !== null) {
        controlFrames.push(control);
        if (control.trId === TR_ID || control.trKey === TICKER) {
          if (control.rtCd === '0') subscribeAck = 'success';
          if (control.rtCd !== null && control.rtCd !== '0') {
            subscribeAck = 'failure';
            resolveCollection?.({
              reason: `subscribe_failed:${control.msgCd ?? 'unknown'}`,
              outcome: 'subscribe_failed',
            });
          }
        }
        return;
      }

      if (!raw.startsWith(`0|${TR_ID}|`)) return;
      const result = parseKisTickFrame(raw);
      if (result.kind !== 'ticks') {
        resolveCollection?.({
          reason: `parse_failed:${result.kind}`,
          outcome: 'parse_failed',
        });
        return;
      }

      tickFrames.push(raw);
      tickCount += result.ticks.length;
      if (tickFrames.length >= MAX_LIVE_TICK_FRAMES) {
        resolveCollection?.({
          reason: 'frame_limit_reached',
          outcome: 'ok',
        });
        return;
      }
      if (firstTickGraceTimer === null) {
        firstTickGraceTimer = setTimeout(() => {
          resolveCollection?.({
            reason: 'first_tick_grace_elapsed',
            outcome: 'ok',
          });
        }, FIRST_TICK_GRACE_MS);
      }
    });

    connectionAttemptCount += 1;
    await client.connect();
    connected = true;

    subscribeAttempted = true;
    await client.subscribe({ trId: TR_ID, trKey: TICKER });
    subscribeSent = true;

    const result = await collection;
    clearTimeout(timeout);
    if (firstTickGraceTimer !== null) {
      clearTimeout(firstTickGraceTimer);
      firstTickGraceTimer = null;
    }
    collectionReason = result.reason;
    outcome = result.outcome;

    if (tickFrames[0] !== undefined) {
      parsedTickSummary = await writeFixture(tickFrames[0], new Date().toISOString());
      outcome = 'ok';
    }
  } catch (err: unknown) {
    safeError = toSafeError(err, 'probe_failed');
    if (approvalKeyCallCount === 0 || safeError.code.includes('approval')) {
      outcome = 'approval_failed';
    } else if (subscribeAttempted && !subscribeSent) {
      outcome = 'subscribe_failed';
    } else if (tickFrames.length > 0) {
      outcome = 'parse_failed';
    } else {
      outcome = connected ? 'subscribe_failed' : 'websocket_failed';
    }
    collectionReason = safeError.code;
  } finally {
    if (firstTickGraceTimer !== null) clearTimeout(firstTickGraceTimer);
    if (client !== null) {
      try {
        if (subscribeSent) {
          await client.unsubscribe({ trId: TR_ID, trKey: TICKER });
        }
      } catch (err: unknown) {
        safeError = safeError ?? toSafeError(err, 'unsubscribe_failed');
      }
      try {
        await client.disconnect('manual');
      } catch (err: unknown) {
        safeError = safeError ?? toSafeError(err, 'disconnect_failed');
      }
    }
  }

  const completedAtMs = Date.now();
  const report: ProbeReport = {
    probeRunAt: startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    elapsedMs: completedAtMs - startedAtMs,
    environment,
    outcome,
    target: { trId: TR_ID, ticker: TICKER, name: TICKER_NAME },
    approvalKeyCallCount,
    websocket: {
      connectionAttemptCount,
      connected,
      finalState: client?.getStatus() ?? null,
    },
    subscribe: {
      attempted: subscribeAttempted,
      sent: subscribeSent,
      ack: subscribeAck,
      controlFrames,
    },
    collection: {
      timeoutMs: NO_TICK_TIMEOUT_MS,
      frameCount: tickFrames.length,
      tickCount,
      reason: collectionReason,
      fixturePath: parsedTickSummary !== null ? FIXTURE_PATH : null,
    },
    parsedTickSummary,
    integrationGuard: {
      priceStoreSetPriceCalls: 0,
      ssePriceUpdateEmits: 0,
      uiChanges: 0,
      websocketEnabledDefaultChanged: false,
      reconnectLoop: false,
    },
    ...(safeError !== undefined ? { error: safeError } : {}),
  };

  const reportJson = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);
  assertNoSecretLikeText('probe stdout JSON', reportJson);
  assertNoSecretLikeText('probe markdown report', markdown);
  await writeText(REPORT_PATH, markdown);

  console.log(reportJson);
  console.error(`[probe] report written to ${REPORT_PATH}`);
  if (parsedTickSummary !== null) {
    console.error(`[probe] fixture written to ${FIXTURE_PATH}`);
  }

  process.exit(outcome === 'ok' || outcome === 'no_live_tick_observed' ? 0 : 1);
}

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[probe] fatal: ${sanitizeText(msg)}`);
  process.exit(3);
});
