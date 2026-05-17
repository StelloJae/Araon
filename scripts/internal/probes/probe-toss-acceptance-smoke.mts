/**
 * Toss authenticated acceptance smoke.
 *
 * Purpose:
 * - Run the safe QR login capture probe.
 * - Only after login succeeds or an existing session is present, run the
 *   authenticated read-only smoke and bounded SSE smoke.
 * - Print one sanitized JSON report.
 *
 * This probe may open Chrome for QR login. Do not run it until the user is
 * ready to scan and approve the Toss login.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --login-timeout-ms=600000 --sse-duration-ms=30000
 *   npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --require-existing-session=true
 */

import { runTossAcceptanceSmoke } from '../../../src/server/toss/toss-acceptance-smoke.js';
import { createTossAccountClient } from '../../../src/server/toss/toss-account-client.js';
import { createTossAccountSummaryClient } from '../../../src/server/toss/toss-account-summary-client.js';
import { runTossAuthenticatedReadSmoke } from '../../../src/server/toss/toss-authenticated-read-smoke.js';
import { createTossCdpLoginService } from '../../../src/server/toss/toss-cdp-login-service.js';
import { runTossLoginCaptureSmoke } from '../../../src/server/toss/toss-login-capture-smoke.js';
import { createTossNewsClient } from '../../../src/server/toss/toss-news-client.js';
import { createTossOrdersClient } from '../../../src/server/toss/toss-orders-client.js';
import {
  createCachingTossPortfolioClient,
  createTossPortfolioClient,
  createTossPortfolioSnapshotStore,
} from '../../../src/server/toss/toss-portfolio-client.js';
import { createTossRealtimeService } from '../../../src/server/toss/toss-realtime-service.js';
import { runTossRealtimeSmoke } from '../../../src/server/toss/toss-realtime-smoke.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';
import { createTossTransactionsClient } from '../../../src/server/toss/toss-transactions-client.js';
import { createTossWatchlistClient } from '../../../src/server/toss/toss-watchlist-client.js';

const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60_000;
const MIN_LOGIN_TIMEOUT_MS = 30_000;
const MAX_LOGIN_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_SSE_DURATION_MS = 30_000;
const MIN_SSE_DURATION_MS = 1000;
const MAX_SSE_DURATION_MS = 120_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function boundedIntegerArg(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function booleanArg(name: string): boolean | undefined {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const loginService = createTossCdpLoginService({ sessionStore });
  const portfolioSnapshotStore = createTossPortfolioSnapshotStore();
  const portfolioClient = createCachingTossPortfolioClient(
    createTossPortfolioClient({ sessionStore }),
    portfolioSnapshotStore,
  );
  const realtimeService = createTossRealtimeService({
    sessionStore,
    onRefreshHint: async () => undefined,
    onPriceRefresh: async () => undefined,
    onUserNotification: async () => undefined,
  });

  const newsTicker = argValue('news-ticker') ?? '005930';
  const newsName = argValue('news-name') ?? '삼성전자';

  const report = await runTossAcceptanceSmoke({
    runLoginCapture: () => runTossLoginCaptureSmoke({
      sessionStatus: () => sessionStore.status(),
      loginService,
      timeoutMs: boundedIntegerArg(
        'login-timeout-ms',
        DEFAULT_LOGIN_TIMEOUT_MS,
        MIN_LOGIN_TIMEOUT_MS,
        MAX_LOGIN_TIMEOUT_MS,
      ),
      requireExistingSession: booleanArg('require-existing-session') === true,
      headless: booleanArg('headless'),
    }),
    runAuthenticatedRead: () => runTossAuthenticatedReadSmoke({
      sessionStatus: () => sessionStore.status(),
      clients: {
        account: createTossAccountClient({ sessionStore }),
        accountSummary: createTossAccountSummaryClient({ sessionStore }),
        portfolio: portfolioClient,
        orders: createTossOrdersClient({ sessionStore }),
        transactions: createTossTransactionsClient({ sessionStore }),
        watchlist: createTossWatchlistClient({ sessionStore }),
        news: createTossNewsClient({ sessionStore }),
      },
      newsProbe: {
        ticker: newsTicker,
        name: newsName,
      },
    }),
    runRealtime: () => runTossRealtimeSmoke({
      sessionStatus: () => sessionStore.status(),
      realtimeService,
      durationMs: boundedIntegerArg(
        'sse-duration-ms',
        DEFAULT_SSE_DURATION_MS,
        MIN_SSE_DURATION_MS,
        MAX_SSE_DURATION_MS,
      ),
    }),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'ok') {
    process.exitCode = 0;
  } else if (report.outcome === 'login_incomplete') {
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    outcome: 'failed',
    errorCode: 'TOSS_ACCEPTANCE_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
