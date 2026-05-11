import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

import {
  assessTossBrowserSession,
  TOSS_LOGIN_URL,
  tossSessionFromBrowserState,
  type TossBrowserState,
  type TossBrowserCookie,
} from './toss-browser-session.js';
import type { TossSessionStore } from './toss-session-store.js';

export type TossLoginJobState =
  | 'idle'
  | 'starting'
  | 'waiting_for_qr'
  | 'waiting_for_persistent'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface TossLoginStatus {
  readonly state: TossLoginJobState;
  readonly startedAt: string | null;
  readonly updatedAt: string | null;
  readonly finishedAt: string | null;
  readonly message: string | null;
  readonly persistent: boolean;
  readonly cookieCount: number;
  readonly localStorageKeyCount: number;
  readonly sessionStorageKeyCount: number;
  readonly expiresAt: string | null;
  readonly missingCookieCount: number;
  readonly missingLocalStorageKeyCount: number;
}

export interface TossLoginStartOptions {
  readonly timeoutMs?: number;
  readonly headless?: boolean;
}

export interface TossLoginService {
  start(options?: TossLoginStartOptions): Promise<TossLoginStatus>;
  status(): TossLoginStatus;
  cancel(): Promise<TossLoginStatus>;
}

interface TossCdpLoginServiceOptions {
  readonly sessionStore: TossSessionStore;
  readonly loginUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const CHROME_WIDTH = 1280;
const CHROME_HEIGHT = 900;

export function createTossCdpLoginService(
  options: TossCdpLoginServiceOptions,
): TossLoginService {
  return new TossCdpLoginService(options);
}

class TossCdpLoginService implements TossLoginService {
  private readonly sessionStore: TossSessionStore;
  private readonly loginUrl: string;
  private statusSnapshot: TossLoginStatus = idleStatus();
  private activeJob: Promise<void> | null = null;
  private activeController: AbortController | null = null;
  private activeProfilePath: string | null = null;
  private cdp: CdpClient | null = null;

  constructor(options: TossCdpLoginServiceOptions) {
    this.sessionStore = options.sessionStore;
    this.loginUrl = options.loginUrl ?? TOSS_LOGIN_URL;
  }

  async start(options: TossLoginStartOptions = {}): Promise<TossLoginStatus> {
    if (this.activeJob !== null && !isTerminal(this.statusSnapshot.state)) {
      return this.status();
    }
    const controller = new AbortController();
    this.activeController = controller;
    this.setStatus({
      state: 'starting',
      message: 'Toss login browser is starting',
      persistent: false,
      cookieCount: 0,
      localStorageKeyCount: 0,
      sessionStorageKeyCount: 0,
      expiresAt: null,
      missingCookieCount: 0,
      missingLocalStorageKeyCount: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    this.activeJob = this.run(options, controller.signal)
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          this.setStatus({
            state: 'cancelled',
            message: 'Toss login capture cancelled',
            finishedAt: new Date().toISOString(),
          });
          return;
        }
        this.setStatus({
          state: 'failed',
          message: safeErrorMessage(err),
          finishedAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        this.activeJob = null;
        this.activeController = null;
      });
    return this.status();
  }

  status(): TossLoginStatus {
    return this.statusSnapshot;
  }

  async cancel(): Promise<TossLoginStatus> {
    this.activeController?.abort();
    await this.cleanupChrome();
    if (this.activeJob !== null) {
      await this.activeJob.catch(() => {});
    }
    if (!isTerminal(this.statusSnapshot.state)) {
      this.setStatus({
        state: 'cancelled',
        message: 'Toss login capture cancelled',
        finishedAt: new Date().toISOString(),
      });
    }
    return this.status();
  }

  private async run(
    options: TossLoginStartOptions,
    signal: AbortSignal,
  ): Promise<void> {
    const timeoutMs = clampTimeoutMs(options.timeoutMs);
    const deadline = Date.now() + timeoutMs;
    const port = await getFreePort();
    const profilePath = await mkdtemp(join(tmpdir(), 'araon-toss-login-'));
    this.activeProfilePath = profilePath;
    try {
      spawnChrome({
        port,
        profilePath,
        width: CHROME_WIDTH,
        height: CHROME_HEIGHT,
        headless: options.headless === true,
        url: this.loginUrl,
      });
      await waitForChrome(port, signal);
      const target = await getPageTarget(port, this.loginUrl);
      this.cdp = new CdpClient(target.webSocketDebuggerUrl);
      await this.cdp.connect(signal);
      await this.cdp.send('Page.enable');
      await this.cdp.send('Runtime.enable');
      await this.cdp.send('Network.enable');
      await this.cdp.send('Page.bringToFront').catch(() => {});
      await waitForPageBody(this.cdp, signal);
      await activateQrTab(this.cdp);

      while (Date.now() < deadline) {
        throwIfAborted(signal);
        const browserState = await captureBrowserState(this.cdp);
        const assessment = assessTossBrowserSession(browserState);
        this.setStatus({
          state: assessment.initialAuthDone ? 'waiting_for_persistent' : 'waiting_for_qr',
          message: assessment.initialAuthDone
            ? 'QR login completed; waiting for persistent device confirmation'
            : 'Waiting for Toss QR login',
          persistent: assessment.persistent,
          cookieCount: assessment.cookieCount,
          localStorageKeyCount: assessment.localStorageKeyCount,
          sessionStorageKeyCount: assessment.sessionStorageKeyCount,
          expiresAt: assessment.expiresAt,
          missingCookieCount: assessment.missingCookies.length,
          missingLocalStorageKeyCount: assessment.missingLocalStorageKeys.length,
        });

        if (assessment.initialAuthDone && assessment.persistent) {
          await sleep(1200, signal);
          const finalState = await captureBrowserState(this.cdp);
          await this.sessionStore.save(tossSessionFromBrowserState(finalState));
          const finalAssessment = assessTossBrowserSession(finalState);
          this.setStatus({
            state: 'succeeded',
            message: 'Toss persistent session captured',
            persistent: true,
            cookieCount: finalAssessment.cookieCount,
            localStorageKeyCount: finalAssessment.localStorageKeyCount,
            sessionStorageKeyCount: finalAssessment.sessionStorageKeyCount,
            expiresAt: finalAssessment.expiresAt,
            missingCookieCount: 0,
            missingLocalStorageKeyCount: 0,
            finishedAt: new Date().toISOString(),
          });
          return;
        }

        await sleep(1000, signal);
      }

      this.setStatus({
        state: 'failed',
        message: 'Timed out before a persistent Toss session was captured',
        finishedAt: new Date().toISOString(),
      });
    } finally {
      await this.cleanupChrome();
    }
  }

  private async cleanupChrome(): Promise<void> {
    this.cdp?.close();
    this.cdp = null;
    const profilePath = this.activeProfilePath;
    if (profilePath !== null) {
      killChromeByProfile(profilePath);
      await sleep(500).catch(() => {});
      await rm(profilePath, { recursive: true, force: true }).catch(() => {});
      this.activeProfilePath = null;
    }
  }

  private setStatus(update: Partial<Omit<TossLoginStatus, 'updatedAt'>>): void {
    this.statusSnapshot = {
      ...this.statusSnapshot,
      ...update,
      updatedAt: new Date().toISOString(),
    };
  }
}

interface ChromeSpawnOptions {
  readonly port: number;
  readonly profilePath: string;
  readonly width: number;
  readonly height: number;
  readonly headless: boolean;
  readonly url: string;
}

function spawnChrome(options: ChromeSpawnOptions): void {
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profilePath}`,
    `--window-size=${options.width},${options.height}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (options.headless) {
    args.push('--headless=new');
  }
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

async function captureBrowserState(cdp: CdpClient): Promise<TossBrowserState> {
  const [cookieResult, storage] = await Promise.all([
    cdp.send('Network.getAllCookies') as Promise<{ cookies?: TossBrowserCookie[] }>,
    evaluate(cdp, `
      (() => {
        const read = (storage) => {
          const out = {};
          for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key === null) continue;
            out[key] = storage.getItem(key) || '';
          }
          return out;
        };
        return {
          url: window.location.href,
          localStorage: read(window.localStorage),
          sessionStorage: read(window.sessionStorage),
        };
      })()
    `) as Promise<{
      url?: string;
      localStorage?: Record<string, string>;
      sessionStorage?: Record<string, string>;
    }>,
  ]);
  return {
    url: storage.url ?? '',
    cookies: cookieResult.cookies ?? [],
    localStorage: storage.localStorage ?? {},
    sessionStorage: storage.sessionStorage ?? {},
  };
}

async function activateQrTab(cdp: CdpClient): Promise<void> {
  await evaluate(cdp, `
    (() => {
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], [data-tossinvest-log="SegmentedControlButton"]'));
      const exact = nodes.find((el) => (el.textContent || '').trim() === 'QR코드로 로그인');
      const fuzzy = nodes.find((el) => /QR/i.test((el.textContent || '').trim()));
      const target = exact || fuzzy || null;
      if (!target) return false;
      target.click();
      return true;
    })()
  `).catch(() => false);
}

async function waitForPageBody(
  cdp: CdpClient,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const ready = await evaluate(cdp, `Boolean(document.body && document.body.innerText.length > 20)`)
      .catch(() => false);
    if (ready === true) return;
    await sleep(500, signal);
  }
  throw new Error('Toss login page did not render in time');
}

async function waitForChrome(
  port: number,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await sleep(300, signal);
    }
  }
  throw new Error('Chrome remote debugging did not become ready');
}

async function getPageTarget(
  port: number,
  url: string,
): Promise<{ webSocketDebuggerUrl: string }> {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`) as Array<{
    type?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
  }>;
  const match = targets.find((target) =>
    target.type === 'page' &&
    target.webSocketDebuggerUrl !== undefined &&
    (target.url?.startsWith(url) ?? false));
  if (match?.webSocketDebuggerUrl !== undefined) {
    return { webSocketDebuggerUrl: match.webSocketDebuggerUrl };
  }
  const created = await fetchJson(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  ) as { webSocketDebuggerUrl?: string };
  if (created.webSocketDebuggerUrl === undefined) {
    throw new Error('Chrome did not return a page debugger URL');
  }
  return { webSocketDebuggerUrl: created.webSocketDebuggerUrl };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Chrome CDP HTTP returned ${res.status}`);
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
    throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

class CdpClient {
  private readonly wsUrl: string;
  private seq = 1;
  private ws: CdpWebSocket | null = null;
  private readonly pending = new Map<number, {
    method: string;
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
  }>();

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  async connect(signal: AbortSignal): Promise<void> {
    const Ws = globalThis.WebSocket as unknown as CdpWebSocketConstructor;
    this.ws = new Ws(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10_000);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Toss login capture cancelled'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.ws?.addEventListener('open', () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve();
      }, { once: true });
      this.ws?.addEventListener('error', () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new Error('CDP websocket error'));
      }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (msg.id === undefined) return;
      const entry = this.pending.get(msg.id);
      if (entry === undefined) return;
      this.pending.delete(msg.id);
      if (msg.error !== undefined) {
        entry.reject(new Error(`${entry.method}: ${msg.error.message ?? 'CDP error'}`));
        return;
      }
      entry.resolve(msg.result);
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.ws === null) {
      return Promise.reject(new Error('CDP websocket is not connected'));
    }
    const id = this.seq;
    this.seq += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
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

function idleStatus(): TossLoginStatus {
  return {
    state: 'idle',
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    message: null,
    persistent: false,
    cookieCount: 0,
    localStorageKeyCount: 0,
    sessionStorageKeyCount: 0,
    expiresAt: null,
    missingCookieCount: 0,
    missingLocalStorageKeyCount: 0,
  };
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
        reject(new Error('Could not allocate a local Chrome debugging port'));
      });
    });
  });
}

function clampTimeoutMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(value), 30_000), 10 * 60_000);
}

function isTerminal(state: TossLoginJobState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Toss login capture failed';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Toss login capture cancelled');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal !== undefined) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Toss login capture cancelled'));
      }, { once: true });
    }
  });
}
