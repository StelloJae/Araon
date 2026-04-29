/**
 * useAlertRulesStore — local-only alert rules (this browser only).
 *
 * Phase 5 owns CRUD + persistence. The actual firing engine (read quotes →
 * cross threshold → push toast) lives in Phase 6. The store deliberately
 * does NOT call any side-effects on rule changes — saves are pure
 * localStorage writes.
 *
 * Allowed rule kinds match data we actually have on the wire today:
 *   - priceAbove / priceBelow         (Price.price)
 *   - changePctAbove / changePctBelow (Price.changeRate)
 *   - volumeAbove                     (Price.volume — raw 주)
 *
 * Volume *multiples*, market-cap tiers, PER/PBR-based rules are NOT allowed
 * yet because the backend doesn't surface those fields.
 */

import { create } from 'zustand';

export type AlertRuleKind =
  | 'priceAbove'
  | 'priceBelow'
  | 'changePctAbove'
  | 'changePctBelow'
  | 'volumeAbove';

export const ALERT_RULE_KINDS: ReadonlyArray<AlertRuleKind> = [
  'priceAbove',
  'priceBelow',
  'changePctAbove',
  'changePctBelow',
  'volumeAbove',
];

export const ALERT_RULE_KIND_LABEL: Record<AlertRuleKind, string> = {
  priceAbove: '가격 ≥',
  priceBelow: '가격 ≤',
  changePctAbove: '등락률 ≥',
  changePctBelow: '등락률 ≤',
  volumeAbove: '거래량 ≥',
};

export const ALERT_RULE_KIND_SUFFIX: Record<AlertRuleKind, string> = {
  priceAbove: '원',
  priceBelow: '원',
  changePctAbove: '%',
  changePctBelow: '%',
  volumeAbove: '주',
};

export interface AlertRule {
  id: string;
  ticker: string;
  kind: AlertRuleKind;
  threshold: number;
  enabled: boolean;
  cooldownMs: number;
  createdAt: number;
  /** Bumped on toggle/update so cooldown keys auto-segment after edits. */
  updatedAt: number;
}

export const DEFAULT_RULE_COOLDOWN_MS = 5 * 60_000;

const STORAGE_KEY = 'araon-rules-v1';
const VALID_KINDS: ReadonlySet<string> = new Set(ALERT_RULE_KINDS);

function isValidRule(raw: unknown): raw is AlertRule {
  if (raw === null || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return false;
  if (typeof r.ticker !== 'string' || r.ticker.length === 0) return false;
  if (typeof r.kind !== 'string' || !VALID_KINDS.has(r.kind)) return false;
  if (typeof r.threshold !== 'number' || !Number.isFinite(r.threshold)) {
    return false;
  }
  if (typeof r.enabled !== 'boolean') return false;
  if (
    typeof r.cooldownMs !== 'number' ||
    !Number.isFinite(r.cooldownMs) ||
    r.cooldownMs < 0
  ) {
    return false;
  }
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) {
    return false;
  }
  // updatedAt is optional in older payloads — load() backfills it.
  if (
    r.updatedAt !== undefined &&
    (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt))
  ) {
    return false;
  }
  return true;
}

function loadRules(): AlertRule[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: AlertRule[] = [];
    for (const item of parsed) {
      if (isValidRule(item)) {
        const r = item as AlertRule & { updatedAt?: number };
        out.push({
          ...r,
          updatedAt:
            typeof r.updatedAt === 'number' ? r.updatedAt : r.createdAt,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveRules(rules: ReadonlyArray<AlertRule>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // private mode — ignore silently
  }
}

function generateId(): string {
  // crypto.randomUUID is widely supported in browsers and Node 20+.
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `rule-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export interface NewAlertRuleInput {
  ticker: string;
  kind: AlertRuleKind;
  threshold: number;
  enabled?: boolean;
  cooldownMs?: number;
}

interface AlertRulesState {
  rules: AlertRule[];
  add: (input: NewAlertRuleInput) => AlertRule;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  update: (id: string, patch: Partial<Omit<AlertRule, 'id' | 'createdAt'>>) => void;
  clear: () => void;
}

export const useAlertRulesStore = create<AlertRulesState>((set, get) => ({
  rules: loadRules(),

  add: (input) => {
    const t = Date.now();
    const rule: AlertRule = {
      id: generateId(),
      ticker: input.ticker,
      kind: input.kind,
      threshold: input.threshold,
      enabled: input.enabled ?? true,
      cooldownMs: input.cooldownMs ?? DEFAULT_RULE_COOLDOWN_MS,
      createdAt: t,
      updatedAt: t,
    };
    const next = [...get().rules, rule];
    saveRules(next);
    set({ rules: next });
    return rule;
  },

  remove: (id) => {
    const next = get().rules.filter((r) => r.id !== id);
    saveRules(next);
    set({ rules: next });
  },

  toggle: (id) => {
    const t = Date.now();
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled, updatedAt: t } : r,
    );
    saveRules(next);
    set({ rules: next });
  },

  update: (id, patch) => {
    const t = Date.now();
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, ...patch, updatedAt: t } : r,
    );
    saveRules(next);
    set({ rules: next });
  },

  clear: () => {
    saveRules([]);
    set({ rules: [] });
  },
}));
