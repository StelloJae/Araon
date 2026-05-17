export type GoalCompletionGateState = 'pass' | 'partial' | 'open' | 'unknown';

export interface GoalCompletionAuditOptions {
  readonly auditMarkdown: string;
  readonly generatedAt?: string;
}

export interface GoalCompletionGateSummary {
  readonly id: string;
  readonly state: GoalCompletionGateState;
}

export interface GoalCompletionAuditReport {
  readonly provider: 'araon-goal-completion-audit';
  readonly generatedAt: string;
  readonly goalComplete: boolean;
  readonly shouldCallUpdateGoal: boolean;
  readonly rawAuditProseExposed: false;
  readonly gateCounts: {
    readonly total: number;
    readonly pass: number;
    readonly partial: number;
    readonly open: number;
    readonly unknown: number;
  };
  readonly incompleteGates: readonly GoalCompletionGateSummary[];
  readonly passGates: readonly string[];
  readonly unknownGates: readonly string[];
}

export function buildGoalCompletionAuditReport(
  options: GoalCompletionAuditOptions,
): GoalCompletionAuditReport {
  const gates = extractGateStates(options.auditMarkdown);
  const passGates = gates
    .filter((gate) => gate.state === 'pass')
    .map((gate) => gate.id);
  const incompleteGates = gates
    .filter((gate) => gate.state !== 'pass');
  const unknownGates = gates
    .filter((gate) => gate.state === 'unknown')
    .map((gate) => gate.id);
  const goalComplete = gates.length > 0 && incompleteGates.length === 0;

  return {
    provider: 'araon-goal-completion-audit',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    goalComplete,
    shouldCallUpdateGoal: goalComplete,
    rawAuditProseExposed: false,
    gateCounts: {
      total: gates.length,
      pass: passGates.length,
      partial: gates.filter((gate) => gate.state === 'partial').length,
      open: gates.filter((gate) => gate.state === 'open').length,
      unknown: unknownGates.length,
    },
    incompleteGates,
    passGates,
    unknownGates,
  };
}

function extractGateStates(markdown: string): GoalCompletionGateSummary[] {
  const gates: GoalCompletionGateSummary[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('| `GATE-')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const id = cells[0]?.match(/`([^`]+)`/)?.[1];
    const currentState = cells[2] ?? '';
    if (id === undefined) continue;
    gates.push({
      id,
      state: classifyCurrentState(currentState),
    });
  }
  return gates;
}

function classifyCurrentState(currentState: string): GoalCompletionGateState {
  const normalized = currentState.trim().toLowerCase();
  if (normalized.startsWith('pass')) return 'pass';
  if (normalized.startsWith('partial')) return 'partial';
  if (normalized.startsWith('open')) return 'open';
  if (normalized.includes('passed')) return 'pass';
  if (normalized.includes('reports only') && normalized.includes('modified')) {
    return 'pass';
  }
  return 'unknown';
}
