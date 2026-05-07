export type PhoneDeliveryStatus = 'sent' | 'failed' | 'skipped';

export interface PhoneDeliveryLogEntry {
  id: string;
  provider: 'telegram';
  type: 'alert' | 'test';
  status: PhoneDeliveryStatus;
  createdAt: string;
  ticker: string | null;
  name: string | null;
  title: string;
  detail: string | null;
  errorCode: string | null;
}

export interface PhoneDeliveryLogSummary {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  lastStatus: PhoneDeliveryStatus | null;
  lastAt: string | null;
  lastErrorCode: string | null;
}

export interface PhoneDeliveryLog {
  record(entry: Omit<PhoneDeliveryLogEntry, 'id' | 'provider' | 'createdAt'> & {
    createdAt?: string;
  }): void;
  list(limit?: number): PhoneDeliveryLogEntry[];
  summarize(): PhoneDeliveryLogSummary;
}

const DEFAULT_LIMIT = 200;

export function createPhoneDeliveryLog(maxEntries = DEFAULT_LIMIT): PhoneDeliveryLog {
  const entries: PhoneDeliveryLogEntry[] = [];

  function record(
    entry: Omit<PhoneDeliveryLogEntry, 'id' | 'provider' | 'createdAt'> & {
      createdAt?: string;
    },
  ): void {
    entries.unshift({
      id: `${Date.now()}-${entries.length}`,
      provider: 'telegram',
      type: entry.type,
      status: entry.status,
      createdAt: entry.createdAt ?? new Date().toISOString(),
      ticker: sanitizeNullable(entry.ticker),
      name: sanitizeNullable(entry.name),
      title: sanitizeText(entry.title),
      detail: sanitizeNullable(entry.detail),
      errorCode: sanitizeNullable(entry.errorCode),
    });
    if (entries.length > maxEntries) {
      entries.splice(maxEntries);
    }
  }

  function list(limit = 50): PhoneDeliveryLogEntry[] {
    const safeLimit = Math.max(1, Math.min(limit, maxEntries));
    return entries.slice(0, safeLimit).map((entry) => ({ ...entry }));
  }

  function summarize(): PhoneDeliveryLogSummary {
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const entry of entries) {
      if (entry.status === 'sent') sent += 1;
      if (entry.status === 'failed') failed += 1;
      if (entry.status === 'skipped') skipped += 1;
    }
    const latest = entries[0] ?? null;
    return {
      total: entries.length,
      sent,
      failed,
      skipped,
      lastStatus: latest?.status ?? null,
      lastAt: latest?.createdAt ?? null,
      lastErrorCode: latest?.errorCode ?? null,
    };
  }

  return { record, list, summarize };
}

function sanitizeNullable(value: string | null): string | null {
  if (value === null) return null;
  return sanitizeText(value);
}

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
}
