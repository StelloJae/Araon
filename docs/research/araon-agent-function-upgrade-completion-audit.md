# Araon Agent Function Upgrade Completion Audit

> Date: 2026-05-19
> Repo: `/Users/stello/korean-stock-follower`
> Goal brief: `docs/research/araon-agent-function-upgrade-goal.md`
> Result: PASS

## 1. Scope Closed

This pass upgrades Araon's agent area as a decision-support and safety foundation. It does not enable live trading.

Implemented surfaces:

- Home agent panel now uses the fixed user-facing flow: `감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금`.
- Agent detail now has a compact status summary for candidates, previews, approval waits, and readiness gaps.
- Agent events now render through a UI view model with display name, product identity, reason, freshness, source, confidence, deterministic score, and stage.
- Agent event list dedupes semantically by event type and product identity.
- Candidate rows open the selected ticker/chart path.
- Order safety rail now shows the same flow and keeps live execution locked.
- Settings agent/event copy reuses the same user-facing reason cleanup.
- Product display names are resolved from event payload, cached product display names, and the local stock catalog so live agent rows do not fall back to six-digit codes when a name is known.

## 2. Files Changed For This Goal

Agent UI and adapter:

- `src/client/lib/agent-candidate-view-model.ts`
- `src/client/hooks/useProductDisplayNames.ts`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/AgentDecisionSummary.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/App.tsx`

Tests:

- `src/client/lib/__tests__/agent-candidate-view-model.test.ts`
- `src/client/components/__tests__/agent-events-rail.test.ts`
- `src/client/components/__tests__/agent-decision-summary.test.ts`
- `src/client/components/__tests__/order-intent-safety-rail.test.ts`

## 3. Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Home agent panel explains what was detected and what is possible. | PASS | Browser QA saw `이벤트 · 미리보기 · 실행 잠금`, candidate rows, `모의 미리보기`, and `실거래 잠금`. |
| 2 | Agent Detail shows detection -> candidate -> evidence -> preview -> risk/approval -> lock. | PASS | Browser QA at 1600x1000, 1440x900, and 900px found `감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금`. |
| 3 | Event row shows name, reason, freshness, and state. | PASS | Browser QA showed `선익시스템 · 171090 · 급상승 신호 · 가격 업데이트 · 등락률 -3.02% · 가격 움직임 · 방금 · 신뢰 높음`. |
| 4 | Raw source/payload/debug/dedupe strings are absent from normal UI. | PASS | Browser DOM scan for `KIS WS`, `kis-ws`, `payload`, `dedupe`, `raw source` returned false. |
| 5 | Candidate scoring/reason is deterministic and testable. | PASS | `agent-candidate-view-model.test.ts` covers score, freshness sensitivity, reason cleanup, and stage labels. |
| 6 | Duplicate market movement events are semantically deduped. | PASS | `dedupeAgentCandidateEvents` tested by event type and product identity. |
| 7 | Candidate row click changes selected ticker/chart. | PASS | Browser QA clicked `선익시스템 · 171090`, then opened full chart and confirmed `선익시스템` / `171090` visible in the selected chart context. |
| 8 | Order intent preview is simulated/local only. | PASS | Safety rail copy shows `모의 미리보기만 가능 · 실제 주문은 잠김`; tests cover simulated preview rendering. |
| 9 | Live execution remains locked. | PASS | Agent summary and safety rail show `실거래 잠금`. No live order execution code path was enabled. |
| 10 | Approval challenge does not execute real orders. | PASS | Existing order-intent service and safety rail tests passed; this pass did not add any live execution mutation. |
| 11 | Risk/audit/readiness gaps use product copy. | PASS | Agent summary shows readiness gap pills such as `의사결정 엔진`, `전략 정책`, `리스크 정책`, `페이퍼 거래 원장`. |
| 12 | Missing automation pieces remain as readiness gaps. | PASS | Live trading dependencies remain surfaced as gaps, not hidden as ready state. |
| 13 | Settings agent items are normalized away from raw/debug copy. | PASS | Settings reason label now reuses `agentEventUserSummary`; managed operations settings focused tests pass. |
| 14 | UI typography/density matches Araon desktop density. | PASS | Browser QA found compact title/row/meta/pill sizing, no body scroll, and no agent-specific oversized blocks at 1600x1000, 1440x900, and 900px. |
| 15 | tests/typecheck/build/diff-check/no-live soak pass. | PASS | See verification section. |
| 16 | Browser visual QA evidence is recorded. | PASS | See browser QA section. |

## 4. Browser QA Evidence

Target: `http://127.0.0.1:5173`

Viewports checked:

- 1600x1000
- 1440x900
- 900x900 responsive

Evidence:

- Home agent panel screenshot: `araon-agent-home-1600x1000.png`
- Agent detail screenshot: `araon-agent-detail-1600x1000.png`
- Agent detail screenshot: `araon-agent-detail-1440x900.png`
- Agent detail screenshot: `araon-agent-detail-900x900.png`
- Console error scan: 0 errors.
- Layout scan: document scroll width/height matched viewport at checked sizes.
- Agent detail selectors visible:
  - `section[aria-label="에이전트 상태 요약"]`
  - `[data-testid="agent-events-rail"]`
  - `[data-testid="order-intent-safety-rail"]`
- Raw/internal UI scan returned false for:
  - `KIS WS`
  - `kis-ws`
  - `payload`
  - `dedupe`
  - `raw source`
- Candidate display name recovery verified:
  - Before check would show ticker-only for price movement events.
  - After fix, Browser QA showed `선익시스템 · 171090` and `레인보우로보틱스 · 277810`.
- Candidate click verified:
  - Clicked first agent candidate row.
  - Opened full chart.
  - Selected chart context contained `선익시스템` and `171090`.

## 5. Verification

Focused tests:

```bash
npm test -- src/client/lib/__tests__/agent-candidate-view-model.test.ts src/client/components/__tests__/agent-decision-summary.test.ts src/client/components/__tests__/agent-events-rail.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts src/client/components/__tests__/managed-operations-settings.test.ts src/server/agent src/client/lib/__tests__/agent-event-order-intent.test.ts src/client/lib/__tests__/agent-event-toast.test.ts
```

Result:

- PASS
- 16 test files
- 92 tests

Full tests:

```bash
npm test
```

Result:

- PASS
- 228 test files
- 1522 tests

Typecheck:

```bash
npm run typecheck
```

Result: PASS

Build:

```bash
npm run build
```

Result: PASS

Diff check:

```bash
git diff --check
```

Result: PASS

No-live soak:

```bash
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Result:

- PASS
- `ok: true`
- `sampleCount: 18`
- `issueCount: 0`

Secret/raw scan for touched files:

```bash
rg -n "SESSION|UTK|LTK|FTK|appSecret|appKey|approval key|browserSessionId|deviceId|account number" \
  src/client/hooks/useProductDisplayNames.ts \
  src/client/lib/agent-candidate-view-model.ts \
  src/client/lib/__tests__/agent-candidate-view-model.test.ts \
  src/client/components/AgentDecisionSummary.tsx \
  src/client/components/__tests__/agent-decision-summary.test.ts \
  src/client/components/AgentEventsRail.tsx \
  src/client/components/OrderIntentSafetyRail.tsx \
  src/client/components/SettingsModal.tsx \
  src/client/App.tsx
```

Result:

- No raw secret values found.
- Matches were limited to Settings documentation/comment text and internal constant names.

## 6. Safety Confirmation

- Actual order placement: NOT ENABLED.
- Order cancel/modify: NOT ENABLED.
- Account mutation: NOT ENABLED.
- Live auto-buy/live auto-sell: NOT ENABLED.
- Toss watchlist mutation: NOT TOUCHED in this goal.
- Synthetic financial data: NOT ADDED.
- Raw Toss/KIS/session/account/order/watchlist values: NOT exposed by this goal.

## 7. Remaining Product Notes

Agent is still intentionally a decision-support layer. The following remain readiness gaps, not hidden features:

- Strategy policy
- Risk policy
- Toss live order adapter
- Reconciliation
- Paper/live separation
- Operator approval/kill-switch flow
- Live execution dry-run evidence

These are future live-execution-lane work, not blockers for this goal.
