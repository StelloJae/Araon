/**
 * useToastStore — visible toast queue.
 *
 * Capped at MAX_TOASTS (oldest evicted on overflow). Auto-dismiss is the
 * Toast component's responsibility (so each toast respects the *current*
 * `toastDurationMs` setting at the moment it appeared, even if the user
 * later changes the slider).
 */

import { create } from 'zustand';
import type { ToastSpec } from '../lib/alert-evaluator';

export interface ToastEntry extends ToastSpec {
  /** ms epoch when pushed; used for sort key in tests. */
  pushedAt: number;
}

export const MAX_TOASTS = 5;

interface ToastState {
  toasts: ToastEntry[];
  push: (spec: ToastSpec) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (spec) => {
    const entry: ToastEntry = { ...spec, pushedAt: Date.now() };
    const next = [...get().toasts, entry];
    if (next.length > MAX_TOASTS) {
      next.splice(0, next.length - MAX_TOASTS);
    }
    set({ toasts: next });
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));
