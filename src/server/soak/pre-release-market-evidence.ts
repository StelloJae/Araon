import type {
  CandleApiItem,
  MarketTopMoverItem,
  MarketTopMoversResponse,
  Price,
  TossRealtimeRankingItem,
  TossRealtimeRankingResponse,
} from '@shared/types.js';
import type { MarketQuoteBatchResult } from '../market/market-data-provider.js';
import { evaluateSoakSamples } from './soak-evaluator.js';

export type PreReleaseEvidenceEndpoint =
  | 'top-movers'
  | 'realtime-ranking'
  | 'quote-batch'
  | 'candles'
  | 'runtime-health';

export interface PreReleaseMarketEvidenceSample {
  endpoint: PreReleaseEvidenceEndpoint;
  sampledAt: string;
  status: number;
  durationMs: number;
  bodyText: string;
}

export interface PreReleaseMarketEvidenceInput {
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  intervalMs: number;
  selectedTicker: string;
  quoteTickers: readonly string[];
  samples: readonly PreReleaseMarketEvidenceSample[];
}

export interface PreReleaseEvidenceEndpointSummary {
  endpoint: PreReleaseEvidenceEndpoint;
  sampleCount: number;
  okCount: number;
  httpErrorCount: number;
  parseErrorCount: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  maxDurationMs: number | null;
}

export interface PreReleaseEvidenceMovementSummary {
  observed: boolean;
  rankOrderObserved?: boolean;
  valueMovementObserved: boolean;
  distinctRankOrders?: number;
  distinctValueStates: number;
  goodSamples: number;
}

export interface PreReleaseChartProgressionSummary {
  observed: boolean;
  distinctLastCandles: number;
  goodSamples: number;
  newestBucketAt: string | null;
  latestSampleCount: number | null;
}

export interface PreReleaseSampleCadenceSummary {
  ok: boolean;
  requestedIntervalMs: number;
  p95AllowedGapMs: number;
  maxAllowedGapMs: number;
  p95GapMs: number | null;
  maxGapMs: number | null;
  gapCount: number;
}

export interface PreReleaseFastQuoteLaneSummary {
  ok: boolean;
  observed: boolean;
  configured: boolean;
  running: boolean;
  sourceOk: boolean;
  intervalOk: boolean;
  capOk: boolean;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  maxTargetCap: number | null;
  maxHardCap: number | null;
  maxCandidateCount: number | null;
  maxRequestedCount: number | null;
  maxAcceptedCount: number | null;
  goodSamples: number;
}

export interface PreReleaseMarketWindowSummary {
  kstStartedAt: string | null;
  kstFinishedAt: string | null;
  kstWeekday: boolean;
  regularMarketLikely: boolean;
  integratedLiveWindowLikely: boolean;
  note: string;
}

export interface PreReleaseMarketEvidenceReport {
  ok: boolean;
  marketEvidenceReady: boolean;
  completionReady: boolean;
  finalGoalCompletionReady: boolean;
  finalGoalRemainingNeed: string;
  evidenceScope: 'read-only-market-data';
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  intervalMs: number;
  selectedTicker: string;
  quoteTickers: string[];
  sampleCount: number;
  endpointSummaries: PreReleaseEvidenceEndpointSummary[];
  top100Cadence: PreReleaseEvidenceMovementSummary;
  realtimeRankingCadence: PreReleaseEvidenceMovementSummary;
  quoteSampleCadence: PreReleaseEvidenceMovementSummary;
  chartProgression: PreReleaseChartProgressionSummary;
  sampleCadence: PreReleaseSampleCadenceSummary;
  fastQuoteLane: PreReleaseFastQuoteLaneSummary;
  marketWindow: PreReleaseMarketWindowSummary;
  latency: {
    ok: boolean;
    p95DurationMs: number | null;
    maxDurationMs: number | null;
  };
  marketHoursUseful: boolean;
  completionCriteria: PreReleaseMarketEvidenceCriterion[];
  issues: Array<{ endpoint: string; code: string; message: string }>;
  blockers: string[];
}

export interface PreReleaseMarketEvidenceCriterion {
  criterion: 12 | 13 | 14 | 16 | 17 | 41;
  label: string;
  status: 'pass' | 'supporting' | 'blocked';
  evidence: string;
  remainingNeed: string | null;
}

const LATENCY_P95_WARN_MS = 1_500;
const LATENCY_MAX_WARN_MS = 2_500;
const FAST_QUOTE_MIN_INTERVAL_MS = 75;
const FAST_QUOTE_MAX_INTERVAL_MS = 750;
const FAST_QUOTE_MAX_TARGET_CAP = 200;
const FAST_QUOTE_MAX_HARD_CAP = 400;

export function buildPreReleaseMarketEvidenceReport(
  input: PreReleaseMarketEvidenceInput,
): PreReleaseMarketEvidenceReport {
  const samplesByEndpoint = groupSamples(input.samples);
  const endpointSummaries = buildEndpointSummaries(samplesByEndpoint);
  const safety = evaluateSoakSamples(
    input.samples.map((sample) => ({
      endpoint: sample.endpoint,
      status: sample.status,
      bodyText: sample.bodyText,
    })),
  );

  const topMovers = parseEndpointData<MarketTopMoversResponse>(
    samplesByEndpoint.get('top-movers') ?? [],
  );
  const realtimeRankings = parseEndpointData<TossRealtimeRankingResponse>(
    samplesByEndpoint.get('realtime-ranking') ?? [],
  );
  const quotes = parseEndpointData<MarketQuoteBatchResult>(
    samplesByEndpoint.get('quote-batch') ?? [],
  );
  const candlePages = parseEndpointData<{
    ticker: string;
    interval: string;
    items: CandleApiItem[];
  }>(samplesByEndpoint.get('candles') ?? []);
  const runtimeHealth = parseEndpointData<RuntimeDataHealthPayload>(
    samplesByEndpoint.get('runtime-health') ?? [],
  );

  const top100Cadence = summarizeTopMoverCadence(topMovers);
  const realtimeRankingCadence = summarizeRealtimeRankingCadence(realtimeRankings);
  const quoteSampleCadence = summarizeQuoteCadence(quotes);
  const chartProgression = summarizeChartProgression(candlePages);
  const sampleCadence = summarizeSampleCadence(samplesByEndpoint, input.intervalMs);
  const fastQuoteLane = summarizeFastQuoteLane(runtimeHealth);
  const marketWindow = summarizeMarketWindow(input.startedAt, input.finishedAt);
  const latency = summarizeLatency(input.samples);
  const marketHoursUseful =
    top100Cadence.observed ||
    realtimeRankingCadence.observed ||
    quoteSampleCadence.observed ||
    chartProgression.observed;
  const rankReorderObserved =
    top100Cadence.rankOrderObserved === true ||
    realtimeRankingCadence.rankOrderObserved === true;

  const blockers = [
    ...(!top100Cadence.observed ? ['TOP100 rank/value movement was not observed.'] : []),
    ...(!realtimeRankingCadence.observed
      ? ['Toss realtime ranking movement was not observed.']
      : []),
    ...(!rankReorderObserved ? ['TOP100/realtime rank reorder was not observed.'] : []),
    ...(!quoteSampleCadence.observed ? ['Quote sample movement was not observed.'] : []),
    ...(!chartProgression.observed
      ? ['Selected ticker candle progression was not observed.']
      : []),
    ...(!marketWindow.integratedLiveWindowLikely
      ? ['Evidence window was outside Araon integrated Korean-market live hours.']
      : []),
    ...(!fastQuoteLane.ok ? ['Toss fast quote lane runtime was not healthy.'] : []),
    ...(!sampleCadence.ok ? ['Sample cadence exceeded the pre-release evidence threshold.'] : []),
    ...(!latency.ok ? ['Endpoint latency exceeded the pre-release evidence threshold.'] : []),
    ...(!marketHoursUseful ? ['No live-like market-hours movement was observed.'] : []),
  ];
  const completionCriteria = buildCompletionCriteria({
    top100Cadence,
    realtimeRankingCadence,
    quoteSampleCadence,
    chartProgression,
    sampleCadence,
    fastQuoteLane,
    marketWindow,
    latency,
  });

  const marketEvidenceReady = blockers.length === 0 && safety.ok;
  return {
    ok: safety.ok && latency.ok,
    marketEvidenceReady,
    completionReady: marketEvidenceReady,
    finalGoalCompletionReady: false,
    finalGoalRemainingNeed:
      'This report only proves read-only market data evidence. Final Araon goal completion still requires browser/Computer Use visual QA and the written completion audit.',
    evidenceScope: 'read-only-market-data',
    targetUrl: input.targetUrl,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    intervalMs: input.intervalMs,
    selectedTicker: input.selectedTicker,
    quoteTickers: [...input.quoteTickers],
    sampleCount: input.samples.length,
    endpointSummaries,
    top100Cadence,
    realtimeRankingCadence,
    quoteSampleCadence,
    chartProgression,
    sampleCadence,
    fastQuoteLane,
    marketWindow,
    latency,
    marketHoursUseful,
    completionCriteria,
    issues: safety.issues,
    blockers,
  };
}

function buildCompletionCriteria(input: {
  top100Cadence: PreReleaseEvidenceMovementSummary;
  realtimeRankingCadence: PreReleaseEvidenceMovementSummary;
  quoteSampleCadence: PreReleaseEvidenceMovementSummary;
  chartProgression: PreReleaseChartProgressionSummary;
  sampleCadence: PreReleaseSampleCadenceSummary;
  fastQuoteLane: PreReleaseFastQuoteLaneSummary;
  marketWindow: PreReleaseMarketWindowSummary;
  latency: { ok: boolean; p95DurationMs: number | null; maxDurationMs: number | null };
}): PreReleaseMarketEvidenceCriterion[] {
  const liveWindowOk = input.marketWindow.integratedLiveWindowLikely;
  const rankingReady = input.top100Cadence.observed && input.realtimeRankingCadence.observed;
  const rankReorderObserved =
    input.top100Cadence.rankOrderObserved === true ||
    input.realtimeRankingCadence.rankOrderObserved === true;
  return [
    {
      criterion: 12,
      label: 'TOP100 updates/reorders at intended cadence without severe lag',
      status:
        liveWindowOk &&
        rankingReady &&
        rankReorderObserved &&
        input.sampleCadence.ok &&
        input.latency.ok
          ? 'pass'
          : 'blocked',
      evidence: `liveWindowOk=${liveWindowOk}; top100Observed=${input.top100Cadence.observed}; realtimeRankingObserved=${input.realtimeRankingCadence.observed}; top100RankReorderObserved=${input.top100Cadence.rankOrderObserved === true}; realtimeRankReorderObserved=${input.realtimeRankingCadence.rankOrderObserved === true}; sampleGapP95Ms=${input.sampleCadence.p95GapMs ?? 'n/a'}; endpointP95Ms=${input.latency.p95DurationMs ?? 'n/a'}`,
      remainingNeed:
        liveWindowOk &&
        rankingReady &&
        rankReorderObserved &&
        input.sampleCadence.ok &&
        input.latency.ok
          ? null
          : 'Run during Araon integrated Korean-market live hours until TOP100/realtime ranking movement, rank reorder, and healthy sample cadence are observed.',
    },
    {
      criterion: 13,
      label: 'Recent surge uses toss-fast-quote and ws-integrated, not generic REST',
      status: input.fastQuoteLane.ok ? 'supporting' : 'blocked',
      evidence: `fastQuoteSourceOk=${input.fastQuoteLane.sourceOk}; running=${input.fastQuoteLane.running}; intervalMs=${input.fastQuoteLane.minIntervalMs ?? 'n/a'}-${input.fastQuoteLane.maxIntervalMs ?? 'n/a'}; maxTargetCap=${input.fastQuoteLane.maxTargetCap ?? 'n/a'}; maxHardCap=${input.fastQuoteLane.maxHardCap ?? 'n/a'}; maxAcceptedCount=${input.fastQuoteLane.maxAcceptedCount ?? 'n/a'}`,
      remainingNeed:
        input.fastQuoteLane.ok
          ? 'Client surge tests still prove source filtering; market-hours UI must show realtime surge behavior from moving prices.'
          : 'Runtime data-health must show a running bounded toss-fast-quote lane with safe caps.',
    },
    {
      criterion: 14,
      label: 'Recent surge threshold/cooldown is correct',
      status:
        liveWindowOk && input.quoteSampleCadence.observed && input.fastQuoteLane.ok
          ? 'supporting'
          : 'blocked',
      evidence: `liveWindowOk=${liveWindowOk}; quoteMovementObserved=${input.quoteSampleCadence.observed}; distinctValueStates=${input.quoteSampleCadence.distinctValueStates}; fastQuoteLaneOk=${input.fastQuoteLane.ok}`,
      remainingNeed:
        'This harness only proves bounded quote movement input. Browser UI/toast observation must still prove threshold and cooldown behavior.',
    },
    {
      criterion: 16,
      label: 'Mini chart updates current candle from real samples without refresh',
      status: liveWindowOk && input.chartProgression.observed ? 'supporting' : 'blocked',
      evidence: `liveWindowOk=${liveWindowOk}; chartProgressionObserved=${input.chartProgression.observed}; newestBucketAt=${input.chartProgression.newestBucketAt ?? 'n/a'}; latestSampleCount=${input.chartProgression.latestSampleCount ?? 'n/a'}`,
      remainingNeed:
        liveWindowOk && input.chartProgression.observed
          ? 'Browser visual QA must still confirm mini chart renders the progression without refresh.'
          : 'Run during market hours until selected ticker candle progression is observed.',
    },
    {
      criterion: 17,
      label: 'Full chart updates current candle from real samples without refresh',
      status: liveWindowOk && input.chartProgression.observed ? 'supporting' : 'blocked',
      evidence: `liveWindowOk=${liveWindowOk}; chartProgressionObserved=${input.chartProgression.observed}; newestBucketAt=${input.chartProgression.newestBucketAt ?? 'n/a'}; latestSampleCount=${input.chartProgression.latestSampleCount ?? 'n/a'}`,
      remainingNeed:
        liveWindowOk && input.chartProgression.observed
          ? 'Browser visual QA must still confirm full chart renders the progression without refresh.'
          : 'Run during market hours until selected ticker candle progression is observed.',
    },
    {
      criterion: 41,
      label: 'Real browser visual QA passes',
      status: liveWindowOk && input.sampleCadence.ok && input.latency.ok ? 'supporting' : 'blocked',
      evidence: `liveWindowOk=${liveWindowOk}; sampleGapP95Ms=${input.sampleCadence.p95GapMs ?? 'n/a'}; endpointP95Ms=${input.latency.p95DurationMs ?? 'n/a'}; endpointMaxMs=${input.latency.maxDurationMs ?? 'n/a'}`,
      remainingNeed:
        'Harness latency is supporting evidence only. Browser/Computer Use QA must still confirm no visible severe lag.',
    },
  ];
}

function summarizeMarketWindow(
  startedAt: string,
  finishedAt: string,
): PreReleaseMarketWindowSummary {
  const start = parseKstClock(startedAt);
  const finish = parseKstClock(finishedAt);
  const kstWeekday = start !== null && finish !== null && start.weekday && finish.weekday;
  const regularMarketLikely =
    kstWeekday &&
    start !== null &&
    finish !== null &&
    isWithinMinutes(start.minutes, 9 * 60, 15 * 60 + 30) &&
    isWithinMinutes(finish.minutes, 9 * 60, 15 * 60 + 30);
  const integratedLiveWindowLikely =
    kstWeekday &&
    start !== null &&
    finish !== null &&
    isWithinMinutes(start.minutes, 8 * 60, 20 * 60) &&
    isWithinMinutes(finish.minutes, 8 * 60, 20 * 60);
  const note = regularMarketLikely
    ? 'KST weekday regular KRX market-hours heuristic. Official holiday calendar is not checked.'
    : integratedLiveWindowLikely
      ? 'KST weekday integrated live window, but outside regular KRX market-hours evidence window. Official holiday calendar is not checked.'
      : 'Outside Araon integrated Korean-market live window by KST weekday/time heuristic. Official holiday calendar is not checked.';

  return {
    kstStartedAt: start?.label ?? null,
    kstFinishedAt: finish?.label ?? null,
    kstWeekday,
    regularMarketLikely,
    integratedLiveWindowLikely,
    note,
  };
}

function parseKstClock(raw: string): { label: string; minutes: number; weekday: boolean } | null {
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + 9 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const weekdayIndex = shifted.getUTCDay();
  return {
    label: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)} KST`,
    minutes: hour * 60 + minute,
    weekday: weekdayIndex >= 1 && weekdayIndex <= 5,
  };
}

function isWithinMinutes(minutes: number, startInclusive: number, endInclusive: number): boolean {
  return minutes >= startInclusive && minutes <= endInclusive;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function groupSamples(
  samples: readonly PreReleaseMarketEvidenceSample[],
): Map<PreReleaseEvidenceEndpoint, PreReleaseMarketEvidenceSample[]> {
  const out = new Map<PreReleaseEvidenceEndpoint, PreReleaseMarketEvidenceSample[]>();
  for (const sample of samples) {
    const current = out.get(sample.endpoint) ?? [];
    current.push(sample);
    out.set(sample.endpoint, current);
  }
  return out;
}

function buildEndpointSummaries(
  samplesByEndpoint: Map<PreReleaseEvidenceEndpoint, PreReleaseMarketEvidenceSample[]>,
): PreReleaseEvidenceEndpointSummary[] {
  return (
    ['top-movers', 'realtime-ranking', 'quote-batch', 'candles', 'runtime-health'] as const
  ).map((endpoint) => {
    const samples = samplesByEndpoint.get(endpoint) ?? [];
    const durations = samples.map((sample) => sample.durationMs);
    return {
      endpoint,
      sampleCount: samples.length,
      okCount: samples.filter((sample) => sample.status >= 200 && sample.status < 300).length,
      httpErrorCount: samples.filter((sample) => sample.status < 200 || sample.status >= 300)
        .length,
      parseErrorCount: samples.filter((sample) => parseDataEnvelope(sample.bodyText) === null)
        .length,
      avgDurationMs: average(durations),
      p95DurationMs: percentile(durations, 0.95),
      maxDurationMs: durations.length === 0 ? null : Math.max(...durations),
    };
  });
}

function parseEndpointData<T>(
  samples: readonly PreReleaseMarketEvidenceSample[],
): T[] {
  const out: T[] = [];
  for (const sample of samples) {
    if (sample.status < 200 || sample.status >= 300) continue;
    const data = parseDataEnvelope(sample.bodyText);
    if (data !== null) out.push(data as T);
  }
  return out;
}

function parseDataEnvelope(bodyText: string): unknown | null {
  try {
    const parsed = JSON.parse(bodyText) as { success?: unknown; data?: unknown };
    if (parsed.success !== true) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function summarizeTopMoverCadence(
  responses: readonly MarketTopMoversResponse[],
): PreReleaseEvidenceMovementSummary {
  const rankOrders = new Set<string>();
  const valueStates = new Set<string>();
  for (const response of responses) {
    const gainers = response.gainers.slice(0, 40);
    const losers = response.losers.slice(0, 40);
    rankOrders.add(`${rankOrderSignature(gainers)}|${rankOrderSignature(losers)}`);
    valueStates.add(`${topMoverValueSignature(gainers)}|${topMoverValueSignature(losers)}`);
  }
  return {
    observed: rankOrders.size > 1 || valueStates.size > 1,
    rankOrderObserved: rankOrders.size > 1,
    valueMovementObserved: valueStates.size > 1,
    distinctRankOrders: rankOrders.size,
    distinctValueStates: valueStates.size,
    goodSamples: responses.length,
  };
}

function summarizeRealtimeRankingCadence(
  responses: readonly TossRealtimeRankingResponse[],
): PreReleaseEvidenceMovementSummary {
  const rankOrders = new Set<string>();
  const valueStates = new Set<string>();
  for (const response of responses) {
    const items = response.items.slice(0, 60);
    rankOrders.add(rankOrderSignature(items));
    valueStates.add(realtimeRankingValueSignature(items));
  }
  return {
    observed: rankOrders.size > 1 || valueStates.size > 1,
    rankOrderObserved: rankOrders.size > 1,
    valueMovementObserved: valueStates.size > 1,
    distinctRankOrders: rankOrders.size,
    distinctValueStates: valueStates.size,
    goodSamples: responses.length,
  };
}

function summarizeQuoteCadence(
  responses: readonly MarketQuoteBatchResult[],
): PreReleaseEvidenceMovementSummary {
  const valueStates = new Set<string>();
  for (const response of responses) {
    valueStates.add(quoteValueSignature(response.prices));
  }
  return {
    observed: valueStates.size > 1,
    valueMovementObserved: valueStates.size > 1,
    distinctValueStates: valueStates.size,
    goodSamples: responses.length,
  };
}

function summarizeChartProgression(
  pages: ReadonlyArray<{ items: CandleApiItem[] }>,
): PreReleaseChartProgressionSummary {
  const lastCandles = pages
    .map((page) => page.items[page.items.length - 1])
    .filter((item): item is CandleApiItem => item !== undefined);
  const signatures = new Set(lastCandles.map(candleSignature));
  const latest = lastCandles[lastCandles.length - 1] ?? null;
  return {
    observed: signatures.size > 1,
    distinctLastCandles: signatures.size,
    goodSamples: lastCandles.length,
    newestBucketAt: latest?.bucketAt ?? null,
    latestSampleCount: latest?.sampleCount ?? null,
  };
}

interface RuntimeDataHealthPayload {
  tossFastQuoteLane?: {
    configured?: unknown;
    running?: unknown;
    source?: unknown;
    intervalMs?: unknown;
    targetCap?: unknown;
    hardCap?: unknown;
    candidateCount?: unknown;
    requestedCount?: unknown;
    acceptedCount?: unknown;
  };
}

function summarizeFastQuoteLane(
  responses: readonly RuntimeDataHealthPayload[],
): PreReleaseFastQuoteLaneSummary {
  const intervals: number[] = [];
  const targetCaps: number[] = [];
  const hardCaps: number[] = [];
  const candidateCounts: number[] = [];
  const requestedCounts: number[] = [];
  const acceptedCounts: number[] = [];
  let configured = false;
  let running = false;
  let sourceOk = false;
  let goodSamples = 0;

  for (const response of responses) {
    const lane = response.tossFastQuoteLane;
    if (lane === undefined || lane === null) continue;
    goodSamples += 1;
    configured ||= lane.configured === true;
    running ||= lane.running === true;
    sourceOk ||= lane.source === 'toss-fast-quote';
    pushNumber(intervals, lane.intervalMs);
    pushNumber(targetCaps, lane.targetCap);
    pushNumber(hardCaps, lane.hardCap);
    pushNumber(candidateCounts, lane.candidateCount);
    pushNumber(requestedCounts, lane.requestedCount);
    pushNumber(acceptedCounts, lane.acceptedCount);
  }

  const minIntervalMs = intervals.length === 0 ? null : Math.min(...intervals);
  const maxIntervalMs = intervals.length === 0 ? null : Math.max(...intervals);
  const maxTargetCap = targetCaps.length === 0 ? null : Math.max(...targetCaps);
  const maxHardCap = hardCaps.length === 0 ? null : Math.max(...hardCaps);
  const maxCandidateCount = candidateCounts.length === 0 ? null : Math.max(...candidateCounts);
  const maxRequestedCount = requestedCounts.length === 0 ? null : Math.max(...requestedCounts);
  const maxAcceptedCount = acceptedCounts.length === 0 ? null : Math.max(...acceptedCounts);
  const intervalOk =
    minIntervalMs !== null &&
    maxIntervalMs !== null &&
    minIntervalMs >= FAST_QUOTE_MIN_INTERVAL_MS &&
    maxIntervalMs <= FAST_QUOTE_MAX_INTERVAL_MS;
  const capOk =
    maxTargetCap !== null &&
    maxHardCap !== null &&
    maxTargetCap <= FAST_QUOTE_MAX_TARGET_CAP &&
    maxHardCap <= FAST_QUOTE_MAX_HARD_CAP &&
    (maxCandidateCount ?? 0) <= maxHardCap &&
    (maxRequestedCount ?? 0) <= maxHardCap;

  return {
    ok: goodSamples > 0 && configured && running && sourceOk && intervalOk && capOk,
    observed: goodSamples > 0,
    configured,
    running,
    sourceOk,
    intervalOk,
    capOk,
    minIntervalMs,
    maxIntervalMs,
    maxTargetCap,
    maxHardCap,
    maxCandidateCount,
    maxRequestedCount,
    maxAcceptedCount,
    goodSamples,
  };
}

function pushNumber(out: number[], value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(value);
  }
}

function summarizeSampleCadence(
  samplesByEndpoint: Map<PreReleaseEvidenceEndpoint, PreReleaseMarketEvidenceSample[]>,
  requestedIntervalMs: number,
): PreReleaseSampleCadenceSummary {
  const gaps: number[] = [];
  for (const samples of samplesByEndpoint.values()) {
    const times = samples
      .map((sample) => Date.parse(sample.sampledAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    for (let index = 1; index < times.length; index += 1) {
      const gap = (times[index] ?? 0) - (times[index - 1] ?? 0);
      if (gap >= 0) gaps.push(gap);
    }
  }
  const p95AllowedGapMs = Math.max(requestedIntervalMs + 500, 1_000);
  const maxAllowedGapMs = Math.max(requestedIntervalMs * 2 + 750, 1_750);
  const p95GapMs = percentile(gaps, 0.95);
  const maxGapMs = gaps.length === 0 ? null : Math.max(...gaps);
  return {
    ok: (p95GapMs ?? 0) <= p95AllowedGapMs && (maxGapMs ?? 0) <= maxAllowedGapMs,
    requestedIntervalMs,
    p95AllowedGapMs,
    maxAllowedGapMs,
    p95GapMs,
    maxGapMs,
    gapCount: gaps.length,
  };
}

function summarizeLatency(samples: readonly PreReleaseMarketEvidenceSample[]): {
  ok: boolean;
  p95DurationMs: number | null;
  maxDurationMs: number | null;
} {
  const durations = samples.map((sample) => sample.durationMs);
  const p95DurationMs = percentile(durations, 0.95);
  const maxDurationMs = durations.length === 0 ? null : Math.max(...durations);
  return {
    ok:
      (p95DurationMs ?? 0) <= LATENCY_P95_WARN_MS &&
      (maxDurationMs ?? 0) <= LATENCY_MAX_WARN_MS,
    p95DurationMs,
    maxDurationMs,
  };
}

function rankOrderSignature(
  items: ReadonlyArray<MarketTopMoverItem | TossRealtimeRankingItem>,
): string {
  return items.map((item) => `${item.rank}:${item.ticker}`).join(',');
}

function topMoverValueSignature(items: readonly MarketTopMoverItem[]): string {
  return items
    .map((item) => `${item.rank}:${item.ticker}:${item.price}:${item.changePct}`)
    .join(',');
}

function realtimeRankingValueSignature(items: readonly TossRealtimeRankingItem[]): string {
  return items
    .map((item) => `${item.rank}:${item.ticker}:${item.price ?? ''}:${item.changePct ?? ''}`)
    .join(',');
}

function quoteValueSignature(items: readonly Price[]): string {
  return items
    .map(
      (item) =>
        `${item.ticker}:${item.price}:${item.changeRate}:${item.changeAbs ?? ''}:${
          item.volume
        }:${
          item.source ?? ''
        }`,
    )
    .sort()
    .join(',');
}

function candleSignature(item: CandleApiItem): string {
  return `${item.bucketAt}:${item.open}:${item.high}:${item.low}:${item.close}:${item.volume}:${item.sampleCount}:${item.source ?? ''}`;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}
