import {
  KIS_WS_TICK_TR_ID_INTEGRATED,
  KIS_WS_TICK_TR_ID_NXT,
} from '@shared/kis-constraints.js';

type RealtimeTickTrId =
  | typeof KIS_WS_TICK_TR_ID_INTEGRATED
  | typeof KIS_WS_TICK_TR_ID_NXT;

export type RealtimeFeedSource = 'integrated' | 'nxt';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const NXT_PREMARKET_START_MINUTES = 8 * 60;
const REGULAR_START_MINUTES = 9 * 60;
const REGULAR_END_MINUTES = 15 * 60 + 30;
const NXT_AFTER_HOURS_END_MINUTES = 20 * 60;

export function resolveRealtimeTickTrId(now: Date = new Date()): RealtimeTickTrId {
  const minutes = kstMinutes(now);
  if (
    (minutes >= NXT_PREMARKET_START_MINUTES && minutes < REGULAR_START_MINUTES) ||
    (minutes >= REGULAR_END_MINUTES && minutes < NXT_AFTER_HOURS_END_MINUTES)
  ) {
    return KIS_WS_TICK_TR_ID_NXT;
  }
  return KIS_WS_TICK_TR_ID_INTEGRATED;
}

export function realtimeFeedSourceFromTrId(trId: string): RealtimeFeedSource {
  return trId === KIS_WS_TICK_TR_ID_NXT ? 'nxt' : 'integrated';
}

function kstMinutes(date: Date): number {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}
