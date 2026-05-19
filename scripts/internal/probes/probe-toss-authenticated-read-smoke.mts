/**
 * Toss authenticated read-only smoke.
 *
 * Purpose:
 * - Run after user-assisted QR login has saved a Toss session.
 * - Exercise authenticated read surfaces without printing raw account, order,
 *   transaction, watchlist, session, cookie, or storage values.
 * - Output only sanitized status/count metadata.
 *
 * Safe no-session behavior:
 * - If no Toss session is persisted, no Toss network calls are made.
 *
 * Usage:
 *   npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts
 *   npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts --news-ticker=005930 --news-name=삼성전자
 */

import { createTossAccountClient } from '../../../src/server/toss/toss-account-client.js';
import { createTossAccountSummaryClient } from '../../../src/server/toss/toss-account-summary-client.js';
import { runTossAuthenticatedReadSmoke } from '../../../src/server/toss/toss-authenticated-read-smoke.js';
import { createTossNewsClient } from '../../../src/server/toss/toss-news-client.js';
import { createTossOrdersClient } from '../../../src/server/toss/toss-orders-client.js';
import {
  createCachingTossPortfolioClient,
  createTossPortfolioClient,
  createTossPortfolioSnapshotStore,
} from '../../../src/server/toss/toss-portfolio-client.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';
import { createTossTransactionsClient } from '../../../src/server/toss/toss-transactions-client.js';
import { createTossWatchlistClient } from '../../../src/server/toss/toss-watchlist-client.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  const sessionStore = createFileTossSessionStore();
  const portfolioSnapshotStore = createTossPortfolioSnapshotStore();
  const newsTicker = argValue('news-ticker') ?? '005930';
  const newsName = argValue('news-name') ?? '삼성전자';

  const report = await runTossAuthenticatedReadSmoke({
    sessionStatus: () => sessionStore.status(),
    clients: {
      account: createTossAccountClient({ sessionStore }),
      accountSummary: createTossAccountSummaryClient({ sessionStore }),
      portfolio: createCachingTossPortfolioClient(
        createTossPortfolioClient({ sessionStore }),
        portfolioSnapshotStore,
      ),
      orders: createTossOrdersClient({ sessionStore }),
      transactions: createTossTransactionsClient({ sessionStore }),
      watchlist: createTossWatchlistClient({ sessionStore }),
      news: createTossNewsClient({ sessionStore }),
    },
    newsProbe: {
      ticker: newsTicker,
      name: newsName,
    },
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === 'session_required') {
    process.exitCode = 2;
  } else if (report.outcome === 'partial') {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    provider: 'toss',
    outcome: 'failed',
    errorCode: 'TOSS_AUTHENTICATED_READ_SMOKE_FAILED',
  }));
  process.exitCode = 1;
});
