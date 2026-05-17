# Araon Frontend Redesign Completion Audit

Date: 2026-05-13

Scope: active frontend goal for Araon React/Vite redesign. This audit maps the
goal and `docs/frontend-redesign-brief.md` requirements to concrete artifacts and
verification evidence.

## Objective Restated

Araon frontend must be rebuilt as a new React/Vite terminal UI, preserving the
backend/API contract where possible, using `docs/design.md` as the design-system
authority. OpenDesign and Toss screenshots are reference material only. The goal
is complete only if actual browser/Computer Use inspection shows the redesigned
home operations view, selected ticker/chart detail, Toss-like ops rail,
unified watchlist/KIS rail, agent events, and order safety/approval flow working
at the required desktop viewports.

## Prompt-To-Artifact Checklist

| Requirement | Evidence |
|---|---|
| Use `/Users/stello/korean-stock-follower` as source repo | Current working tree is this repo. |
| Treat `docs/frontend-redesign-brief.md` as authoritative | Brief exists and names implementation strategy, layout, interactions, verification, milestones, and completion definition. |
| Use `docs/design.md` as design system | Design system exists and defines Araon terminal tone, colors, typography, four-rail layout, Toss ops rail, KIS rail, status bar, and do/don't rules. |
| Implement real React/Vite UI, not HTML prototype | React entry remains `src/client/App.tsx`; new production components live under `src/client/components/`. |
| Preserve backend/API contract where possible | Frontend consumes existing API-client adapters plus added typed read surfaces; no visual redesign-only API break was introduced for this goal. |
| Independent Araon UI; OpenDesign/Toss only reference | Production UI uses Araon tokens and components from `src/client/styles/global.css` and `docs/design.md`, not copied Toss/OpenDesign HTML. |
| Home operations view | `OperationsHomePanel` is rendered when workspace mode is `home`; actual browser inspection confirmed it visible. |
| Selected ticker/chart detail view | `DashboardFocusPanel` and `StockCandleChart` render selected ticker workspace; actual browser inspection confirmed Samsung ticker detail and chart host. |
| TOP100/movers visible on home | `watchlist-store` defaults market rail view to `top100`; actual browser inspection confirmed TOP100 default on home. |
| Watchlist/favorite rail | Home screen shows favorites/watchlist rail; actual browser inspection confirmed it visible. |
| KIS realtime rail | `KisWsSlotRail` is rendered and inspected as optional market-data-only rail. |
| Toss-like ops rail | `TossAccountRail` is rendered in right ops rail and inspected with session/account states. |
| Agent events | `AgentEventsRail` and `AgentEventsModal` exist; interaction QA opened the modal and verified copy says events are agent input, not execution. |
| Order safety/approval flow | `OrderIntentSafetyRail` and `OrderSafetyModal` exist; interaction QA opened approval modal and verified live execution locked/fresh approval state. |
| Status bar | `StatusBar` renders market tape, counts, Toss price state, and last update; browser DOM and Computer Use confirmed it visible. |
| Required viewports | Browser QA passed at 1920x1080, 1600x1000, and 1440x990. |
| No horizontal overflow at required viewports | Browser QA returned `overflowX: 0` for home and ticker at all required viewports. |
| No fake final finance data | UI surfaces unknown data as collecting/waiting/unavailable and uses live/dev runtime data paths; no final-only fake rows were added. |
| Sensitive raw data not exposed | Targeted diff grep found only leak-guard test strings for high-risk session/cookie names, not raw values. |
| Existing frontend tests updated | Focused rail tests and full suite pass. |

## Visual And Interaction Evidence

Computer Use against Chrome at `127.0.0.1:5173` confirmed:

- Home view shows TOP100, recent surge, favorites/watchlist, KIS realtime rail,
  operations home panel, Toss account/session rail, agent events, order safety,
  and bottom status bar.
- Selected ticker flow opens Samsung detail workspace with quote metrics, chart,
  tabs, right ops rail, agent rail, and order safety rail.
- Agent events modal opens from the rail and clearly describes events as agent
  input, not buy/sell execution.
- Order safety modal opens from the rail and shows live execution locked plus
  fresh approval/audit flow.

Playwright browser QA summary:

| Viewport | Home surfaces | Ticker surfaces | Overflow | Modals |
|---|---|---|---|---|
| 1920x1080 | PASS | PASS | PASS | PASS |
| 1600x1000 | PASS | PASS | PASS | PASS |
| 1440x990 | PASS | PASS | PASS | PASS |

Console check:

- `.playwright-mcp/console-2026-05-13T04-56-05-840Z.log` contained only React
  DevTools informational messages for this QA pass.

## Command Verification

```text
npm test
PASS: 208 files, 1349 tests

npm run typecheck
PASS

npm run build
PASS

git diff --check
PASS
```

Build note: Vite still reports the existing post-minification chunk-size warning.
It is not a functional failure for this goal.

## Completion Verdict

All explicit frontend redesign requirements are covered by code artifacts,
focused tests, full test/typecheck/build checks, secret-leak guard review, and
actual browser/Computer Use visual interaction evidence.

Remaining risk: the broader worktree is intentionally dirty from the larger
Toss/KIS migration. This audit only closes the active frontend redesign goal.
