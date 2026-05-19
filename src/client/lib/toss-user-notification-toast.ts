import type { TossUserNotificationEvent } from '@shared/types';
import type { ToastSpec } from './alert-evaluator';

export function tossUserNotificationToToastSpec(
  event: TossUserNotificationEvent,
  displayName?: string,
  now: number = Date.now(),
): ToastSpec {
  const payload = event.notification;
  const ticker = payload.ticker ?? 'TOSS';
  const name = displayName ?? ticker;
  return {
    id: `toss-user-notification-${payload.id}`,
    cooldownKey: `toss-user-notification:${payload.id}`,
    ticker,
    name,
    kind: 'rule',
    direction: 'up',
    changePct: 0,
    title: `Toss 알림: ${name}`,
    detail: `${payload.sourceType} · 원문 비공개 · ${formatKstMinute(payload.receivedAt)}`,
    ts: now,
  };
}

export function maybeTossUserNotificationToToastSpec(
  event: TossUserNotificationEvent,
  displayName: string | undefined,
  notificationsEnabled: boolean,
  now: number = Date.now(),
): ToastSpec | null {
  if (!notificationsEnabled) return null;
  if (event.notification.ticker === null) return null;
  return tossUserNotificationToToastSpec(event, displayName, now);
}

function formatKstMinute(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '수신 시각 미상';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get('year')}-${lookup.get('month')}-${lookup.get('day')} ${lookup.get('hour')}:${lookup.get('minute')}`;
}
