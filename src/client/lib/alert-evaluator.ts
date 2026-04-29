/**
 * Alert evaluator — pure function, called once per quote-store change.
 *
 * Two alert sources, evaluated together:
 *   1. Favorite threshold crossing — when a *favorite* stock's `changeRate`
 *      crosses ±`notifPctThreshold` between the previous tick and the
 *      current tick.
 *   2. Rule crossing — explicit user rules (price/changePct/volume) defined
 *      in `useAlertRulesStore`, evaluated only when the relevant value
 *      crosses the rule's threshold.
 *
 * Strict gating to avoid noisy alerts:
 *   - `notifGlobalEnabled === false` → no alerts.
 *   - `marketStatus !== 'open'` → no alerts. Closed/snapshot/pre-open are
 *     baseline-only states.
 *   - Current OR previous quote with `isSnapshot === true` → baseline only,
 *     no alert (snapshot ticks aren't real intraday motion).
 *   - Initial hydration (no `previousQuote` for a ticker) → no alert; the
 *     current value becomes the baseline.
 *   - Cooldown — once a `(cooldownKey)` fires, it stays muted for
 *     `alertCooldownMs`. Rule keys include the rule's `updatedAt` so editing
 *     a rule resets its cooldown without manual clearing.
 *
 * The function is pure. The caller owns:
 *   - mutating the cooldown map (we just return which keys to touch)
 *   - pushing toasts to the toast store
 *   - playing sounds / firing desktop notifications
 */

import type { MarketStatus, Price } from '@shared/types';
import { isMarketLive } from './market-status';
import type { CatalogEntry } from '../stores/stocks-store';
import type { AlertRule } from '../stores/alert-rules-store';
import type { ClientSettings } from '../stores/settings-store';

export type AlertDirection = 'up' | 'down';

export interface ToastSpec {
  /** Stable id for the toast lifecycle in toast-store. */
  id: string;
  /** Cooldown key — see makeCooldownKey* helpers. */
  cooldownKey: string;
  ticker: string;
  /** 종목 이름 (catalog), falls back to ticker. */
  name: string;
  /** Always 'fav-pct' or 'rule'. */
  kind: 'fav-pct' | 'rule';
  direction: AlertDirection;
  /** Current %change for color and sort. */
  changePct: number;
  title: string;
  detail: string;
  /** ms epoch the spec was created. */
  ts: number;
}

export interface AlertEvaluatorInput {
  quotes: Record<string, Price>;
  previousQuotes: Record<string, Price>;
  favorites: ReadonlySet<string>;
  catalog: Record<string, CatalogEntry>;
  rules: ReadonlyArray<AlertRule>;
  settings: ClientSettings;
  cooldowns: ReadonlyMap<string, number>;
  marketStatus: MarketStatus;
  now: number;
}

export interface AlertEvaluatorOutput {
  /** Toasts to push (already deduped by cooldown). */
  specs: ToastSpec[];
  /** Cooldown keys whose `lastFiredAt` should be set to `now`. */
  cooldownKeysToTouch: string[];
}

const EMPTY_OUTPUT: AlertEvaluatorOutput = {
  specs: [],
  cooldownKeysToTouch: [],
};

export function makeFavCooldownKey(
  threshold: number,
  ticker: string,
  direction: AlertDirection,
): string {
  return `fav-pct:${threshold}:${ticker}:${direction}`;
}

export function makeRuleCooldownKey(rule: AlertRule): string {
  return `rule:${rule.id}:${rule.updatedAt}`;
}

function nameOf(catalog: Record<string, CatalogEntry>, ticker: string): string {
  return catalog[ticker]?.name ?? ticker;
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtPrice(n: number): string {
  return n.toLocaleString('ko-KR');
}

function isOnCooldown(
  cooldowns: ReadonlyMap<string, number>,
  key: string,
  cooldownMs: number,
  now: number,
): boolean {
  const last = cooldowns.get(key);
  if (last === undefined) return false;
  return now - last < cooldownMs;
}

let SPEC_SEQ = 0;
function nextId(): string {
  SPEC_SEQ += 1;
  return `toast-${Date.now().toString(36)}-${SPEC_SEQ}`;
}

export function evaluateAlerts(input: AlertEvaluatorInput): AlertEvaluatorOutput {
  const {
    quotes,
    previousQuotes,
    favorites,
    catalog,
    rules,
    settings,
    cooldowns,
    marketStatus,
    now,
  } = input;

  if (!settings.notifGlobalEnabled) return EMPTY_OUTPUT;
  if (!isMarketLive(marketStatus)) return EMPTY_OUTPUT;

  const specs: ToastSpec[] = [];
  const cooldownKeysToTouch: string[] = [];

  // Index rules by ticker for O(1) lookup per quote.
  const rulesByTicker = new Map<string, AlertRule[]>();
  for (const r of rules) {
    if (!r.enabled) continue;
    const arr = rulesByTicker.get(r.ticker) ?? [];
    arr.push(r);
    rulesByTicker.set(r.ticker, arr);
  }

  for (const ticker of Object.keys(quotes)) {
    const curr = quotes[ticker];
    const prev = previousQuotes[ticker];
    if (curr === undefined) continue;
    // Initial hydration — no baseline yet; just wait.
    if (prev === undefined) continue;
    // Either side a snapshot → only baseline updates, no alerts.
    if (curr.isSnapshot === true || prev.isSnapshot === true) continue;

    // ---- Favorite threshold crossing ----
    if (favorites.has(ticker)) {
      const t = settings.notifPctThreshold;
      const upCross = prev.changeRate < t && curr.changeRate >= t;
      const downCross =
        prev.changeRate > -t && curr.changeRate <= -t;
      if (upCross || downCross) {
        const direction: AlertDirection = upCross ? 'up' : 'down';
        const key = makeFavCooldownKey(t, ticker, direction);
        if (!isOnCooldown(cooldowns, key, settings.alertCooldownMs, now)) {
          const name = nameOf(catalog, ticker);
          specs.push({
            id: nextId(),
            cooldownKey: key,
            ticker,
            name,
            kind: 'fav-pct',
            direction,
            changePct: curr.changeRate,
            title: `${name} ${fmtPct(curr.changeRate)}`,
            detail: `${ticker} · ${fmtPrice(curr.price)}원 · 임계값 ±${t}% 돌파`,
            ts: now,
          });
          cooldownKeysToTouch.push(key);
        }
      }
    }

    // ---- Rule crossing ----
    const tickerRules = rulesByTicker.get(ticker);
    if (tickerRules !== undefined) {
      for (const rule of tickerRules) {
        let crossed = false;
        switch (rule.kind) {
          case 'priceAbove':
            crossed = prev.price < rule.threshold && curr.price >= rule.threshold;
            break;
          case 'priceBelow':
            crossed = prev.price > rule.threshold && curr.price <= rule.threshold;
            break;
          case 'changePctAbove':
            crossed =
              prev.changeRate < rule.threshold &&
              curr.changeRate >= rule.threshold;
            break;
          case 'changePctBelow':
            crossed =
              prev.changeRate > rule.threshold &&
              curr.changeRate <= rule.threshold;
            break;
          case 'volumeAbove':
            crossed =
              prev.volume < rule.threshold && curr.volume >= rule.threshold;
            break;
        }
        if (!crossed) continue;
        const key = makeRuleCooldownKey(rule);
        if (isOnCooldown(cooldowns, key, rule.cooldownMs, now)) continue;
        const name = nameOf(catalog, ticker);
        const direction: AlertDirection =
          rule.kind === 'priceBelow' || rule.kind === 'changePctBelow'
            ? 'down'
            : 'up';
        const label = ruleLabel(rule);
        specs.push({
          id: nextId(),
          cooldownKey: key,
          ticker,
          name,
          kind: 'rule',
          direction,
          changePct: curr.changeRate,
          title: `${name} · 룰 발동`,
          detail: `${ticker} · ${label} · ${fmtPrice(curr.price)}원 (${fmtPct(curr.changeRate)})`,
          ts: now,
        });
        cooldownKeysToTouch.push(key);
      }
    }
  }

  return { specs, cooldownKeysToTouch };
}

function ruleLabel(rule: AlertRule): string {
  switch (rule.kind) {
    case 'priceAbove':
      return `가격 ≥ ${rule.threshold.toLocaleString('ko-KR')}원`;
    case 'priceBelow':
      return `가격 ≤ ${rule.threshold.toLocaleString('ko-KR')}원`;
    case 'changePctAbove':
      return `등락률 ≥ ${rule.threshold}%`;
    case 'changePctBelow':
      return `등락률 ≤ ${rule.threshold}%`;
    case 'volumeAbove':
      return `거래량 ≥ ${rule.threshold.toLocaleString('ko-KR')}`;
  }
}
