/**
 * useAlertEvaluator — drives the alert pipeline once per quote-store tick.
 *
 * Pipeline:
 *   1. Subscribe to `quotes`, `favorites`, `rules`, `settings`, `marketStatus`.
 *   2. On every quote change, call `evaluateAlerts` (pure) with the previous
 *      quotes ref and the in-memory cooldown map.
 *   3. For each returned `ToastSpec`:
 *        - push it to the toast store
 *        - record the cooldown key in the ref
 *        - play a beep if sound is on
 *        - fire a desktop notification if the tab is hidden and granted
 *      The `onPickStock` arg is invoked when a desktop notification is
 *      clicked (App.tsx wires this to opening the detail modal).
 *   4. Update the previous-quotes ref to the current snapshot.
 *
 * Refs are used for `previousQuotes` and `cooldowns` because they're
 * caller-owned mutable state that must survive renders without retriggering
 * effects.
 */

import { useEffect, useRef } from 'react';
import type { Price } from '@shared/types';
import { evaluateAlerts } from '../lib/alert-evaluator';
import { showDesktopNotification } from '../lib/desktop-notification';
import { isMarketLive } from '../lib/market-status';
import { playBleep } from '../lib/sound';
import { useAlertRulesStore } from '../stores/alert-rules-store';
import { useMarketStore } from '../stores/market-store';
import { useSettingsStore } from '../stores/settings-store';
import { useStocksStore } from '../stores/stocks-store';
import { useToastStore } from '../stores/toast-store';
import { useWatchlistStore } from '../stores/watchlist-store';

const MAX_COOLDOWN_ENTRIES = 500;

interface UseAlertEvaluatorOptions {
  onPickStock: (ticker: string) => void;
}

export function useAlertEvaluator({ onPickStock }: UseAlertEvaluatorOptions): void {
  const quotes = useStocksStore((s) => s.quotes);
  const catalog = useStocksStore((s) => s.catalog);
  const favorites = useWatchlistStore((s) => s.favorites);
  const rules = useAlertRulesStore((s) => s.rules);
  const settings = useSettingsStore((s) => s.settings);
  const marketStatus = useMarketStore((s) => s.marketStatus);
  const pushToast = useToastStore((s) => s.push);

  const previousQuotesRef = useRef<Record<string, Price>>({});
  const cooldownsRef = useRef<Map<string, number>>(new Map());
  // Latest onPickStock — captured in a ref so the desktop click handler
  // doesn't go stale between renders.
  const pickStockRef = useRef(onPickStock);
  useEffect(() => {
    pickStockRef.current = onPickStock;
  }, [onPickStock]);

  useEffect(() => {
    const now = Date.now();
    const result = evaluateAlerts({
      quotes,
      previousQuotes: previousQuotesRef.current,
      favorites,
      catalog,
      rules,
      settings,
      cooldowns: cooldownsRef.current,
      marketStatus,
      now,
    });

    for (const spec of result.specs) {
      pushToast(spec);
      if (settings.soundOn && isMarketLive(marketStatus)) {
        playBleep(settings.soundVolume, spec.direction);
      }
      if (settings.desktopNotif) {
        showDesktopNotification({
          ticker: spec.ticker,
          title: spec.title,
          body: spec.detail,
          onClick: () => pickStockRef.current(spec.ticker),
        });
      }
    }

    for (const key of result.cooldownKeysToTouch) {
      cooldownsRef.current.set(key, now);
    }

    // Garbage-collect stale cooldown entries when the map grows past the
    // soft cap. Anything older than 2× the longest known cooldown gets
    // dropped — newer keys naturally take priority.
    if (cooldownsRef.current.size > MAX_COOLDOWN_ENTRIES) {
      const maxRuleCooldown = rules.reduce(
        (m, r) => Math.max(m, r.cooldownMs),
        settings.alertCooldownMs,
      );
      const cutoff = now - maxRuleCooldown * 2;
      for (const [k, lastFired] of cooldownsRef.current.entries()) {
        if (lastFired < cutoff) cooldownsRef.current.delete(k);
      }
    }

    previousQuotesRef.current = quotes;
    // We intentionally depend only on `quotes` — the evaluator reads the
    // others off the closure each tick. This prevents extra re-runs when
    // settings change without a new tick (which would fire stale crossings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);
}
