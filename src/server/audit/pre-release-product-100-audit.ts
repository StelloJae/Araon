export type PreReleaseProduct100CriterionState =
  | 'pass'
  | 'partial-pass'
  | 'partial'
  | 'market-hours-required'
  | 'user-action-required'
  | 'pending'
  | 'unknown'
  | 'missing';

export interface PreReleaseProduct100AuditOptions {
  readonly auditMarkdown: string;
  readonly generatedAt?: string;
  readonly expectedCriteriaTotal?: number;
}

export interface PreReleaseProduct100CriterionSummary {
  readonly criterion: number;
  readonly state: PreReleaseProduct100CriterionState;
}

export interface PreReleaseProduct100AuditReport {
  readonly provider: 'araon-pre-release-product-100-audit';
  readonly generatedAt: string;
  readonly goalComplete: boolean;
  readonly shouldCallUpdateGoal: boolean;
  readonly rawAuditProseExposed: false;
  readonly expectedCriteriaTotal: number;
  readonly criterionCounts: {
    readonly total: number;
    readonly pass: number;
    readonly partialPass: number;
    readonly partial: number;
    readonly marketHoursRequired: number;
    readonly userActionRequired: number;
    readonly pending: number;
    readonly unknown: number;
    readonly missing: number;
  };
  readonly incompleteCriteria: readonly PreReleaseProduct100CriterionSummary[];
  readonly passCriteria: readonly number[];
  readonly unknownCriteria: readonly number[];
  readonly missingCriteria: readonly number[];
}

export function buildPreReleaseProduct100AuditReport(
  options: PreReleaseProduct100AuditOptions,
): PreReleaseProduct100AuditReport {
  const expectedCriteriaTotal = options.expectedCriteriaTotal ?? 42;
  const parsedCriteria = extractCriterionStates(options.auditMarkdown);
  const parsedNumbers = new Set(parsedCriteria.map((criterion) => criterion.criterion));
  const missingCriteria = Array.from(
    { length: expectedCriteriaTotal },
    (_, index) => index + 1,
  ).filter((criterion) => !parsedNumbers.has(criterion));
  const missingSummaries = missingCriteria.map((criterion) => ({
    criterion,
    state: 'missing' as const,
  }));
  const allCriteria = [...parsedCriteria, ...missingSummaries].sort(
    (left, right) => left.criterion - right.criterion,
  );
  const passCriteria = parsedCriteria
    .filter((criterion) => criterion.state === 'pass')
    .map((criterion) => criterion.criterion)
    .sort((left, right) => left - right);
  const unknownCriteria = parsedCriteria
    .filter((criterion) => criterion.state === 'unknown')
    .map((criterion) => criterion.criterion)
    .sort((left, right) => left - right);
  const incompleteCriteria = allCriteria.filter((criterion) => criterion.state !== 'pass');
  const goalComplete =
    parsedCriteria.length === expectedCriteriaTotal &&
    missingCriteria.length === 0 &&
    incompleteCriteria.length === 0;

  return {
    provider: 'araon-pre-release-product-100-audit',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    goalComplete,
    shouldCallUpdateGoal: goalComplete,
    rawAuditProseExposed: false,
    expectedCriteriaTotal,
    criterionCounts: {
      total: allCriteria.length,
      pass: passCriteria.length,
      partialPass: allCriteria.filter((criterion) => criterion.state === 'partial-pass').length,
      partial: allCriteria.filter((criterion) => criterion.state === 'partial').length,
      marketHoursRequired: allCriteria.filter(
        (criterion) => criterion.state === 'market-hours-required',
      ).length,
      userActionRequired: allCriteria.filter(
        (criterion) => criterion.state === 'user-action-required',
      ).length,
      pending: allCriteria.filter((criterion) => criterion.state === 'pending').length,
      unknown: unknownCriteria.length,
      missing: missingCriteria.length,
    },
    incompleteCriteria,
    passCriteria,
    unknownCriteria,
    missingCriteria,
  };
}

function extractCriterionStates(markdown: string): PreReleaseProduct100CriterionSummary[] {
  const criteria: PreReleaseProduct100CriterionSummary[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const criterionCell = cells[0];
    const statusCell = cells[2] ?? '';
    if (criterionCell === undefined || !/^\d+$/.test(criterionCell)) continue;
    criteria.push({
      criterion: Number.parseInt(criterionCell, 10),
      state: classifyCriterionStatus(statusCell),
    });
  }
  return criteria;
}

function classifyCriterionStatus(status: string): PreReleaseProduct100CriterionState {
  const normalized = status.trim().toUpperCase();
  if (normalized.startsWith('PASS')) return 'pass';
  if (normalized.startsWith('PARTIAL-PASS')) return 'partial-pass';
  if (normalized.startsWith('PARTIAL')) return 'partial';
  if (normalized.startsWith('MARKET-HOURS REQUIRED')) return 'market-hours-required';
  if (normalized.startsWith('USER-ACTION REQUIRED')) return 'user-action-required';
  if (normalized.startsWith('PENDING')) return 'pending';
  return 'unknown';
}
