import type { TossSessionSummary } from './toss-session-store.js';

export function shouldAutoStartTossRealtime(summary: TossSessionSummary): boolean {
  return summary.configured
    && (
      summary.state === 'persistent' ||
      summary.state === 'session_scoped' ||
      summary.state === 'expiring'
    );
}
