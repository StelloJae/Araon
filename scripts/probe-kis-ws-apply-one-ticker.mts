/**
 * NXT4b — isolated live apply smoke for H0UNCNT0 / 005930.
 *
 * This script opens one live KIS WebSocket and routes the frame through a
 * probe-local RealtimeBridge + PriceStore only. It never attaches to the
 * running dev/prod server, persisted settings, UI, or real SSE clients.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { Price } from '../src/shared/types.js';
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
import {
  createKisWsClient,
  type KisWsClient,
  type WsMessageHandler,
  type WsSubscription,
  type WsConnectionState,
} from '../src/server/kis/kis-ws-client.js';
import { PriceStore } from '../src/server/price/price-store.js';
import {
  createRealtimeBridge,
  type ParsedWsFrame,
  type RealtimeTick,
  type WsTickParser,
} from '../src/server/realtime/realtime-bridge.js';

const TR_ID = 'H0UNCNT0';
const TICKER = '005930';
const TICKER_NAME = '삼성전자';
const MAX_APPLY_EVENTS = 3;
const NO_TICK_TIMEOUT_MS = 60_000;
const FIRST_APPLY_GRACE_MS = 1_500;

const REPORT_PATH = 'docs/research/nxt4b-live-apply-smoke.md';

type ProbeOutcome =
  | 'ok'
  | 'no_live_tick_observed'
  | 'approval_failed'
  | 'websocket_failed'
  | 'subscribe_failed'
  | 'parse_failed'
  | 'apply_failed';

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

interface PriceSummary {
  ticker: string;
  price: number;
  changeAbs: number | null;
  changeRate: number;
  volume: number;
  updatedAt: string;
  isSnapshot: boolean;
  source: string | null;
}

interface TickSummary {
  trId: string;
  source: string;
  ticker: string;
  price: number;
  changeAbs: number;
  changeRate: number;
  volume: number;
  tradeTime: string;
  updatedAt: string;
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
  websocketConnectionAttemptCount: number;
  websocketConnected: boolean;
  subscribe: {
    attempted: boolean;
    sent: boolean;
    ack: 'success' | 'failure' | 'unknown';
    controlFrames: ControlFrameSummary[];
  };
  liveFrameCount: number;
  parsedTickCount: number;
  priceStoreSetPriceCount: number;
  ssePriceUpdateCount: number;
  collectionReason: string;
  parsedTickSummary: TickSummary | null;
  appliedPriceSummary: PriceSummary | null;
  sseEventSummary: PriceSummary | null;
  stalePolicy: {
    checkedInProbeHarness: boolean;
    passed: boolean;
  };
  integrationGuard: {
    isolatedHarness: true;
    productionPriceStoreTouched: false;
    productionSseTouched: false;
    uiTouched: false;
    websocketEnabledDefaultChanged: false;
    persistedSettingsChanged: false;
    reconnectLoop: false;
  };
  finalWsStatus: unknown;
  error?: SafeError;
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

function summarizeTick(tick: KisRealtimeTick): TickSummary {
  return {
    trId: tick.trId,
    source: tick.source,
    ticker: tick.ticker,
    price: tick.price,
    changeAbs: tick.changeAbs,
    changeRate: tick.changeRate,
    volume: tick.volume,
    tradeTime: tick.tradeTime,
    updatedAt: tick.updatedAt,
    isSnapshot: tick.isSnapshot,
  };
}

function summarizePrice(price: Price): PriceSummary {
  return {
    ticker: price.ticker,
    price: price.price,
    changeAbs: price.changeAbs ?? null,
    changeRate: price.changeRate,
    volume: price.volume,
    updatedAt: price.updatedAt,
    isSnapshot: price.isSnapshot,
    source: price.source ?? null,
  };
}

function makeBridgeParser(
  onParsed: (tick: KisRealtimeTick) => void,
  shouldAcceptLiveFrame: () => boolean = () => true,
): WsTickParser {
  return (raw: string): ParsedWsFrame => {
    if (!shouldAcceptLiveFrame()) {
      return { kind: 'ignore', reason: 'collection already settled' };
    }
    const result = parseKisTickFrame(raw);
    switch (result.kind) {
      case 'ticks': {
        const ticks = result.ticks.filter(
          (tick) => tick.trId === TR_ID && tick.ticker === TICKER,
        );
        for (const tick of ticks) onParsed(tick);
        return { kind: 'ticks', ticks };
      }
      case 'pingpong':
        return { kind: 'ignore', reason: 'PINGPONG control frame' };
      case 'ignore':
        return { kind: 'ignore', reason: result.reason };
      case 'error':
        return { kind: 'error', message: `${result.code}: ${result.message}` };
    }
  };
}

function createCountingPriceStore(): {
  priceStore: PriceStore;
  getSetPriceCount(): number;
} {
  const priceStore = new PriceStore();
  const originalSetPrice = priceStore.setPrice.bind(priceStore);
  let setPriceCount = 0;
  priceStore.setPrice = (price: Price): void => {
    setPriceCount += 1;
    originalSetPrice(price);
  };
  return {
    priceStore,
    getSetPriceCount: () => setPriceCount,
  };
}

function createManualWs(): {
  client: KisWsClient;
  emit(raw: string): void;
} {
  const handlers = new Set<WsMessageHandler>();
  let state: WsConnectionState = 'idle';
  const client: KisWsClient = {
    async connect(): Promise<void> {
      state = 'connected';
    },
    async disconnect(): Promise<void> {
      state = 'stopped';
    },
    async subscribe(_sub: WsSubscription): Promise<void> {
      return undefined;
    },
    async unsubscribe(_sub: WsSubscription): Promise<void> {
      return undefined;
    },
    onMessage(handler: WsMessageHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    state(): WsConnectionState {
      return state;
    },
    activeSubscriptions(): readonly WsSubscription[] {
      return [];
    },
    getStatus() {
      return {
        state,
        reconnectAttempts: 0,
        nextReconnectAt: null,
        lastConnectedAt: null,
        lastError: null,
        stopReason: null,
      };
    },
  };
  return {
    client,
    emit(raw: string): void {
      for (const handler of handlers) handler(raw);
    },
  };
}

function tickAt(updatedAt: string, price: number): RealtimeTick {
  return {
    trId: TR_ID,
    source: 'integrated',
    ticker: TICKER,
    price,
    changeAbs: 4000,
    changeRate: 1.82,
    volume: 39260243,
    tradeTime: '171405',
    updatedAt,
    isSnapshot: false,
  };
}

function verifyStalePolicyHarness(): boolean {
  const manualWs = createManualWs();
  const { priceStore, getSetPriceCount } = createCountingPriceStore();
  const initial: Price = {
    ticker: TICKER,
    price: 224000,
    changeAbs: 4500,
    changeRate: 2.05,
    volume: 40000000,
    updatedAt: '2026-04-27T08:14:06.000Z',
    isSnapshot: false,
    source: 'rest',
  };
  priceStore.setPrice(initial);
  const baselineWrites = getSetPriceCount();
  const parseTick: WsTickParser = (raw): ParsedWsFrame => {
    if (raw === 'OLDER') {
      return { kind: 'ticks', ticks: [tickAt('2026-04-27T08:14:05.000Z', 223500)] };
    }
    if (raw === 'EQUAL') {
      return { kind: 'ticks', ticks: [tickAt('2026-04-27T08:14:06.000Z', 223700)] };
    }
    return { kind: 'ticks', ticks: [tickAt('2026-04-27T08:14:07.000Z', 224100)] };
  };
  createRealtimeBridge({
    wsClient: manualWs.client,
    priceStore,
    parseTick,
    applyTicksToPriceStore: true,
  });

  manualWs.emit('OLDER');
  manualWs.emit('EQUAL');
  manualWs.emit('NEWER');

  const finalPrice = priceStore.getPrice(TICKER);
  return (
    getSetPriceCount() - baselineWrites === 1 &&
    finalPrice?.price === 224100 &&
    finalPrice?.updatedAt === '2026-04-27T08:14:07.000Z'
  );
}

function renderMarkdown(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# NXT4b — isolated H0UNCNT0 live apply smoke');
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
  lines.push(`- websocket connection attempts: ${report.websocketConnectionAttemptCount}`);
  lines.push(`- websocket connected: ${report.websocketConnected}`);
  lines.push(`- subscribe sent: ${report.subscribe.sent}`);
  lines.push(`- subscribe ack: ${report.subscribe.ack}`);
  lines.push(`- live frame count: ${report.liveFrameCount}`);
  lines.push(`- parsed tick count: ${report.parsedTickCount}`);
  lines.push(`- priceStore.setPrice count: ${report.priceStoreSetPriceCount}`);
  lines.push(`- SSE price-update count: ${report.ssePriceUpdateCount}`);
  lines.push(`- collection reason: ${report.collectionReason}`);
  lines.push(`- stale policy checked: ${report.stalePolicy.checkedInProbeHarness}`);
  lines.push(`- stale policy passed: ${report.stalePolicy.passed}`);
  lines.push('');
  if (report.parsedTickSummary !== null) {
    lines.push('## Parsed Tick Summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.parsedTickSummary, null, 2));
    lines.push('```');
    lines.push('');
  }
  if (report.appliedPriceSummary !== null) {
    lines.push('## Applied Price Summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.appliedPriceSummary, null, 2));
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
  lines.push('## Isolation Guard');
  lines.push('');
  lines.push('- [x] probe-local PriceStore only');
  lines.push('- [x] probe-local SSE spy only');
  lines.push('- [x] running dev/prod server priceStore touched 0회');
  lines.push('- [x] real SSE clients touched 0회');
  lines.push('- [x] UI 변경 0회');
  lines.push('- [x] persisted settings 변경 0회');
  lines.push('- [x] websocketEnabled 기본값 변경 0회');
  lines.push('- [x] reconnect loop 0회');
  lines.push('- [x] approval_key/appKey/appSecret/access token 원문 저장 0회');
  lines.push('');
  lines.push('Raw live frames and approval keys are intentionally not included in this report.');
  lines.push('');
  return lines.join('\n');
}

async function writeText(path: string, text: string): Promise<void> {
  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf8');
}

async function main(): Promise<void> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  let approvalKeyCallCount = 0;
  let websocketConnectionAttemptCount = 0;
  let websocketConnected = false;
  let subscribeAttempted = false;
  let subscribeSent = false;
  let subscribeAck: ProbeReport['subscribe']['ack'] = 'unknown';
  let liveFrameCount = 0;
  let parsedTickCount = 0;
  let collectionReason = 'not_started';
  let outcome: ProbeOutcome = 'websocket_failed';
  let safeError: SafeError | undefined;
  let parsedTickSummary: TickSummary | null = null;
  let appliedPriceSummary: PriceSummary | null = null;
  let sseEventSummary: PriceSummary | null = null;
  const controlFrames: ControlFrameSummary[] = [];

  const stalePolicyPassed = verifyStalePolicyHarness();
  const { priceStore, getSetPriceCount } = createCountingPriceStore();
  const sseEvents: PriceSummary[] = [];
  priceStore.on('price-update', (price) => {
    const summary = summarizePrice(price);
    sseEvents.push(summary);
    sseEventSummary = summary;
  });

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

  let bridge: ReturnType<typeof createRealtimeBridge> | null = null;
  let wsClient: ReturnType<typeof createKisWsClient> | null = null;
  let firstApplyGraceTimer: NodeJS.Timeout | null = null;

  let acceptingLiveFrames = true;
  let finish:
    | ((result: { reason: string; outcome: ProbeOutcome }) => void)
    | undefined;
  let settled = false;
  const finishOnce = (result: { reason: string; outcome: ProbeOutcome }): void => {
    if (settled) return;
    settled = true;
    acceptingLiveFrames = false;
    finish?.(result);
  };

  const parseTick: WsTickParser = makeBridgeParser((tick) => {
    liveFrameCount += 1;
    parsedTickCount += 1;
    parsedTickSummary = summarizeTick(tick);
  }, () => acceptingLiveFrames);

  try {
    if (credentials === undefined) {
      throw new SafeTransportError(safeError!);
    }

    const collection = new Promise<{ reason: string; outcome: ProbeOutcome }>(
      (resolvePromise) => {
        finish = resolvePromise;
      },
    );

    const timeout = setTimeout(() => {
      finishOnce({
        reason: 'no_live_tick_observed',
        outcome: 'no_live_tick_observed',
      });
    }, NO_TICK_TIMEOUT_MS);

    priceStore.on('price-update', (price) => {
      if (price.ticker !== TICKER) return;
      if (price.source !== 'ws-integrated') {
        finishOnce({ reason: 'unexpected_price_source', outcome: 'apply_failed' });
        return;
      }
      appliedPriceSummary = summarizePrice(price);
      if (sseEvents.length >= MAX_APPLY_EVENTS) {
        finishOnce({ reason: 'apply_limit_reached', outcome: 'ok' });
        return;
      }
      if (firstApplyGraceTimer === null) {
        firstApplyGraceTimer = setTimeout(() => {
          finishOnce({ reason: 'first_apply_grace_elapsed', outcome: 'ok' });
        }, FIRST_APPLY_GRACE_MS);
      }
    });

    const restClient = createKisRestClient({
      isPaper: credentials.isPaper,
      maxAttempts: 1,
    });
    const issuer = createApprovalIssuer({
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      transport: {
        request: async <T,>(req: ApprovalRequest): Promise<T> => {
          try {
            return await restClient.request<T>(req);
          } catch (err: unknown) {
            throw new SafeTransportError(toSafeError(err, 'approval_request_failed'));
          }
        },
      },
    });

    wsClient = createKisWsClient({
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

    wsClient.onMessage((raw) => {
      const control = parseControlFrame(raw);
      if (control !== null) {
        controlFrames.push(control);
        if (control.trId === TR_ID || control.trKey === TICKER) {
          if (control.rtCd === '0') subscribeAck = 'success';
          if (control.rtCd !== null && control.rtCd !== '0') {
            subscribeAck = 'failure';
            finishOnce({
              reason: `subscribe_failed:${control.msgCd ?? 'unknown'}`,
              outcome: 'subscribe_failed',
            });
          }
        }
      }
    });

    bridge = createRealtimeBridge({
      wsClient,
      priceStore,
      parseTick,
      trId: TR_ID,
      applyTicksToPriceStore: true,
    });
    bridge.on('parse-error', (message) => {
      safeError = { code: 'parse_error', message: sanitizeText(message) };
      finishOnce({ reason: 'parse_error', outcome: 'parse_failed' });
    });
    bridge.on('apply-error', (message) => {
      safeError = { code: 'apply_error', message: sanitizeText(message) };
      finishOnce({ reason: 'apply_error', outcome: 'apply_failed' });
    });

    websocketConnectionAttemptCount += 1;
    await bridge.connect();
    websocketConnected = true;

    subscribeAttempted = true;
    await bridge.applyDiff({ subscribe: [TICKER], unsubscribe: [] });
    subscribeSent = true;

    const collectionResult = await collection;
    clearTimeout(timeout);
    if (firstApplyGraceTimer !== null) {
      clearTimeout(firstApplyGraceTimer);
      firstApplyGraceTimer = null;
    }
    collectionReason = collectionResult.reason;
    outcome = collectionResult.outcome;
  } catch (err: unknown) {
    safeError = toSafeError(err, 'probe_failed');
    if (approvalKeyCallCount === 0 || safeError.code.includes('approval')) {
      outcome = 'approval_failed';
    } else if (subscribeAttempted && !subscribeSent) {
      outcome = 'subscribe_failed';
    } else if (liveFrameCount > 0 && getSetPriceCount() === 0) {
      outcome = 'apply_failed';
    } else {
      outcome = websocketConnected ? 'subscribe_failed' : 'websocket_failed';
    }
    collectionReason = safeError.code;
  } finally {
    if (firstApplyGraceTimer !== null) clearTimeout(firstApplyGraceTimer);
    if (bridge !== null) {
      try {
        if (subscribeSent) {
          await bridge.applyDiff({ subscribe: [], unsubscribe: [TICKER] });
        }
      } catch (err: unknown) {
        safeError = safeError ?? toSafeError(err, 'unsubscribe_failed');
      }
      try {
        await bridge.disconnectAll();
      } catch (err: unknown) {
        safeError = safeError ?? toSafeError(err, 'disconnect_failed');
      }
    } else if (wsClient !== null) {
      try {
        await wsClient.disconnect('manual');
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
    websocketConnectionAttemptCount,
    websocketConnected,
    subscribe: {
      attempted: subscribeAttempted,
      sent: subscribeSent,
      ack: subscribeAck,
      controlFrames,
    },
    liveFrameCount,
    parsedTickCount,
    priceStoreSetPriceCount: getSetPriceCount(),
    ssePriceUpdateCount: sseEvents.length,
    collectionReason,
    parsedTickSummary,
    appliedPriceSummary,
    sseEventSummary,
    stalePolicy: {
      checkedInProbeHarness: true,
      passed: stalePolicyPassed,
    },
    integrationGuard: {
      isolatedHarness: true,
      productionPriceStoreTouched: false,
      productionSseTouched: false,
      uiTouched: false,
      websocketEnabledDefaultChanged: false,
      persistedSettingsChanged: false,
      reconnectLoop: false,
    },
    finalWsStatus: wsClient?.getStatus() ?? null,
    ...(safeError !== undefined ? { error: safeError } : {}),
  };

  const reportJson = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);
  assertNoSecretLikeText('probe stdout JSON', reportJson);
  assertNoSecretLikeText('probe markdown report', markdown);
  await writeText(REPORT_PATH, markdown);

  console.log(reportJson);
  console.error(`[probe] report written to ${REPORT_PATH}`);

  const ok =
    outcome === 'ok' ||
    outcome === 'no_live_tick_observed';
  process.exit(ok ? 0 : 1);
}

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[probe] fatal: ${sanitizeText(msg)}`);
  process.exit(3);
});
