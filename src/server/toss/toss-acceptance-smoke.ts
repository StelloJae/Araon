import type { TossAuthenticatedReadSmokeReport } from './toss-authenticated-read-smoke.js';
import type { TossLoginCaptureSmokeReport } from './toss-login-capture-smoke.js';
import type { TossRealtimeSmokeReport } from './toss-realtime-smoke.js';

export interface TossAcceptanceSmokeOptions {
  readonly runLoginCapture: () => Promise<TossLoginCaptureSmokeReport>;
  readonly runAuthenticatedRead: () => Promise<TossAuthenticatedReadSmokeReport>;
  readonly runRealtime: () => Promise<TossRealtimeSmokeReport>;
  readonly now?: () => Date;
}

export interface TossAcceptanceSmokeReport {
  readonly provider: 'toss';
  readonly generatedAt: string;
  readonly outcome: 'ok' | 'partial' | 'login_incomplete' | 'failed';
  readonly errorCode: 'TOSS_ACCEPTANCE_SMOKE_FAILED' | null;
  readonly stages: {
    readonly login: TossLoginCaptureSmokeReport;
    readonly authenticatedRead: TossAuthenticatedReadSmokeReport | null;
    readonly realtime: TossRealtimeSmokeReport | null;
  };
}

export async function runTossAcceptanceSmoke(
  options: TossAcceptanceSmokeOptions,
): Promise<TossAcceptanceSmokeReport> {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const login = await options.runLoginCapture();

  if (!isLoginAccepted(login.outcome)) {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'login_incomplete',
      errorCode: null,
      stages: {
        login,
        authenticatedRead: null,
        realtime: null,
      },
    };
  }

  try {
    const authenticatedRead = await options.runAuthenticatedRead();
    const realtime = await options.runRealtime();
    return {
      provider: 'toss',
      generatedAt,
      outcome: combinedOutcome(authenticatedRead, realtime),
      errorCode: null,
      stages: {
        login,
        authenticatedRead,
        realtime,
      },
    };
  } catch {
    return {
      provider: 'toss',
      generatedAt,
      outcome: 'failed',
      errorCode: 'TOSS_ACCEPTANCE_SMOKE_FAILED',
      stages: {
        login,
        authenticatedRead: null,
        realtime: null,
      },
    };
  }
}

function isLoginAccepted(outcome: TossLoginCaptureSmokeReport['outcome']): boolean {
  return outcome === 'succeeded' || outcome === 'already_configured';
}

function combinedOutcome(
  authenticatedRead: TossAuthenticatedReadSmokeReport,
  realtime: TossRealtimeSmokeReport,
): TossAcceptanceSmokeReport['outcome'] {
  if (authenticatedRead.outcome === 'ok' && realtime.outcome === 'ok') return 'ok';
  if (authenticatedRead.outcome === 'session_required' || realtime.outcome === 'session_required') {
    return 'login_incomplete';
  }
  if (realtime.outcome === 'failed') return 'failed';
  return 'partial';
}
