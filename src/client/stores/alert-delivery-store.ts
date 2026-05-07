import { create } from 'zustand';

export type AlertDeliveryChannel = 'toast' | 'sound' | 'desktop' | 'phone';
export type AlertDeliveryStatus = 'sent' | 'skipped' | 'failed';

export interface AlertDeliveryEntry {
  id: string;
  ts: number;
  ticker: string;
  name: string;
  title: string;
  detail: string;
  kind: 'fav-pct' | 'rule';
  direction: 'up' | 'down';
  channel: AlertDeliveryChannel;
  status: AlertDeliveryStatus;
  reason?: string;
}

export type NewAlertDeliveryEntry = Omit<AlertDeliveryEntry, 'id'>;

const STORAGE_KEY = 'araon-alert-deliveries-v1';
const MAX_ENTRIES = 200;
const MAX_REASON_LENGTH = 80;

function generateId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `delivery-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function sanitizeReason(reason: string | undefined): string | undefined {
  if (reason === undefined) return undefined;
  const trimmed = reason.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= MAX_REASON_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

function isValidEntry(raw: unknown): raw is AlertDeliveryEntry {
  if (raw === null || typeof raw !== 'object') return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.ts === 'number' &&
    Number.isFinite(e.ts) &&
    typeof e.ticker === 'string' &&
    typeof e.name === 'string' &&
    typeof e.title === 'string' &&
    typeof e.detail === 'string' &&
    (e.kind === 'fav-pct' || e.kind === 'rule') &&
    (e.direction === 'up' || e.direction === 'down') &&
    (e.channel === 'toast' ||
      e.channel === 'sound' ||
      e.channel === 'desktop' ||
      e.channel === 'phone') &&
    (e.status === 'sent' || e.status === 'skipped' || e.status === 'failed') &&
    (e.reason === undefined || typeof e.reason === 'string')
  );
}

function loadEntries(): AlertDeliveryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function saveEntries(entries: ReadonlyArray<AlertDeliveryEntry>): void {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // localStorage may be disabled; the UI can still work in-memory.
  }
}

interface AlertDeliveryState {
  entries: AlertDeliveryEntry[];
  record: (entry: NewAlertDeliveryEntry) => AlertDeliveryEntry;
  clear: () => void;
}

export const useAlertDeliveryStore = create<AlertDeliveryState>((set, get) => ({
  entries: loadEntries(),

  record: (entry) => {
    const reason = sanitizeReason(entry.reason);
    const nextEntry: AlertDeliveryEntry = {
      ...entry,
      id: generateId(),
    };
    if (reason !== undefined) nextEntry.reason = reason;
    const next = [nextEntry, ...get().entries].slice(0, MAX_ENTRIES);
    saveEntries(next);
    set({ entries: next });
    return nextEntry;
  },

  clear: () => {
    saveEntries([]);
    set({ entries: [] });
  },
}));
