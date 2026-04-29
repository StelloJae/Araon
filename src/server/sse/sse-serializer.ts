/**
 * SSE frame serializer.
 *
 * `serializeEvent` converts a typed SSEEvent into a valid SSE frame string
 * per the W3C EventSource spec:
 *
 *   id: <n>\n
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * `nextSequenceId` provides a process-wide monotonic counter shared by all
 * callers. Assign the returned id to the event's `id` field before passing
 * the event to `serializeEvent`.
 */

import type { SSEEvent } from '@shared/types.js';

// ---------------------------------------------------------------------------
// Monotonic sequence counter
// ---------------------------------------------------------------------------

let _seq = 0;

/** Returns the next monotonically increasing integer id (starts at 1). */
export function nextSequenceId(): number {
  _seq += 1;
  return _seq;
}

// ---------------------------------------------------------------------------
// Frame serializer
// ---------------------------------------------------------------------------

/**
 * Serialize a typed SSEEvent into a valid SSE frame.
 *
 * The `id` field on the event object becomes the SSE `id:` header.
 * The `type` field becomes the SSE `event:` header.
 * The full event object is JSON-serialized as the `data:` line.
 */
export function serializeEvent(ev: SSEEvent): string {
  const data = JSON.stringify(ev);
  return `id: ${ev.id}\nevent: ${ev.type}\ndata: ${data}\n\n`;
}
