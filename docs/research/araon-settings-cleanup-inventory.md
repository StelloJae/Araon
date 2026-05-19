# Araon Settings Cleanup Inventory

Date: 2026-05-18
Scope: `SettingsModal` connection tab cleanup for the post-audit goal.

## Product Rule

- Normal user path is Toss-first.
- KIS is optional low-latency `실시간 추적` only.
- KIS account/order/watchlist/ranking/chart truth-source UX must not appear in normal UI.
- One personal KIS API profile is the normal product model.
- Advanced diagnostics can stay dev-only if useful for verification.

## Keep In Normal Connection Tab

- Basic runtime rows:
  - KIS configured/runtime state, only to explain optional realtime tracking availability.
  - Toss session state.
- `TossDataControl`:
  - QR login, session clear/extend, Toss alert/SSE state.
  - No raw session/cookie/storage values.
- `TossAccountSurfaceControl`:
  - Account/portfolio/watchlist surface refresh.
  - Read-only only.
- `KisWsSlotControl`:
  - Rename/position as `실시간 추적 슬롯`.
  - Explain KIS is optional realtime acceleration only.
- `OrderIntentApprovalControl`:
  - Shows live execution is locked.
- `AgentEventMonitorControl` + `AgentEventsFeedControl`:
  - Keep if phrased as event detection/read-only monitoring.

## Dev-Only / Advanced

- `RealtimeSessionControl` advanced cap/session controls.
- `BackgroundBackfillControl`.
- `DataHealthPanel`.
- `MasterCatalogPanel`.
- KIS legacy import panel.
- Local backup/restore panel.
- Any old KIS polling/backfill/master/import explanation.

## Remove From Normal UI

- Multi KIS credential profile add form.
- Extra KIS profile list as a normal user concept.
- Copy implying KIS is account/order/watchlist/ranking/chart source.
- `폴링`, `KIS WS`, `보조`, `프로필 N개`, `등록됨` style user-facing copy.

## Backend Containment Decision

- Do not break encrypted credential compatibility in this pass.
- Keep backend `/credentials/profiles` route only as legacy/internal compatibility until a dedicated migration removes it.
- Stop rendering extra-profile add UI in normal Settings.
- Runtime should continue treating primary credentials as the only product-supported profile in user language.

## First Implementation Slice

1. Remove `CredentialProfilesPanel` from `ConnectionTab` normal render.
2. Stop fetching `getCredentialProfiles()` in `ConnectionTab` load.
3. Remove `addCredentialProfile()` UI state/handler from `ConnectionTab`.
4. Leave exported component and API client temporarily for compatibility/tests until a backend cleanup slice.
5. Put legacy import, backup, data health, master catalog, background backfill behind dev mode.

## Verification

- Focused Settings tests.
- Typecheck.
- Browser visual QA for Settings > 연결.
