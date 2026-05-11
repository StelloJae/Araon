import type { TossSession } from './toss-session-store.js';

export const TOSS_SSE_RECONNECT_SIGNAL = 'TOSS_SSE_RECONNECT_SIGNAL';

const DEFAULT_STREAM_URL = 'https://sse-message.tossinvest.com/api/v1/wts-notification';
const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export interface TossSseEvent {
  readonly id: string | null;
  readonly name: string | null;
  readonly type: string;
  readonly key: string | null;
  readonly stockCode: string | null;
  readonly receivedAt: string;
}

export interface TossSseClientOptions {
  readonly streamUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class TossSseReconnectSignal extends Error {
  constructor() {
    super(TOSS_SSE_RECONNECT_SIGNAL);
    this.name = 'TossSseReconnectSignal';
  }
}

export class TossSseClient {
  private readonly session: TossSession;
  private readonly streamUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(session: TossSession, options: TossSseClientOptions = {}) {
    this.session = session;
    this.streamUrl = options.streamUrl ?? DEFAULT_STREAM_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listen(
    signal: AbortSignal,
    handler: (event: TossSseEvent) => void,
  ): Promise<void> {
    if (Object.keys(this.session.cookies).length === 0) {
      throw new Error('Toss SSE requires an authenticated session');
    }
    const res = await this.fetchImpl(this.streamUrl, {
      method: 'GET',
      signal,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': DEFAULT_BROWSER_UA,
        Referer: 'https://www.tossinvest.com/',
        Origin: 'https://www.tossinvest.com',
        Cookie: cookieHeader(this.session.cookies),
      },
    });
    if (!res.ok) {
      throw new Error(`Toss SSE returned HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error('Toss SSE returned an unexpected content type');
    }
    if (res.body === null) {
      throw new Error('Toss SSE returned an empty stream');
    }
    await parseTossSseStream(res.body, handler);
  }
}

export async function parseTossSseStream(
  stream: ReadableStream<Uint8Array>,
  handler: (event: TossSseEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (value !== undefined) {
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        parseTossSseFrame(frame, handler);
      }
    }
    if (done) break;
  }
  if (buffer.trim().length > 0) {
    parseTossSseFrame(buffer, handler);
  }
}

export function parseTossSseFrame(
  frame: string,
  handler: (event: TossSseEvent) => void,
): void {
  let id: string | null = null;
  let name: string | null = null;
  const dataLines: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine.length === 0 || rawLine.startsWith(':')) continue;
    const sep = rawLine.indexOf(':');
    const field = sep === -1 ? rawLine : rawLine.slice(0, sep);
    const value = sep === -1 ? '' : rawLine.slice(sep + 1).trimStart();
    if (field === 'id') id = value;
    else if (field === 'event') name = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (name === 'connection-close') {
    throw new TossSseReconnectSignal();
  }
  if (dataLines.length === 0) return;
  const payload = parseSsePayload(dataLines.join('\n'));
  if (payload === null) return;
  handler({
    id,
    name,
    type: payload.type,
    key: payload.key,
    stockCode: payload.stockCode,
    receivedAt: new Date().toISOString(),
  });
}

function parseSsePayload(raw: string): {
  type: string;
  key: string | null;
  stockCode: string | null;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const type = typeof record['type'] === 'string' ? record['type'] : null;
  if (type === null) return null;
  const key = typeof record['key'] === 'string' ? record['key'] : null;
  const msg = typeof record['msg'] === 'object' && record['msg'] !== null
    ? record['msg'] as Record<string, unknown>
    : null;
  const stockCode = typeof msg?.['stockCode'] === 'string' ? msg['stockCode'] : null;
  return { type, key, stockCode };
}

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}
