import { describe, expect, it } from 'vitest';

import {
  parseTossSseFrame,
  TossSseReconnectSignal,
} from '../toss-sse-client.js';

describe('Toss SSE client', () => {
  it('parses sanitized event metadata without raw payload fields', () => {
    const events: unknown[] = [];

    parseTossSseFrame([
      'id: abc123',
      'data: {"type":"price-refresh","msg":{"stockCode":"A005930","title":"hidden"},"key":"1"}',
    ].join('\n'), (event) => events.push(event));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'abc123',
      name: null,
      type: 'price-refresh',
      key: '1',
      stockCode: 'A005930',
    });
    expect(JSON.stringify(events[0])).not.toContain('hidden');
  });

  it('ignores comments, retry directives, malformed data, and payloads without type', () => {
    const events: unknown[] = [];

    parseTossSseFrame(':heartbeat\nretry: 3600000', (event) => events.push(event));
    parseTossSseFrame('data: not-json', (event) => events.push(event));
    parseTossSseFrame('data: {"key":"1"}', (event) => events.push(event));

    expect(events).toHaveLength(0);
  });

  it('turns Toss connection-close frames into a reconnect signal', () => {
    expect(() => parseTossSseFrame('event: connection-close', () => {}))
      .toThrow(TossSseReconnectSignal);
  });
});
