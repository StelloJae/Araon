export type TossAnalysisCandidateHostId = 'info' | 'cert';

export interface TossAnalysisCandidateHostTarget {
  readonly id: TossAnalysisCandidateHostId;
  readonly baseUrl: string;
  readonly hostname: string;
}

export interface TossAnalysisCandidateShapeSummary {
  readonly topLevelObject: boolean;
  readonly topLevelKeyCount: number | null;
  readonly hasResult: boolean;
  readonly resultType: string;
  readonly resultKeyCount: number | null;
  readonly resultItemCount: number | null;
}

export interface TossAnalysisCandidateSample {
  readonly ticker: string;
  readonly host: TossAnalysisCandidateHostId;
  readonly hostname: string;
  readonly httpStatus: number | null;
  readonly ok: boolean;
  readonly shape?: TossAnalysisCandidateShapeSummary;
  readonly errorCode?: 'TOSS_ANALYSIS_CANDIDATE_FETCH_FAILED';
}

export interface TossAnalysisCandidateSmokeSummary {
  readonly hostCount: number;
  readonly sampleCount: number;
  readonly okSampleCount: number;
  readonly tickerWithOkCount: number;
  readonly nonNullResultSampleCount: number;
  readonly tickerWithNonNullResultCount: number;
  readonly resultTypeCounts: Readonly<Record<string, number>>;
}

export interface TossAnalysisCandidateSmokeReport {
  readonly provider: 'toss';
  readonly surface: 'trading-analysis-product-code';
  readonly outcome: 'ok' | 'failed';
  readonly externalCallsEnabled: true;
  readonly rawPayloadExposed: false;
  readonly rawSessionExposed: false;
  readonly summary: TossAnalysisCandidateSmokeSummary;
  readonly samples: readonly TossAnalysisCandidateSample[];
}

export interface RunTossAnalysisCandidateSmokeOptions {
  readonly sessionCookies: Readonly<Record<string, string>>;
  readonly tickers?: readonly string[];
  readonly hosts?: readonly TossAnalysisCandidateHostTarget[];
  readonly fetcher?: FetchLike;
}

export interface TossAnalysisCandidateSmokeFormatOptions {
  readonly summaryOnly?: boolean;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const DEFAULT_TICKERS = ['005930', '000660', '254120'] as const;

export const DEFAULT_TOSS_ANALYSIS_HOST_TARGETS: readonly TossAnalysisCandidateHostTarget[] = [
  {
    id: 'info',
    baseUrl: 'https://wts-info-api.tossinvest.com',
    hostname: 'wts-info-api.tossinvest.com',
  },
  {
    id: 'cert',
    baseUrl: 'https://wts-cert-api.tossinvest.com',
    hostname: 'wts-cert-api.tossinvest.com',
  },
] as const;

export async function runTossAnalysisCandidateSmoke(
  options: RunTossAnalysisCandidateSmokeOptions,
): Promise<TossAnalysisCandidateSmokeReport> {
  const fetcher = options.fetcher ?? fetch;
  const tickers = tossAnalysisTickersForValues(options.tickers ?? DEFAULT_TICKERS);
  const hosts = options.hosts?.length
    ? options.hosts
    : DEFAULT_TOSS_ANALYSIS_HOST_TARGETS;
  const samples: TossAnalysisCandidateSample[] = [];

  for (const ticker of tickers) {
    for (const host of hosts) {
      samples.push(await sampleTradingAnalysisHost({
        fetcher,
        host,
        sessionCookies: options.sessionCookies,
        ticker,
      }));
    }
  }

  const tickerWithOkCount = tickers
    .filter((ticker) => samples.some((sample) => sample.ticker === ticker && sample.ok))
    .length;
  const tickerWithNonNullResultCount = tickers
    .filter((ticker) => samples.some((sample) =>
      sample.ticker === ticker && sample.shape?.resultType !== undefined && sample.shape.resultType !== 'null'))
    .length;
  const summary = {
    hostCount: hosts.length,
    sampleCount: samples.length,
    okSampleCount: samples.filter((sample) => sample.ok).length,
    tickerWithOkCount,
    nonNullResultSampleCount: samples
      .filter((sample) => sample.shape?.resultType !== undefined && sample.shape.resultType !== 'null')
      .length,
    tickerWithNonNullResultCount,
    resultTypeCounts: resultTypeCounts(samples),
  };

  return {
    provider: 'toss',
    surface: 'trading-analysis-product-code',
    outcome: tickerWithOkCount === tickers.length ? 'ok' : 'failed',
    externalCallsEnabled: true,
    rawPayloadExposed: false,
    rawSessionExposed: false,
    summary,
    samples,
  };
}

export function tossAnalysisTickersForArg(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) return [...DEFAULT_TICKERS];
  return tossAnalysisTickersForValues(raw.split(','));
}

export function tossAnalysisHostTargetsForArg(raw: string | undefined): readonly TossAnalysisCandidateHostTarget[] {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_TOSS_ANALYSIS_HOST_TARGETS;
  }
  const requested = new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
  const hosts = DEFAULT_TOSS_ANALYSIS_HOST_TARGETS
    .filter((host) => requested.has(host.id));
  return hosts.length > 0 ? hosts : DEFAULT_TOSS_ANALYSIS_HOST_TARGETS;
}

export function formatTossAnalysisCandidateSmokeReport(
  report: TossAnalysisCandidateSmokeReport,
  options: TossAnalysisCandidateSmokeFormatOptions = {},
): TossAnalysisCandidateSmokeReport {
  if (options.summaryOnly !== true) return report;
  return {
    ...report,
    samples: [],
  };
}

async function sampleTradingAnalysisHost(options: {
  readonly fetcher: FetchLike;
  readonly host: TossAnalysisCandidateHostTarget;
  readonly sessionCookies: Readonly<Record<string, string>>;
  readonly ticker: string;
}): Promise<TossAnalysisCandidateSample> {
  const productCode = `A${options.ticker}`;
  const url = new URL(
    `/api/v1/trading/analysis/productCode/${productCode}`,
    options.host.baseUrl,
  );

  try {
    const res = await options.fetcher(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Cookie: cookieHeader(options.sessionCookies),
        origin: 'https://www.tossinvest.com',
        referer: `https://www.tossinvest.com/stocks/${productCode}`,
        'user-agent': DEFAULT_BROWSER_USER_AGENT,
      },
    });
    const shape = res.ok ? summarizeShape(await res.json()) : undefined;
    return {
      ticker: options.ticker,
      host: options.host.id,
      hostname: options.host.hostname,
      httpStatus: res.status,
      ok: res.ok,
      ...(shape === undefined ? {} : { shape }),
    };
  } catch {
    return {
      ticker: options.ticker,
      host: options.host.id,
      hostname: options.host.hostname,
      httpStatus: null,
      ok: false,
      errorCode: 'TOSS_ANALYSIS_CANDIDATE_FETCH_FAILED',
    };
  }
}

function resultTypeCounts(
  samples: readonly TossAnalysisCandidateSample[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const sample of samples) {
    const key = sample.shape?.resultType ?? 'missing';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function tossAnalysisTickersForValues(values: readonly string[]): string[] {
  const tickers = values
    .map((value) => value.trim())
    .filter((value) => /^\d{6}$/.test(value));
  return tickers.length > 0 ? tickers : [...DEFAULT_TICKERS];
}

function summarizeShape(value: unknown): TossAnalysisCandidateShapeSummary {
  const topLevel = asRecord(value);
  const result = topLevel?.['result'];
  const resultRecord = asRecord(result);
  return {
    topLevelObject: topLevel !== null,
    topLevelKeyCount: topLevel === null ? null : Object.keys(topLevel).length,
    hasResult: topLevel !== null && Object.hasOwn(topLevel, 'result'),
    resultType: typeName(result),
    resultKeyCount: resultRecord === null ? null : Object.keys(resultRecord).length,
    resultItemCount: Array.isArray(result) ? result.length : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function cookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('; ');
}
