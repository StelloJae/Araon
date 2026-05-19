import { describe, expect, it } from 'vitest';

import { buildPreReleaseProduct100AuditReport } from '../pre-release-product-100-audit.js';

describe('pre-release product 100 audit report', () => {
  it('extracts incomplete criteria without echoing audit prose', () => {
    const markdown = `
| # | Criterion | Current status | Evidence / remaining need |
|---:|---|---|---|
| 1 | Public data works | PASS | safe evidence |
| 2 | Session works | PASS | session placeholder should not echo |
| 12 | TOP100 cadence | MARKET-HOURS REQUIRED | raw provider sentence should not echo |
| 14 | Surge threshold | MARKET-HOURS REQUIRED | raw watchlist value should not echo |
| 41 | Browser QA | PARTIAL-PASS | needs live movement |
| 42 | Completion audit | PENDING | not written |
`;

    const report = buildPreReleaseProduct100AuditReport({
      auditMarkdown: markdown,
      expectedCriteriaTotal: 6,
      generatedAt: '2026-05-18T00:00:00.000Z',
    });

    expect(report).toEqual({
      provider: 'araon-pre-release-product-100-audit',
      generatedAt: '2026-05-18T00:00:00.000Z',
      goalComplete: false,
      shouldCallUpdateGoal: false,
      rawAuditProseExposed: false,
      expectedCriteriaTotal: 6,
      criterionCounts: {
        total: 10,
        pass: 2,
        partialPass: 1,
        partial: 0,
        marketHoursRequired: 2,
        userActionRequired: 0,
        pending: 1,
        unknown: 0,
        missing: 4,
      },
      incompleteCriteria: [
        { criterion: 3, state: 'missing' },
        { criterion: 4, state: 'missing' },
        { criterion: 5, state: 'missing' },
        { criterion: 6, state: 'missing' },
        { criterion: 12, state: 'market-hours-required' },
        { criterion: 14, state: 'market-hours-required' },
        { criterion: 41, state: 'partial-pass' },
        { criterion: 42, state: 'pending' },
      ],
      passCriteria: [1, 2],
      unknownCriteria: [],
      missingCriteria: [3, 4, 5, 6],
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('raw provider sentence');
  });

  it('marks the goal complete only when all expected criteria are pass', () => {
    const markdown = `
| # | Criterion | Current status | Evidence / remaining need |
|---:|---|---|---|
| 1 | A | PASS | evidence |
| 2 | B | PASS | evidence |
| 3 | C | PASS | evidence |
`;

    expect(buildPreReleaseProduct100AuditReport({
      auditMarkdown: markdown,
      expectedCriteriaTotal: 3,
      generatedAt: '2026-05-18T00:00:00.000Z',
    })).toMatchObject({
      goalComplete: true,
      shouldCallUpdateGoal: true,
      criterionCounts: {
        total: 3,
        pass: 3,
        partialPass: 0,
        partial: 0,
        marketHoursRequired: 0,
        userActionRequired: 0,
        pending: 0,
        unknown: 0,
        missing: 0,
      },
      incompleteCriteria: [],
      passCriteria: [1, 2, 3],
    });
  });

  it('keeps partial and unknown states incomplete', () => {
    const markdown = `
| # | Criterion | Current status | Evidence / remaining need |
|---:|---|---|---|
| 1 | A | Partial | evidence |
| 2 | B | USER-ACTION REQUIRED | evidence |
| 3 | C | blocked by unknown phrase | evidence |
`;

    const report = buildPreReleaseProduct100AuditReport({
      auditMarkdown: markdown,
      expectedCriteriaTotal: 3,
      generatedAt: '2026-05-18T00:00:00.000Z',
    });

    expect(report.goalComplete).toBe(false);
    expect(report.criterionCounts).toMatchObject({
      partial: 1,
      userActionRequired: 1,
      unknown: 1,
    });
    expect(report.incompleteCriteria).toEqual([
      { criterion: 1, state: 'partial' },
      { criterion: 2, state: 'user-action-required' },
      { criterion: 3, state: 'unknown' },
    ]);
    expect(report.unknownCriteria).toEqual([3]);
  });
});
