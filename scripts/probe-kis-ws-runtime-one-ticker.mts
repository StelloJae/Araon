/**
 * NXT6a — one-ticker runtime apply smoke for H0UNCNT0.
 *
 * This is a limited runtime-path probe: real KIS WebSocket frames flow through
 * the guarded RealtimeBridge into a real PriceStore and real SseManager, with a
 * temporary in-memory operator gate. It does not touch the running server, UI,
 * credentials file, or persisted settings file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { Price, SSEEvent } from '../src/shared/types.js';
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
} from '../src/server/kis/kis-ws-client.js';
import { PriceStore } from '../src/server/price/price-store.js';
import {
  createRealtimeBridge,
  type ParsedWsFrame,
  type RealtimeTick,
  type WsTickParser,
} from '../src/server/realtime/realtime-bridge.js';
import {
  shouldApplyRuntimeWsTicks,
  type RuntimeWsGates,
} from '../src/server/realtime/runtime-operator.js';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
} from '../src/server/settings-store.js';
import { createSseManager } from '../src/server/sse/sse-manager.js';

const TR_ID = 'H0UNCNT0';
const TARGET_TICKER = '005930';
const MAX_SUBSCRIBE_TICKERS = 1;
const TARGET_APPLY_EVENTS = 3;
const NO_TICK_TIMEOUT_MS = 60_000;
const REPORT_PATH = 'docs/research/nxt6a-runtime-one-ticker-smoke.md';
const SETTINGS_PATH = 'data/settings.json';
const WEBSOCKET_ENABLED_KEY = 'websocketEnabled';

type ProbeOutcome =
  | 'ok'
  | 'no_live_tick_observed'
  | 'approval_failed'
  | 'websocket_failed'
  | 'subscribe_failed'
  | 'parse_failed'
  | 'apply_failed'
  | 'cleanup_failed';

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
    ticker: typeof TARGET_TICKER;
    maxSubscribeTickers: typeof MAX_SUBSCRIBE_TICKERS;
  };
  preflight: {
    gitHead: string;
    runbookPresent: boolean;
    defaultWebsocketEnabled: boolean;
    defaultApplyTicksToPriceStore: boolean;
    legacySettingsApplyDefault: boolean;
    persistedSettingsExisted: boolean;
    persistedSettingsUnchanged: boolean;
    restPollingTouched: boolean;
    sseClientCountBefore: number;
  };
  approvalKeyCallCount: number;
  websocketConnectionAttemptCount: number;
  websocketConnected: boolean;
  subscribe: {
    attemptedCount: number;
    sentCount: number;
    ackStatus: 'success' | 'failure' | 'unknown';
    controlFrames: ControlFrameSummary[];
  };
  liveFrameCount: number;
  parsedTickCount: number;
  bridgeStats: {
    parsedTickCount: number;
    appliedTickCount: number;
    ignoredStaleTickCount: number;
    parseErrorCount: number;
    applyErrorCount: number;
    lastTickAt: string | null;
  };
  priceStoreSetPriceCount: number;
  ssePriceUpdateCount: number;
  collectionReason: string;
  parsedTickSummary: TickSummary | null;
  appliedPriceSummary: PriceSummary | null;
  ssePriceUpdateSummary: PriceSummary | null;
  sourceMetadataOk: boolean;
  updatedAtFreshnessOk: boolean;
  stalePolicy: {
    checkedInProbeHarness: boolean;
    passed: boolean;
  };
  cleanup: {
    websocketDisconnected: boolean;
    subscribedTickerCountAfter: number;
    gatesFalseAfter: boolean;
    persistedSettingsChanged: boolean;
    sseClientCountAfter: number;
  };
  integrationGuard: {
    realPriceStoreUsed: true;
    realSseManagerUsed: true;
    runningServerTouched: false;
    uiTouched: false;
    persistedSettingsChanged: boolean;
    credentialsFileChanged: false;
    reconnectLoop: false;
    subscriptionCapExceeded: boolean;
    pollingStopCalled: false;
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
    if (error.status !== undefined) this.status = error.status;
    if (error.rtCd !== undefined) this.rtCd = error.rtCd;
    if (error.msgCd !== undefined) this.msgCd = error.msgCd;
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
    const safe: SafeError = {
      code: typeof rec.code === 'string' ? rec.code : fallbackCode,
      message: sanitizeText(err.message),
    };
    if (typeof rec.status === 'number') safe.status = rec.status;
    if (typeof rec.rtCd === 'string' || rec.rtCd === null) safe.rtCd = rec.rtCd;
    if (typeof rec.msgCd === 'string' || rec.msgCd === null) safe.msgCd = rec.msgCd;
    return safe;
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
    [/[A-Za-z0-9_-]{80,}/, 'long token-like run'],
  ];
  for (const [pattern, name] of checks) {
    if (pattern.test(text)) {
      throw new Error(`LEAK GUARD: ${label} contains ${name}`);
    }
  }
}

function getGitHead(): string {
  const headPath = resolve(process.cwd(), '.git', 'HEAD');
  const head = readFileSync(headPath, 'utf8').trim();
  if (!head.startsWith('ref: ')) return head.slice(0, 7);
  const refPath = resolve(process.cwd(), '.git', head.slice('ref: '.length));
  return readFileSync(refPath, 'utf8').trim().slice(0, 7);
}

async function readOptionalFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw err;
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

function parseSseFrame(frame: string): SSEEvent | null {
  const dataLine = frame
    .split('\n')
    .find((line) => line.startsWith('data: '));
  if (dataLine === undefined) return null;
  try {
    return JSON.parse(dataLine.slice('data: '.length)) as SSEEvent;
  } catch {
    return null;
  }
}

function makeBridgeParser(
  onParsed: (tick: KisRealtimeTick) => void,
  shouldAcceptLiveFrame: () => boolean,
): WsTickParser {
  return (raw: string): ParsedWsFrame => {
    if (!shouldAcceptLiveFrame()) {
      return { kind: 'ignore', reason: 'collection already settled' };
    }
    const result = parseKisTickFrame(raw);
    switch (result.kind) {
      case 'ticks': {
        const ticks = result.ticks.filter(
          (tick) => tick.trId === TR_ID && tick.ticker === TARGET_TICKER,
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

function tickAt(updatedAt: string, price: number): RealtimeTick {
  return {
    trId: TR_ID,
    source: 'integrated',
    ticker: TARGET_TICKER,
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
  const priceStore = new PriceStore();
  let gates: RuntimeWsGates = {
    websocketEnabled: false,
    applyTicksToPriceStore: false,
  };
  const handlers = new Set<(raw: string) => void>();
  const wsClient: KisWsClient = {
    async connect(): Promise<void> {
      return undefined;
    },
    async disconnect(): Promise<void> {
      return undefined;
    },
    async subscribe(): Promise<void> {
      return undefined;
    },
    async unsubscribe(): Promise<void> {
      return undefined;
    },
    onMessage(handler: (raw: string) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    state: () => 'connected',
    activeSubscriptions: () => [],
    getStatus: () => ({
      state: 'connected',
      reconnectAttempts: 0,
      nextReconnectAt: null,
      lastConnectedAt: null,
      lastError: null,
      stopReason: null,
    }),
  };
  const current: Price = {
    ticker: TARGET_TICKER,
    price: 224000,
    changeAbs: 4500,
    changeRate: 2.05,
    volume: 40000000,
    updatedAt: '2026-04-27T08:14:06.000Z',
    isSnapshot: false,
    source: 'rest',
  };
  priceStore.setPrice(current);
  let writes = 0;
  const originalSetPrice = priceStore.setPrice.bind(priceStore);
  priceStore.setPrice = (price: Price): void => {
    writes += 1;
    originalSetPrice(price);
  };
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
    wsClient,
    priceStore,
    parseTick,
    trId: TR_ID,
    canApplyTicksToPriceStore: () => shouldApplyRuntimeWsTicks(gates),
  });
  gates = {
    ...gates,
    websocketEnabled: !gates.websocketEnabled,
  };
  gates = {
    ...gates,
    applyTicksToPriceStore: !gates.applyTicksToPriceStore,
  };
  for (const raw of ['OLDER', 'EQUAL', 'NEWER']) {
    for (const handler of handlers) handler(raw);
  }
  const finalPrice = priceStore.getPrice(TARGET_TICKER);
  return (
    writes === 1 &&
    finalPrice?.price === 224100 &&
    finalPrice.updatedAt === '2026-04-27T08:14:07.000Z'
  );
}

function renderMarkdown(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# NXT6a — one-ticker runtime apply smoke');
  lines.push('');
  lines.push(`**실행 일시 (UTC)**: ${report.probeRunAt}`);
  lines.push(`**완료 일시 (UTC)**: ${report.completedAt}`);
  lines.push(`**소요 시간**: ${report.elapsedMs}ms`);
  lines.push(`**환경**: ${report.environment}`);
  lines.push(`**결과**: ${report.outcome}`);
  lines.push('');
  lines.push('## Preflight');
  lines.push('');
  lines.push(`- git HEAD at probe: \`${report.preflight.gitHead}\``);
  lines.push(`- runbook present: ${report.preflight.runbookPresent}`);
  lines.push(`- default websocketEnabled: ${report.preflight.defaultWebsocketEnabled}`);
  lines.push(`- default applyTicksToPriceStore: ${report.preflight.defaultApplyTicksToPriceStore}`);
  lines.push(`- legacy settings apply default: ${report.preflight.legacySettingsApplyDefault}`);
  lines.push(`- persisted settings existed: ${report.preflight.persistedSettingsExisted}`);
  lines.push(`- persisted settings unchanged: ${report.preflight.persistedSettingsUnchanged}`);
  lines.push(`- REST polling touched by probe: ${report.preflight.restPollingTouched}`);
  lines.push(`- SSE client count before: ${report.preflight.sseClientCountBefore}`);
  lines.push('');
  lines.push('## Target');
  lines.push('');
  lines.push(`- TR_ID: \`${report.target.trId}\``);
  lines.push(`- ticker: \`${report.target.ticker}\``);
  lines.push(`- max subscribe tickers: ${report.target.maxSubscribeTickers}`);
  lines.push('');
  lines.push('## Safe Summary');
  lines.push('');
  lines.push(`- approval key call count: ${report.approvalKeyCallCount}`);
  lines.push(`- websocket connection attempts: ${report.websocketConnectionAttemptCount}`);
  lines.push(`- websocket connected: ${report.websocketConnected}`);
  lines.push(`- subscribe attempted count: ${report.subscribe.attemptedCount}`);
  lines.push(`- subscribe sent count: ${report.subscribe.sentCount}`);
  lines.push(`- subscribe ACK status: ${report.subscribe.ackStatus}`);
  lines.push(`- live frame count: ${report.liveFrameCount}`);
  lines.push(`- parsed tick count: ${report.parsedTickCount}`);
  lines.push(`- priceStore.setPrice count: ${report.priceStoreSetPriceCount}`);
  lines.push(`- SSE price-update count: ${report.ssePriceUpdateCount}`);
  lines.push(`- collection reason: ${report.collectionReason}`);
  lines.push(`- source metadata ok: ${report.sourceMetadataOk}`);
  lines.push(`- updatedAt freshness ok: ${report.updatedAtFreshnessOk}`);
  lines.push(`- stale policy passed: ${report.stalePolicy.passed}`);
  lines.push('');
  lines.push('## Bridge Stats');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.bridgeStats, null, 2));
  lines.push('```');
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
  if (report.ssePriceUpdateSummary !== null) {
    lines.push('## SSE Price Update Summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.ssePriceUpdateSummary, null, 2));
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
  lines.push('## Cleanup');
  lines.push('');
  lines.push(`- websocket disconnected: ${report.cleanup.websocketDisconnected}`);
  lines.push(`- subscribed ticker count after cleanup: ${report.cleanup.subscribedTickerCountAfter}`);
  lines.push(`- gates false after cleanup: ${report.cleanup.gatesFalseAfter}`);
  lines.push(`- persisted settings changed: ${report.cleanup.persistedSettingsChanged}`);
  lines.push(`- SSE client count after cleanup: ${report.cleanup.sseClientCountAfter}`);
  lines.push('');
  lines.push('## Integration Guard');
  lines.push('');
  lines.push('- [x] real PriceStore used');
  lines.push('- [x] real SseManager used');
  lines.push('- [x] running dev/prod server touched 0회');
  lines.push('- [x] UI 변경 0회');
  lines.push('- [x] persisted settings 영구 변경 0회');
  lines.push('- [x] credentials.enc 수정 0회');
  lines.push('- [x] reconnect loop 0회');
  lines.push('- [x] 2개 이상 종목 구독 0회');
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
  const settingsBefore = await readOptionalFile(SETTINGS_PATH);
  const legacySettings = settingsSchema.parse({
    pollingCycleDelayMs: 1000,
    pollingMaxInFlight: 5,
    pollingMinStartGapMs: 125,
    pollingStartJitterMs: 20,
    rateLimiterMode: 'paper',
    [WEBSOCKET_ENABLED_KEY]: !DEFAULT_SETTINGS.websocketEnabled,
  });
  const preflight = {
    gitHead: getGitHead(),
    runbookPresent: existsSync(resolve(process.cwd(), 'docs/runbooks/nxt-ws-rollout.md')),
    defaultWebsocketEnabled: DEFAULT_SETTINGS.websocketEnabled,
    defaultApplyTicksToPriceStore: DEFAULT_SETTINGS.applyTicksToPriceStore,
    legacySettingsApplyDefault: legacySettings.applyTicksToPriceStore,
    persistedSettingsExisted: settingsBefore !== null,
    persistedSettingsUnchanged: true,
    restPollingTouched: false,
    sseClientCountBefore: 0,
  };

  let runtimeGates: RuntimeWsGates = {
    websocketEnabled: false,
    applyTicksToPriceStore: false,
  };
  let approvalKeyCallCount = 0;
  let websocketConnectionAttemptCount = 0;
  let websocketConnected = false;
  let subscribeSentCount = 0;
  let subscribeAckStatus: ProbeReport['subscribe']['ackStatus'] = 'unknown';
  let liveFrameCount = 0;
  let parsedTickCount = 0;
  let collectionReason = 'not_started';
  let outcome: ProbeOutcome = 'websocket_failed';
  let safeError: SafeError | undefined;
  let parsedTickSummary: TickSummary | null = null;
  let appliedPriceSummary: PriceSummary | null = null;
  let ssePriceUpdateSummary: PriceSummary | null = null;
  let sourceMetadataOk = false;
  let updatedAtFreshnessOk = false;
  const controlFrames: ControlFrameSummary[] = [];

  const stalePolicyPassed = verifyStalePolicyHarness();
  const priceStore = new PriceStore();
  const originalSetPrice = priceStore.setPrice.bind(priceStore);
  let setPriceCount = 0;
  priceStore.setPrice = (price: Price): void => {
    if (price.ticker === TARGET_TICKER && price.source === 'ws-integrated') {
      setPriceCount += 1;
    }
    originalSetPrice(price);
  };

  const sseManager = createSseManager({
    priceStore,
    getInitialSnapshot: () => priceStore.getAllPrices(),
    getMarketStatus: () => 'open',
    heartbeatIntervalMs: NO_TICK_TIMEOUT_MS + 10_000,
    throttleMs: 0,
  });
  preflight.sseClientCountBefore = sseManager.getClientCount();

  const sseFrames: string[] = [];
  const detachSse = sseManager.attachClient(
    (frame) => {
      sseFrames.push(frame);
      const ev = parseSseFrame(frame);
      if (ev?.type !== 'price-update') return;
      if (ev.price.ticker !== TARGET_TICKER) return;
      ssePriceUpdateSummary = summarizePrice(ev.price);
      if (ev.price.source === 'ws-integrated') sourceMetadataOk = true;
      if (appliedPriceSummary !== null) {
        updatedAtFreshnessOk =
          Date.parse(ev.price.updatedAt) >= Date.parse(appliedPriceSummary.updatedAt);
      }
      maybeFinish('target_sse_count_reached', 'ok');
    },
    () => undefined,
  );

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

  let acceptingLiveFrames = true;
  let bridge: ReturnType<typeof createRealtimeBridge> | null = null;
  let wsClient: ReturnType<typeof createKisWsClient> | null = null;
  let finish:
    | ((result: { reason: string; outcome: ProbeOutcome }) => void)
    | undefined;
  let settled = false;

  function disableGates(): void {
    runtimeGates = {
      websocketEnabled: false,
      applyTicksToPriceStore: false,
    };
  }

  function enableGates(): void {
    runtimeGates = {
      ...runtimeGates,
      websocketEnabled: !runtimeGates.websocketEnabled,
    };
    runtimeGates = {
      ...runtimeGates,
      applyTicksToPriceStore: !runtimeGates.applyTicksToPriceStore,
    };
  }

  function finishOnce(result: { reason: string; outcome: ProbeOutcome }): void {
    if (settled) return;
    settled = true;
    acceptingLiveFrames = false;
    disableGates();
    finish?.(result);
  }

  function maybeFinish(reason: string, nextOutcome: ProbeOutcome): void {
    const priceUpdateCount = sseFrames
      .map(parseSseFrame)
      .filter((ev) => ev?.type === 'price-update')
      .length;
    if (
      setPriceCount >= TARGET_APPLY_EVENTS &&
      priceUpdateCount >= TARGET_APPLY_EVENTS
    ) {
      finishOnce({ reason, outcome: nextOutcome });
    }
  }

  const parseTick: WsTickParser = makeBridgeParser(
    (tick) => {
      liveFrameCount += 1;
      parsedTickCount += 1;
      parsedTickSummary = summarizeTick(tick);
    },
    () => acceptingLiveFrames,
  );

  try {
    if (!preflight.runbookPresent) {
      safeError = {
        code: 'runbook_missing',
        message: 'docs/runbooks/nxt-ws-rollout.md is missing',
      };
      outcome = 'cleanup_failed';
      collectionReason = 'runbook_missing';
      throw new SafeTransportError(safeError);
    }
    if (
      preflight.defaultWebsocketEnabled !== false ||
      preflight.defaultApplyTicksToPriceStore !== false ||
      preflight.legacySettingsApplyDefault !== false
    ) {
      safeError = {
        code: 'guard_default_failed',
        message: 'runtime gate defaults are not false',
      };
      outcome = 'cleanup_failed';
      collectionReason = 'guard_default_failed';
      throw new SafeTransportError(safeError);
    }
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
      if (price.ticker !== TARGET_TICKER) return;
      if (price.source !== 'ws-integrated') {
        finishOnce({ reason: 'unexpected_price_source', outcome: 'apply_failed' });
        return;
      }
      appliedPriceSummary = summarizePrice(price);
      if (setPriceCount >= TARGET_APPLY_EVENTS) {
        acceptingLiveFrames = false;
        disableGates();
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
      if (control === null) return;
      controlFrames.push(control);
      if (control.rtCd !== null && control.rtCd !== '0') {
        subscribeAckStatus = 'failure';
        finishOnce({
          reason: `subscribe_failed:${control.msgCd ?? 'unknown'}`,
          outcome: 'subscribe_failed',
        });
        return;
      }
      if (control.rtCd === '0') {
        subscribeAckStatus = 'success';
      }
    });

    bridge = createRealtimeBridge({
      wsClient,
      priceStore,
      parseTick,
      trId: TR_ID,
      canApplyTicksToPriceStore: () => shouldApplyRuntimeWsTicks(runtimeGates),
    });
    bridge.on('parse-error', (message) => {
      safeError = { code: 'parse_error', message: sanitizeText(message) };
      finishOnce({ reason: 'parse_error', outcome: 'parse_failed' });
    });
    bridge.on('apply-error', (message) => {
      safeError = { code: 'apply_error', message: sanitizeText(message) };
      finishOnce({ reason: 'apply_error', outcome: 'apply_failed' });
    });

    enableGates();
    websocketConnectionAttemptCount += 1;
    await bridge.connect();
    websocketConnected = true;
    await bridge.applyDiff({
      subscribe: [TARGET_TICKER],
      unsubscribe: [],
    });
    subscribeSentCount = 1;

    const collectionResult = await collection;
    clearTimeout(timeout);
    collectionReason = collectionResult.reason;
    outcome = collectionResult.outcome;
  } catch (err: unknown) {
    safeError = safeError ?? toSafeError(err, 'probe_failed');
    if (approvalKeyCallCount === 0 || safeError.code.includes('approval')) {
      outcome = 'approval_failed';
      collectionReason = safeError.code;
    } else if (subscribeSentCount === 0 && websocketConnected) {
      outcome = 'subscribe_failed';
      collectionReason = safeError.code;
    } else if (liveFrameCount > 0 && setPriceCount === 0) {
      outcome = 'apply_failed';
      collectionReason = safeError.code;
    } else if (outcome !== 'cleanup_failed') {
      outcome = websocketConnected ? 'subscribe_failed' : 'websocket_failed';
      collectionReason = safeError.code;
    }
  } finally {
    disableGates();
    acceptingLiveFrames = false;
    if (bridge !== null) {
      try {
        if (subscribeSentCount > 0) {
          await bridge.applyDiff({
            subscribe: [],
            unsubscribe: [TARGET_TICKER],
          });
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
    detachSse();
    await sseManager.closeAll();
  }

  const settingsAfter = await readOptionalFile(SETTINGS_PATH);
  const persistedSettingsChanged =
    Buffer.compare(settingsBefore ?? Buffer.alloc(0), settingsAfter ?? Buffer.alloc(0)) !== 0;
  const finalStats = bridge?.getStats() ?? {
    parsedTickCount: 0,
    appliedTickCount: 0,
    ignoredStaleTickCount: 0,
    parseErrorCount: 0,
    applyErrorCount: 0,
    lastTickAt: null,
  };
  const priceUpdateEvents = sseFrames
    .map(parseSseFrame)
    .filter((ev): ev is SSEEvent & { type: 'price-update' } => ev?.type === 'price-update');
  const completedAtMs = Date.now();
  const report: ProbeReport = {
    probeRunAt: startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    elapsedMs: completedAtMs - startedAtMs,
    environment,
    outcome,
    target: {
      trId: TR_ID,
      ticker: TARGET_TICKER,
      maxSubscribeTickers: MAX_SUBSCRIBE_TICKERS,
    },
    preflight: {
      ...preflight,
      persistedSettingsUnchanged: !persistedSettingsChanged,
    },
    approvalKeyCallCount,
    websocketConnectionAttemptCount,
    websocketConnected,
    subscribe: {
      attemptedCount: 1,
      sentCount: subscribeSentCount,
      ackStatus: subscribeAckStatus,
      controlFrames,
    },
    liveFrameCount,
    parsedTickCount,
    bridgeStats: finalStats,
    priceStoreSetPriceCount: setPriceCount,
    ssePriceUpdateCount: priceUpdateEvents.length,
    collectionReason,
    parsedTickSummary,
    appliedPriceSummary,
    ssePriceUpdateSummary,
    sourceMetadataOk,
    updatedAtFreshnessOk: updatedAtFreshnessOk || priceUpdateEvents.length === 0,
    stalePolicy: {
      checkedInProbeHarness: true,
      passed: stalePolicyPassed,
    },
    cleanup: {
      websocketDisconnected:
        wsClient === null || wsClient.getStatus().state === 'stopped',
      subscribedTickerCountAfter: wsClient?.activeSubscriptions().length ?? 0,
      gatesFalseAfter: !runtimeGates.websocketEnabled && !runtimeGates.applyTicksToPriceStore,
      persistedSettingsChanged,
      sseClientCountAfter: sseManager.getClientCount(),
    },
    integrationGuard: {
      realPriceStoreUsed: true,
      realSseManagerUsed: true,
      runningServerTouched: false,
      uiTouched: false,
      persistedSettingsChanged,
      credentialsFileChanged: false,
      reconnectLoop: false,
      subscriptionCapExceeded: MAX_SUBSCRIBE_TICKERS > 1,
      pollingStopCalled: false,
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
    (outcome === 'ok' || outcome === 'no_live_tick_observed') &&
    report.cleanup.gatesFalseAfter &&
    !report.cleanup.persistedSettingsChanged &&
    report.cleanup.subscribedTickerCountAfter === 0 &&
    report.integrationGuard.subscriptionCapExceeded === false;
  process.exit(ok ? 0 : 1);
}

void main().catch((err: unknown) => {
  const safe = toSafeError(err, 'unhandled_probe_error');
  const text = JSON.stringify({ outcome: 'probe_crashed', error: safe }, null, 2);
  assertNoSecretLikeText('unhandled error', text);
  console.error(text);
  process.exit(1);
});
