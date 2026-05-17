/**
 * Browser-assisted Toss overview signal request-body capture.
 *
 * Purpose:
 * - Use an already-captured Toss persistent session.
 * - Open an isolated Chrome profile and observe the Toss stock page.
 * - Capture only the POST body for /api/v2/dashboard/wts/overview/signals.
 * - Convert it to a sanitized placeholder template.
 * - Print only metadata. Raw body/template/session values are never printed.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-signal-capture.mts \
 *     --ticker=005930 --name=삼성전자 \
 *     --write-template-file=/tmp/araon-toss-signal-template.json
 *   npx tsx scripts/internal/probes/probe-toss-signal-capture.mts \
 *     --endpoint-path=/api/v1/dashboard/intelligences/all
 *
 * The probe cycles through stock detail route variants and performs bounded
 * scroll/tab/button interactions. If the endpoint is still not observed,
 * interact with the opened Chrome window until the stock overview/signal
 * surface loads, then wait for the probe to finish.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runTossSignalCaptureSmoke,
  type TossSignalCaptureCandidateEndpoint,
  type TossSignalCaptureEndpointPath,
  type TossSignalCaptureObservationDetails,
  type TossSignalCaptureSmokeRequestInput,
} from '../../../src/server/toss/toss-signal-capture-smoke.js';
import { tossCookieInstallParams } from '../../../src/server/toss/toss-browser-session.js';
import { createFileTossSessionStore, type TossSession } from '../../../src/server/toss/toss-session-store.js';

const TOSS_ORIGIN = 'https://www.tossinvest.com';
const DEFAULT_TOSS_SIGNAL_PATH: TossSignalCaptureEndpointPath =
  '/api/v2/dashboard/wts/overview/signals';
const TOSS_SIGNAL_CAPTURE_ENDPOINTS = new Set<TossSignalCaptureEndpointPath>([
  '/api/v2/dashboard/wts/overview/signals',
  '/api/v1/dashboard/intelligences/all',
]);
const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function booleanArg(name: string): boolean | undefined {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function boundedIntegerArg(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const writeTemplateFile = argValue('write-template-file');
  const report = await runTossSignalCaptureSmoke({
    sessionStatus: () => sessionStore.status(),
    ticker: argValue('ticker'),
    name: argValue('name'),
    endpointPath: endpointPathArg(),
    timeoutMs: boundedIntegerArg('timeout-ms', DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    headless: booleanArg('headless'),
    captureRequestBody: (input) => captureWithIsolatedChrome(sessionStore.load, input),
    ...(writeTemplateFile === undefined
      ? {}
      : {
          writeTemplate: async (templateJson: string) => {
            await writeFile(writeTemplateFile, `${templateJson}\n`, { mode: 0o600 });
          },
        }),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'captured') {
    process.exitCode = 0;
  } else if (report.outcome === 'session_required' || report.outcome === 'capture_not_observed') {
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}

function endpointPathArg(): TossSignalCaptureEndpointPath {
  const raw = argValue('endpoint-path');
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_TOSS_SIGNAL_PATH;
  const trimmed = raw.trim() as TossSignalCaptureEndpointPath;
  return TOSS_SIGNAL_CAPTURE_ENDPOINTS.has(trimmed)
    ? trimmed
    : DEFAULT_TOSS_SIGNAL_PATH;
}

async function captureWithIsolatedChrome(
  loadSession: () => Promise<TossSession | null>,
  input: TossSignalCaptureSmokeRequestInput,
): Promise<TossSignalCaptureObservationDetails> {
  const session = await loadSession();
  if (session === null) return { rawBody: null, candidateEndpoints: [] };

  const port = await getFreePort();
  const profilePath = await mkdtemp(join(tmpdir(), 'araon-toss-signal-capture-'));
  let cdp: CdpClient | null = null;
  try {
    spawnChrome({
      port,
      profilePath,
      headless: input.headless === true,
      url: 'about:blank',
    });
    await waitForChrome(port);
    const target = await getPageTarget(port);
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Network.enable');
    await blockRouteNavigations(cdp, input.blockedRoutePathPrefixes);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await installSession(cdp, session);

    let observed = false;
    const bodyPromise = waitForSignalsRequestBody(cdp, input.timeoutMs, input.endpointPath)
      .then((body) => {
        observed = body.rawBody !== null;
        return body;
      });
    await cdp.send('Page.navigate', {
      url: `${TOSS_ORIGIN}/stocks/${encodeURIComponent(input.productCode)}`,
    });
    await cdp.send('Page.bringToFront').catch(() => {});
    void runSignalsSurfaceInteractionPlan(cdp, input, () => observed)
      .catch(() => {});
    return await bodyPromise;
  } finally {
    cdp?.close();
    killChromeByProfile(profilePath);
    await sleep(500).catch(() => {});
    await rm(profilePath, { recursive: true, force: true }).catch(() => {});
  }
}

async function blockRouteNavigations(
  cdp: CdpClient,
  pathPrefixes: readonly string[],
): Promise<void> {
  const urls = pathPrefixes
    .filter((pathPrefix) => pathPrefix.startsWith('/'))
    .map((pathPrefix) => `${TOSS_ORIGIN}${pathPrefix}*`);
  if (urls.length === 0) return;
  await cdp.send('Network.setBlockedURLs', { urls }).catch(() => {});
}

async function installSession(cdp: CdpClient, session: TossSession): Promise<void> {
  for (const cookie of tossCookieInstallParams(session.cookies)) {
    await cdp.send('Network.setCookie', {
      ...cookie,
    }).catch(() => {});
  }
  await cdp.send('Page.navigate', { url: TOSS_ORIGIN });
  await waitForPageOrigin(cdp, TOSS_ORIGIN);
  await evaluate(cdp, `
    (() => {
      const local = ${JSON.stringify(session.localStorage)};
      const sessionValues = ${JSON.stringify(session.sessionStorage)};
      for (const [key, value] of Object.entries(local)) window.localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(sessionValues)) window.sessionStorage.setItem(key, value);
      return true;
    })()
  `);
}

function waitForSignalsRequestBody(
  cdp: CdpClient,
  timeoutMs: number,
  endpointPath: TossSignalCaptureEndpointPath,
): Promise<TossSignalCaptureObservationDetails> {
  return new Promise((resolve) => {
    let done = false;
    const candidates = new Map<string, TossSignalCaptureCandidateEndpoint>();
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({
        rawBody: null,
        candidateEndpoints: Array.from(candidates.values()),
      });
    }, timeoutMs);

    cdp.on('Network.requestWillBeSent', (params) => {
      if (done) return;
      const request = asRecord(params['request']);
      const url = typeof request?.['url'] === 'string' ? request['url'] : '';
      const method = typeof request?.['method'] === 'string' ? request['method'] : '';
      recordCandidateEndpoint(candidates, method, url);
      if (method.toUpperCase() !== 'POST' || !isCaptureTargetUrl(url, endpointPath)) return;
      const postData = typeof request?.['postData'] === 'string'
        ? request['postData']
        : null;
      if (postData !== null) {
        done = true;
        clearTimeout(timer);
        resolve({
          rawBody: postData,
          candidateEndpoints: Array.from(candidates.values()),
        });
        return;
      }
      const requestId = typeof params['requestId'] === 'string' ? params['requestId'] : null;
      if (requestId === null) return;
      cdp.send('Network.getRequestPostData', { requestId })
        .then((result) => {
          if (done) return;
          const data = asRecord(result);
          const body = typeof data?.['postData'] === 'string' ? data['postData'] : null;
          if (body === null) return;
          done = true;
          clearTimeout(timer);
          resolve({
            rawBody: body,
            candidateEndpoints: Array.from(candidates.values()),
          });
        })
        .catch(() => {});
    });
  });
}

function isCaptureTargetUrl(
  rawUrl: string,
  endpointPath: TossSignalCaptureEndpointPath,
): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname === endpointPath;
  } catch {
    return false;
  }
}

function recordCandidateEndpoint(
  candidates: Map<string, TossSignalCaptureCandidateEndpoint>,
  method: string,
  rawUrl: string,
): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return;
  }
  if (!isTossSignalCandidateHost(url.hostname)) return;
  if (!isTossSignalCandidatePath(url.pathname)) return;
  const normalizedMethod = method.toUpperCase() === 'GET' || method.toUpperCase() === 'POST'
    ? method.toUpperCase() as 'GET' | 'POST'
    : 'UNKNOWN';
  const key = `${normalizedMethod} ${url.hostname}${url.pathname}`;
  const existing = candidates.get(key);
  candidates.set(key, {
    method: normalizedMethod,
    host: url.hostname,
    path: url.pathname,
    count: (existing?.count ?? 0) + 1,
  });
}

function isTossSignalCandidateHost(hostname: string): boolean {
  return hostname === 'wts-info-api.tossinvest.com' ||
    hostname === 'wts-cert-api.tossinvest.com' ||
    hostname === 'www.tossinvest.com';
}

function isTossSignalCandidatePath(pathname: string): boolean {
  return pathname.includes('signal') ||
    pathname.includes('intelligence') ||
    pathname.includes('reasoning') ||
    pathname.includes('analysis');
}

async function runSignalsSurfaceInteractionPlan(
  cdp: CdpClient,
  input: TossSignalCaptureSmokeRequestInput,
  isDone: () => boolean,
): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  const stockUrl = `${TOSS_ORIGIN}/stocks/${encodeURIComponent(input.productCode)}`;
  const orderUrl = `${stockUrl}/order`;
  await sleep(2_000);
  let step = 0;
  while (!isDone() && Date.now() < deadline) {
    if (await isCommunityPage(cdp)) {
      await cdp.send('Page.navigate', { url: stockUrl }).catch(() => {});
      await sleep(1_000);
      continue;
    }
    if (step === 2) {
      await cdp.send('Page.navigate', { url: orderUrl }).catch(() => {});
      await sleep(1_000);
    } else if (step === 8) {
      await cdp.send('Page.navigate', { url: stockUrl }).catch(() => {});
      await sleep(1_000);
    }
    await evaluate(cdp, signalCaptureInteractionExpression(step)).catch(() => {});
    step += 1;
    await sleep(1_500);
  }
}

async function isCommunityPage(cdp: CdpClient): Promise<boolean> {
  return await evaluate(cdp, `window.location.pathname.startsWith('/community')`)
    .then((value) => value === true)
    .catch(() => false);
}

function signalCaptureInteractionExpression(step: number): string {
  return `
    (() => {
      const labels = [
        '시그널',
        '뉴스',
        '공시',
        '종목정보',
        '왜 올랐',
        '한 줄 요약',
        '거래현황',
        '호가'
      ];
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity || '1') > 0;
      };
      const clickable = Array.from(document.querySelectorAll(
        'button,a,[role="button"],[role="tab"],[tabindex]'
      )).filter((el) => {
        if (!isVisible(el)) return false;
        if (el instanceof HTMLAnchorElement && el.href.includes('/community')) return false;
        return !(el.closest('a[href*="/community"]'));
      });
      const label = labels[${step} % labels.length];
      const match = clickable.find((el) => (el.textContent || '').includes(label));
      if (match instanceof HTMLElement) {
        match.click();
        return true;
      }
      const direction = ${step} % 3 === 2 ? -1 : 1;
      window.scrollBy({ top: Math.max(240, window.innerHeight * 0.75) * direction, behavior: 'auto' });
      return true;
    })()
  `;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

async function waitForPageOrigin(cdp: CdpClient, origin: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ok = await evaluate(cdp, `window.location.origin === ${JSON.stringify(origin)}`)
      .catch(() => false);
    if (ok === true) return;
    await sleep(300);
  }
  throw new Error('TOSS_SIGNAL_CAPTURE_PAGE_ORIGIN_TIMEOUT');
}

async function waitForChrome(port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('TOSS_SIGNAL_CAPTURE_CHROME_TIMEOUT');
}

async function getPageTarget(port: number): Promise<{ webSocketDebuggerUrl: string }> {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`) as Array<{
    type?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
  }>;
  const match = targets.find((target) =>
    target.type === 'page' &&
    target.webSocketDebuggerUrl !== undefined);
  if (match?.webSocketDebuggerUrl !== undefined) {
    return { webSocketDebuggerUrl: match.webSocketDebuggerUrl };
  }
  const created = await fetchJson(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  ) as { webSocketDebuggerUrl?: string };
  if (created.webSocketDebuggerUrl === undefined) {
    throw new Error('TOSS_SIGNAL_CAPTURE_TARGET_FAILED');
  }
  return { webSocketDebuggerUrl: created.webSocketDebuggerUrl };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`CDP HTTP returned ${res.status}`);
  return res.json();
}

async function evaluate(cdp: CdpClient, expression: string): Promise<unknown> {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }) as {
    result?: { value?: unknown };
    exceptionDetails?: { text?: string };
  };
  if (result.exceptionDetails !== undefined) {
    throw new Error('TOSS_SIGNAL_CAPTURE_EVALUATE_FAILED');
  }
  return result.result?.value;
}

function spawnChrome(options: {
  readonly port: number;
  readonly profilePath: string;
  readonly headless: boolean;
  readonly url: string;
}): void {
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profilePath}`,
    '--window-size=1280,900',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (options.headless) args.push('--headless=new');
  args.push(options.url);

  if (process.platform === 'darwin') {
    const child = spawn('open', ['-na', 'Google Chrome', '--args', ...args], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return;
  }

  const executable = process.platform === 'win32' ? 'chrome.exe' : 'google-chrome';
  const child = spawn(executable, args, {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

function killChromeByProfile(profilePath: string): void {
  if (process.platform === 'win32') return;
  const child = spawn('pkill', ['-f', profilePath], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

class CdpClient {
  private seq = 1;
  private ws: CdpWebSocket | null = null;
  private readonly pending = new Map<number, {
    method: string;
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
  }>();
  private readonly handlers = new Map<string, Array<(params: Record<string, unknown>) => void>>();

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    const Ws = globalThis.WebSocket as unknown as CdpWebSocketConstructor;
    this.ws = new Ws(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TOSS_SIGNAL_CAPTURE_CDP_TIMEOUT')), 10_000);
      this.ws?.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws?.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('TOSS_SIGNAL_CAPTURE_CDP_ERROR'));
      }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { message?: string };
      };
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry === undefined) return;
        this.pending.delete(msg.id);
        if (msg.error !== undefined) {
          entry.reject(new Error(`${entry.method}: CDP error`));
          return;
        }
        entry.resolve(msg.result);
        return;
      }
      if (msg.method === undefined) return;
      for (const handler of this.handlers.get(msg.method) ?? []) {
        handler(msg.params ?? {});
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.ws === null) {
      return Promise.reject(new Error('TOSS_SIGNAL_CAPTURE_CDP_NOT_CONNECTED'));
    }
    const id = this.seq;
    this.seq += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
  }

  on(method: string, handler: (params: Record<string, unknown>) => void): void {
    const existing = this.handlers.get(method) ?? [];
    existing.push(handler);
    this.handlers.set(method, existing);
  }

  close(): void {
    const Ws = globalThis.WebSocket as unknown as CdpWebSocketConstructor;
    if (this.ws?.readyState === Ws.OPEN) this.ws.close();
  }
}

interface CdpWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(event: 'open', handler: () => void, opts?: { once?: boolean }): void;
  addEventListener(event: 'error', handler: () => void, opts?: { once?: boolean }): void;
  addEventListener(
    event: 'message',
    handler: (event: { data: unknown }) => void,
    opts?: { once?: boolean },
  ): void;
}

interface CdpWebSocketConstructor {
  readonly OPEN: number;
  new(url: string): CdpWebSocket;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
          return;
        }
        reject(new Error('TOSS_SIGNAL_CAPTURE_PORT_FAILED'));
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    surface: 'overview-signals',
    outcome: 'failed',
    errorCode: 'TOSS_SIGNAL_CAPTURE_PROBE_FAILED',
    rawCandidateExposed: false,
    rawTemplateExposed: false,
    templateWritten: false,
  }));
  process.exitCode = 1;
});
