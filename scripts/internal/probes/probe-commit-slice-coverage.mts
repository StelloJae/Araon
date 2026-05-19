import { execFileSync } from 'node:child_process';

type Slice =
  | 'A_docs_evidence'
  | 'F_cli_package'
  | 'G_kis_containment'
  | 'B_toss_identity_watchlist'
  | 'C_realtime_chart_surge'
  | 'E_agent_safety'
  | 'D_frontend_ui'
  | 'X_cross_slice_hunk_review'
  | 'Z_excluded_visual_artifact';

type ClassifiedPath = {
  path: string;
  status: string;
  slice: Slice | 'UNKNOWN';
  reason: string;
};

const output = execFileSync('git', ['status', '--short', '-uall'], {
  encoding: 'utf8',
});

const entries = output
  .split('\n')
  .map((line) => line.trimEnd())
  .filter(Boolean)
  .map((line) => {
    const status = line.slice(0, 2).trim() || '??';
    const rawPath = line.slice(3).trim();
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) ?? rawPath : rawPath;
    return { path, status };
  });

function matches(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

function classify(path: string): Omit<ClassifiedPath, 'path' | 'status'> {
  if (matches(path, [/^araon-.*\.(png|md)$/])) {
    return {
      slice: 'Z_excluded_visual_artifact',
      reason: 'repo-root visual QA artifact; exclude from commit unless explicitly selected',
    };
  }

  if (
    matches(path, [
      /^docs\/research\/.*\.md$/,
      /^docs\/archive\/.*\.(md|json)$/,
      /^docs\/design\.md$/,
      /^docs\/frontend-.*\.md$/,
    ])
  ) {
    return { slice: 'A_docs_evidence', reason: 'research/evidence/goal documentation' };
  }

  if (path === 'package.json') {
    return { slice: 'F_cli_package', reason: 'package script or npm packaging metadata' };
  }

  if (
    matches(path, [
      /^src\/server\/realtime\/kis-ws-/,
      /^src\/server\/realtime\/__tests__\/kis-ws-/,
      /^src\/server\/routes\/kis-ws-slots\.ts$/,
      /^src\/server\/routes\/__tests__\/kis-ws-slots\.test\.ts$/,
    ])
  ) {
    return { slice: 'G_kis_containment', reason: 'optional KIS realtime tracking containment' };
  }

  if (
    matches(path, [
      /^src\/shared\/product-identity\.ts$/,
      /^src\/shared\/__tests__\/product-identity\.test\.ts$/,
      /^src\/server\/watchlist\//,
      /^src\/server\/toss\/toss-(watchlist|portfolio|product-icon|browser-session|cdp-login|login-capture)/,
      /^src\/server\/toss\/__tests__\/toss-(watchlist|portfolio|product-icon|browser-session|login-capture)/,
      /^src\/server\/routes\/toss-auth\.ts$/,
      /^src\/server\/routes\/watchlist\.ts$/,
      /^src\/server\/routes\/__tests__\/toss-auth\.test\.ts$/,
      /^src\/server\/routes\/__tests__\/watchlist\.test\.ts$/,
      /^src\/server\/db\/migrations\/022-watchlist-sync-provenance\.sql$/,
      /^src\/client\/stores\/watchlist-store\.ts$/,
      /^src\/client\/stores\/__tests__\/watchlist-store\.test\.ts$/,
      /^src\/client\/lib\/toss-login-flow\.ts$/,
      /^src\/client\/lib\/__tests__\/toss-login-flow\.test\.ts$/,
      /^src\/client\/lib\/__tests__\/watchlist-ui\.test\.ts$/,
    ])
  ) {
    return { slice: 'B_toss_identity_watchlist', reason: 'Toss identity/watchlist/holdings source of truth' };
  }

  if (
    matches(path, [
      /^src\/server\/toss\/toss-(fast-quote-lane|quote-polling-service|sse-refresh-executor)\.ts$/,
      /^src\/server\/toss\/__tests__\/toss-(fast-quote-lane|quote-polling-service|sse-refresh-executor)\.test\.ts$/,
      /^src\/server\/market\/market-top-movers-service\.ts$/,
      /^src\/server\/routes\/__tests__\/(candles|price-history|runtime|stock-timeline)\.test\.ts$/,
      /^src\/client\/components\/(StockCandleChart|SurgeBlock|TopMoversBoard)\.tsx$/,
      /^src\/client\/components\/__tests__\/(stock-candle-chart|top100-view)\.test\.ts$/,
      /^src\/client\/hooks\/usePersistedPriceHistory\.ts$/,
      /^src\/client\/lib\/surge-aggregator\.ts$/,
      /^src\/client\/lib\/__tests__\/surge-aggregator\.test\.ts$/,
      /^scripts\/internal\/probes\/probe-favorite-sparkline-coverage\.mts$/,
      /^scripts\/internal\/probes\/probe-pre-release-product-100-audit\.mts$/,
      /^scripts\/internal\/soak\/pre-release-market-evidence/,
      /^src\/server\/soak\/pre-release-market-evidence/,
      /^src\/server\/soak\/__tests__\/pre-release-market-evidence/,
      /^src\/server\/audit\/pre-release-product-100-audit\.ts$/,
      /^src\/server\/audit\/__tests__\/pre-release-product-100-audit\.test\.ts$/,
    ])
  ) {
    return { slice: 'C_realtime_chart_surge', reason: 'TOP100/fast quote/surge/chart evidence path' };
  }

  if (
    matches(path, [
      /^src\/server\/agent\//,
      /^src\/server\/routes\/agent-order-intents\.ts$/,
      /^src\/server\/routes\/__tests__\/agent-(events|order-intents)\.test\.ts$/,
      /^src\/server\/db\/migrations\/02(0|1|3|4)-/,
      /^src\/client\/components\/(AgentDecisionSummary|AgentEventsRail|OrderIntentSafetyRail|OrderSafetyModal)\.tsx$/,
      /^src\/client\/components\/__tests__\/(agent-decision-summary|agent-events-rail|order-intent-safety-rail|order-safety-modal)\.test\.ts$/,
      /^src\/client\/lib\/agent-/,
      /^src\/client\/lib\/__tests__\/(agent-|api-client-order-intents)/,
      /^src\/client\/stores\/toast-store\.ts$/,
      /^src\/client\/stores\/__tests__\/toast-store\.test\.ts$/,
    ])
  ) {
    return { slice: 'E_agent_safety', reason: 'agent decision-support, preview, audit, and live-lock safety' };
  }

  if (
    matches(path, [
      /^src\/client\/components\/(ProductAvatar|FavoritesBlock|TossAccountRail|StatusBar|SettingsModal|StockRow|DashboardFocusPanel|SectionStack|StockNewsDisclosurePanel|SSEIndicator|CredentialsSetup)\.tsx$/,
      /^src\/client\/components\/__tests__\/(product-avatar|favorites-block|toss-account-rail|status-bar|managed-operations-settings|stock-news-disclosure-panel|volume-visibility|credentials-setup-copy|surge-block-market-cap|settings-entrypoints)\.test\.ts$/,
      /^src\/client\/hooks\/use(ProductDisplayNames|SSE)\.ts$/,
      /^src\/client\/lib\/(product-display-name|toss-account-rail|dev-market-simulator)\.ts$/,
      /^src\/client\/lib\/__tests__\/(product-display-name|toss-account-rail|dev-market-simulator)\.test\.ts$/,
      /^src\/client\/stores\/product-display-name-store\.ts$/,
      /^src\/client\/styles\/global\.css$/,
    ])
  ) {
    return { slice: 'D_frontend_ui', reason: 'frontend product surface and layout scale lock' };
  }

  if (
    matches(path, [
      /^src\/client\/App\.tsx$/,
      /^src\/client\/lib\/api-client\.ts$/,
      /^src\/server\/app\.ts$/,
      /^src\/server\/routes\/(runtime|stocks)\.ts$/,
      /^src\/server\/db\/repositories\.ts$/,
      /^src\/server\/db\/__tests__\/db\.test\.ts$/,
      /^src\/shared\/types\.ts$/,
      /^src\/server\/sse\/__tests__\/sse-manager\.test\.ts$/,
      /^scripts\/internal\/probes\/probe-toss-watchlist-live-smoke\.mts$/,
      /^scripts\/internal\/probes\/probe-commit-slice-coverage\.mts$/,
    ])
  ) {
    return { slice: 'X_cross_slice_hunk_review', reason: 'mixed ownership; requires hunk-level staging review' };
  }

  return { slice: 'UNKNOWN', reason: 'no slice rule matched' };
}

const classified: ClassifiedPath[] = entries.map((entry) => ({
  ...entry,
  ...classify(entry.path),
}));

const counts = classified.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.slice] = (acc[entry.slice] ?? 0) + 1;
  return acc;
}, {});

const unknown = classified.filter((entry) => entry.slice === 'UNKNOWN');

const result = {
  ok: unknown.length === 0,
  total: classified.length,
  counts,
  unknown,
};

console.log(JSON.stringify(result, null, 2));

if (unknown.length > 0) {
  process.exitCode = 1;
}
