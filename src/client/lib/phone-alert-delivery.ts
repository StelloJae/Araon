import type { ToastSpec } from './alert-evaluator';
import {
  sendPhoneNotificationAlert,
  type PhoneAlertPayload,
} from './api-client';
import type { NewAlertDeliveryEntry } from '../stores/alert-delivery-store';

export type PhoneAlertSender = (
  payload: PhoneAlertPayload,
) => Promise<{ sent: boolean; reason?: string }>;

export type AlertDeliveryRecorder = (entry: NewAlertDeliveryEntry) => unknown;

export function queuePhoneAlertDelivery(
  spec: ToastSpec,
  record: AlertDeliveryRecorder,
  sender: PhoneAlertSender = sendPhoneNotificationAlert,
  now: () => number = () => Date.now(),
): void {
  void sender({
    ticker: spec.ticker,
    name: spec.name,
    title: spec.title,
    detail: spec.detail,
    kind: spec.kind,
    direction: spec.direction,
    changePct: spec.changePct,
  })
    .then((result) => {
      const entry = baseEntry(spec, now(), result.sent ? 'sent' : 'skipped');
      record(
        result.reason === undefined
          ? entry
          : { ...entry, reason: result.reason },
      );
    })
    .catch((err: unknown) => {
      record({
        ...baseEntry(spec, now(), 'failed'),
        reason: err instanceof Error ? err.message : 'UNKNOWN_PHONE_ALERT_ERROR',
      });
    });
}

function baseEntry(
  spec: ToastSpec,
  ts: number,
  status: 'sent' | 'skipped' | 'failed',
): NewAlertDeliveryEntry {
  return {
    ts,
    ticker: spec.ticker,
    name: spec.name,
    title: spec.title,
    detail: spec.detail,
    kind: spec.kind,
    direction: spec.direction,
    channel: 'phone',
    status,
  };
}
