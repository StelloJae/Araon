export function shouldAutoRefreshLegacyKisMaster(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env['ARAON_KIS_MASTER_AUTO_REFRESH'] === '1';
}

export function shouldUseLegacyKisChartFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env['ARAON_KIS_CHART_FALLBACK_ENABLED'] === '1';
}

export function shouldUseLegacyKisQuoteFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env['ARAON_KIS_QUOTE_FALLBACK_ENABLED'] === '1';
}

export function shouldUseLegacyKisPollingFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env['ARAON_KIS_POLLING_FALLBACK_ENABLED'] === '1';
}
