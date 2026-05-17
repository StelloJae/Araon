import { createTossSignalRequestBodyTemplateFromCapturedBody } from './toss-signal-client.js';
import type { TossSessionSummary } from './toss-session-store.js';

export interface TossSignalCaptureSmokeRequestInput {
  readonly ticker: string;
  readonly productCode: string;
  readonly name: string;
  readonly timeoutMs: number;
  readonly endpointPath: TossSignalCaptureEndpointPath;
  readonly blockedRoutePathPrefixes: readonly string[];
  readonly headless?: boolean;
}

export type TossSignalCaptureEndpointPath =
  | '/api/v2/dashboard/wts/overview/signals'
  | '/api/v1/dashboard/intelligences/all';

export interface TossSignalCaptureSmokeOptions {
  readonly sessionStatus: () => Promise<TossSessionSummary>;
  readonly captureRequestBody: (
    input: TossSignalCaptureSmokeRequestInput,
  ) => Promise<TossSignalCaptureObservation>;
  readonly writeTemplate?: (templateJson: string) => Promise<void>;
  readonly ticker?: string;
  readonly name?: string;
  readonly endpointPath?: TossSignalCaptureEndpointPath;
  readonly timeoutMs?: number;
  readonly headless?: boolean;
  readonly now?: () => Date;
}

export interface TossSignalCaptureSmokeSessionSummary {
  readonly configured: boolean;
  readonly state: TossSessionSummary['state'];
  readonly persistent: boolean;
}

export type TossSignalCaptureObservation =
  | string
  | null
  | TossSignalCaptureObservationDetails;

export interface TossSignalCaptureObservationDetails {
  readonly rawBody: string | null;
  readonly candidateEndpoints?: readonly TossSignalCaptureCandidateEndpoint[];
}

export interface TossSignalCaptureCandidateEndpoint {
  readonly method: 'GET' | 'POST' | 'UNKNOWN';
  readonly host: string;
  readonly path: string;
  readonly count: number;
}

export interface TossSignalCaptureSmokeReport {
  readonly provider: 'toss';
  readonly surface: 'overview-signals';
  readonly generatedAt: string;
  readonly outcome:
    | 'session_required'
    | 'captured'
    | 'capture_not_observed'
    | 'rejected'
    | 'failed';
  readonly ticker: string;
  readonly productCode: string;
  readonly targetRouteTemplate: '/stocks/{{productCode}}';
  readonly endpointPath: TossSignalCaptureEndpointPath;
  readonly blockedRoutePathPrefixes: readonly string[];
  readonly timeoutMs: number;
  readonly session: TossSignalCaptureSmokeSessionSummary;
  readonly nextAction:
    | 'login_required'
    | 'manual_stock_page_interaction_required'
    | 'review_template_file_then_set_env'
    | 'discard_captured_body'
    | 'inspect_browser_capture_failure';
  readonly captureMode: 'headful' | 'headless';
  readonly directSignalRequestEnabled: false;
  readonly browserObservationEnabled: boolean;
  readonly rawCandidateExposed: false;
  readonly rawTemplateExposed: false;
  readonly observedCandidateEndpointCount: number;
  readonly observedCandidateEndpoints: readonly TossSignalCaptureCandidateEndpoint[];
  readonly templateWritten: boolean;
  readonly templateBytes: number | null;
  readonly placeholderCounts: {
    readonly productCode: number;
    readonly ticker: number;
    readonly name: number;
  } | null;
  readonly rejectionReason: TossSignalCaptureRejectionReason | null;
  readonly errorCode:
    | null
    | 'TOSS_SIGNAL_CAPTURE_REJECTED'
    | 'TOSS_SIGNAL_CAPTURE_FAILED';
}

const DEFAULT_TICKER = '005930';
const DEFAULT_NAME = '삼성전자';
const DEFAULT_ENDPOINT_PATH: TossSignalCaptureEndpointPath =
  '/api/v2/dashboard/wts/overview/signals';
const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const BLOCKED_ROUTE_PATH_PREFIXES = ['/community'] as const;

type TossSignalCaptureRejectionReason =
  | 'invalid_json'
  | 'sensitive_fields'
  | 'invalid_stock_target'
  | 'lacks_stock_placeholders'
  | 'unknown';

export async function runTossSignalCaptureSmoke(
  options: TossSignalCaptureSmokeOptions,
): Promise<TossSignalCaptureSmokeReport> {
  const now = options.now ?? (() => new Date());
  const ticker = normalizeTicker(options.ticker) ?? DEFAULT_TICKER;
  const productCode = krProductCode(ticker);
  const name = normalizeName(options.name) ?? DEFAULT_NAME;
  const endpointPath = options.endpointPath ?? DEFAULT_ENDPOINT_PATH;
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const session = summarizeSession(await options.sessionStatus());
  const base = {
    provider: 'toss' as const,
    surface: 'overview-signals' as const,
    generatedAt: now().toISOString(),
    ticker,
    productCode,
    targetRouteTemplate: '/stocks/{{productCode}}' as const,
    endpointPath,
    blockedRoutePathPrefixes: BLOCKED_ROUTE_PATH_PREFIXES,
    timeoutMs,
    session,
    captureMode: options.headless === true ? 'headless' as const : 'headful' as const,
    directSignalRequestEnabled: false as const,
    rawCandidateExposed: false as const,
    rawTemplateExposed: false as const,
    observedCandidateEndpointCount: 0,
    observedCandidateEndpoints: [] as const,
  };

  if (!isUsableSession(session)) {
    return {
      ...base,
      outcome: 'session_required',
      nextAction: 'login_required',
      browserObservationEnabled: false,
      templateWritten: false,
      templateBytes: null,
      placeholderCounts: null,
      rejectionReason: null,
      errorCode: null,
    };
  }

  let observation: NormalizedTossSignalCaptureObservation;
  try {
    observation = normalizeCaptureObservation(
      await options.captureRequestBody({
        ticker,
        productCode,
        name,
        timeoutMs,
        endpointPath,
        blockedRoutePathPrefixes: BLOCKED_ROUTE_PATH_PREFIXES,
        ...(options.headless === undefined ? {} : { headless: options.headless }),
      }),
    );
  } catch {
    return {
      ...base,
      outcome: 'failed',
      nextAction: 'inspect_browser_capture_failure',
      browserObservationEnabled: true,
      templateWritten: false,
      templateBytes: null,
      placeholderCounts: null,
      rejectionReason: null,
      errorCode: 'TOSS_SIGNAL_CAPTURE_FAILED',
    };
  }

  const observedBase = {
    ...base,
    observedCandidateEndpointCount: observation.candidateEndpoints.length,
    observedCandidateEndpoints: observation.candidateEndpoints,
  };

  if (observation.rawBody === null) {
    return {
      ...observedBase,
      outcome: 'capture_not_observed',
      nextAction: 'manual_stock_page_interaction_required',
      browserObservationEnabled: true,
      templateWritten: false,
      templateBytes: null,
      placeholderCounts: null,
      rejectionReason: null,
      errorCode: null,
    };
  }

  let template: ReturnType<typeof createTossSignalRequestBodyTemplateFromCapturedBody>;
  try {
    template = createTossSignalRequestBodyTemplateFromCapturedBody({
      rawBody: observation.rawBody,
      ticker,
      productCode,
      name,
      allowStaticBody: endpointPath === '/api/v1/dashboard/intelligences/all',
    });
  } catch (err) {
    return {
      ...observedBase,
      outcome: 'rejected',
      nextAction: 'discard_captured_body',
      browserObservationEnabled: true,
      templateWritten: false,
      templateBytes: null,
      placeholderCounts: null,
      rejectionReason: captureRejectionReason(err),
      errorCode: 'TOSS_SIGNAL_CAPTURE_REJECTED',
    };
  }

  try {
    if (options.writeTemplate !== undefined) {
      await options.writeTemplate(template.templateJson);
    }
  } catch {
    return {
      ...observedBase,
      outcome: 'failed',
      nextAction: 'inspect_browser_capture_failure',
      browserObservationEnabled: true,
      templateWritten: false,
      templateBytes: null,
      placeholderCounts: null,
      rejectionReason: null,
      errorCode: 'TOSS_SIGNAL_CAPTURE_FAILED',
    };
  }

  return {
    ...observedBase,
    outcome: 'captured',
    nextAction: 'review_template_file_then_set_env',
    browserObservationEnabled: true,
    templateWritten: options.writeTemplate !== undefined,
    templateBytes: template.templateJson.length,
    placeholderCounts: template.placeholderCounts,
    rejectionReason: null,
    errorCode: null,
  };
}

interface NormalizedTossSignalCaptureObservation {
  readonly rawBody: string | null;
  readonly candidateEndpoints: readonly TossSignalCaptureCandidateEndpoint[];
}

function normalizeCaptureObservation(
  observation: TossSignalCaptureObservation,
): NormalizedTossSignalCaptureObservation {
  if (typeof observation === 'string' || observation === null) {
    return { rawBody: observation, candidateEndpoints: [] };
  }
  return {
    rawBody: observation.rawBody,
    candidateEndpoints: sanitizeCandidateEndpoints(observation.candidateEndpoints ?? []),
  };
}

function sanitizeCandidateEndpoints(
  endpoints: readonly TossSignalCaptureCandidateEndpoint[],
): readonly TossSignalCaptureCandidateEndpoint[] {
  return endpoints
    .map((endpoint) => ({
      method: endpoint.method === 'GET' || endpoint.method === 'POST' ? endpoint.method : 'UNKNOWN' as const,
      host: sanitizeEndpointHost(endpoint.host),
      path: sanitizeEndpointPath(endpoint.path),
      count: Math.max(1, Math.min(999, Math.trunc(endpoint.count))),
    }))
    .filter((endpoint) => endpoint.host.length > 0 && endpoint.path.startsWith('/'))
    .slice(0, 20);
}

function sanitizeEndpointHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9.-]+$/.test(trimmed) ? trimmed : '';
}

function sanitizeEndpointPath(value: string): string {
  const path = value.split('?')[0]?.trim() ?? '';
  return path.startsWith('/') && !path.includes('..') ? path : '';
}

function captureRejectionReason(err: unknown): TossSignalCaptureRejectionReason {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('Invalid Toss signal request body candidate')) return 'invalid_json';
  if (message.includes('sensitive fields')) return 'sensitive_fields';
  if (message.includes('lacks stock placeholders')) return 'lacks_stock_placeholders';
  if (message.includes('Invalid Toss signal request body target')) return 'invalid_stock_target';
  return 'unknown';
}

function summarizeSession(
  session: TossSessionSummary,
): TossSignalCaptureSmokeSessionSummary {
  return {
    configured: session.configured,
    state: session.state,
    persistent: session.persistent,
  };
}

function isUsableSession(session: TossSignalCaptureSmokeSessionSummary): boolean {
  return session.configured && session.state !== 'logged_out' && session.state !== 'expired';
}

function normalizeTicker(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().replace(/^A/i, '');
  if (!/^\d{6}$/.test(trimmed)) return null;
  return trimmed;
}

function krProductCode(ticker: string): string {
  return `A${ticker}`;
}

function normalizeName(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
