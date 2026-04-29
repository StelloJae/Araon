/**
 * useErrorStore — transient banner/toast errors.
 *
 * `push` schedules an auto-dismiss after `AUTO_DISMISS_MS` so the UI doesn't
 * accumulate stale alerts. Manual dismiss via `dismiss(id)` cancels the timer.
 *
 * Errors come from two sources:
 *   - SSE `ServerErrorEvent` payloads (forwarded by `useSSE`)
 *   - Client-side fetch failures (forwarded by api-client wrappers)
 *
 * `BannerError` is the canonical UI shape; the SSE adapter converts the
 * server's `code` field into a Korean title (or falls back to the message).
 */

import { create } from 'zustand';
import type { BannerError } from '../components/ErrorBanner';

const AUTO_DISMISS_MS = 5_000;

interface ErrorState {
  errors: BannerError[];
  push: (error: Omit<BannerError, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

export const useErrorStore = create<ErrorState>((set, get) => ({
  errors: [],

  push: (error) => {
    const id = error.id ?? makeId();
    const item: BannerError = { ...error, id };
    set((state) => ({ errors: [...state.errors, item] }));
    const timer = setTimeout(() => {
      timers.delete(id);
      get().dismiss(id);
    }, AUTO_DISMISS_MS);
    timers.set(id, timer);
    return id;
  },

  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ errors: state.errors.filter((e) => e.id !== id) }));
  },
}));
