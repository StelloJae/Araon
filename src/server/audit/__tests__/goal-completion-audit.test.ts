import { describe, expect, it } from 'vitest';

import { buildGoalCompletionAuditReport } from '../goal-completion-audit.js';

describe('goal completion audit report', () => {
  it('extracts machine-checkable gate states without echoing audit prose', () => {
    const markdown = `
| Gate | Requirement | Current State | Evidence To Run | Completion Condition |
| --- | --- | --- | --- | --- |
| \`GATE-TOSS-SSE-REFRESH\` | Prove refresh | Open; raw provider sentence should not echo | cmd | condition |
| \`GATE-TOSS-SIGNAL-CAPTURE\` | Prove signal | Partial; SESSION=[raw] should not echo | cmd | condition |
| \`GATE-CLEAN-NO-CREDS\` | Clean startup | Pass for no-live smoke | cmd | condition |
| \`GATE-FINAL-VERIFY\` | Verify all | Open by definition until final audit | cmd | condition |
`;

    const report = buildGoalCompletionAuditReport({
      auditMarkdown: markdown,
      generatedAt: '2026-05-13T00:00:00.000Z',
    });

    expect(report).toEqual({
      provider: 'araon-goal-completion-audit',
      generatedAt: '2026-05-13T00:00:00.000Z',
      goalComplete: false,
      shouldCallUpdateGoal: false,
      rawAuditProseExposed: false,
      gateCounts: {
        total: 4,
        pass: 1,
        partial: 1,
        open: 2,
        unknown: 0,
      },
      incompleteGates: [
        { id: 'GATE-TOSS-SSE-REFRESH', state: 'open' },
        { id: 'GATE-TOSS-SIGNAL-CAPTURE', state: 'partial' },
        { id: 'GATE-FINAL-VERIFY', state: 'open' },
      ],
      passGates: ['GATE-CLEAN-NO-CREDS'],
      unknownGates: [],
    });
    expect(JSON.stringify(report)).not.toContain('SESSION');
    expect(JSON.stringify(report)).not.toContain('raw provider sentence');
  });

  it('marks the goal complete only when every parsed gate is pass', () => {
    const markdown = `
| Gate | Requirement | Current State | Evidence To Run | Completion Condition |
| --- | --- | --- | --- | --- |
| \`GATE-A\` | A | Pass | cmd | condition |
| \`GATE-B\` | B | Pass with evidence | cmd | condition |
| \`GATE-C\` | C | Latest smoke passed with sanitized output | cmd | condition |
| \`GATE-D\` | D | Latest re-check still reports only README.md modified in that repo | cmd | condition |
`;

    expect(buildGoalCompletionAuditReport({
      auditMarkdown: markdown,
      generatedAt: '2026-05-13T00:00:00.000Z',
    })).toMatchObject({
      goalComplete: true,
      shouldCallUpdateGoal: true,
      gateCounts: {
        total: 4,
        pass: 4,
        partial: 0,
        open: 0,
        unknown: 0,
      },
      incompleteGates: [],
      passGates: ['GATE-A', 'GATE-B', 'GATE-C', 'GATE-D'],
    });
  });
});
