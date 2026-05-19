# Araon v7 Final Gap Plan

Status: implementation pass in progress; use this as the visual QA checklist
Scope: frontend first. Keep backend/API contracts unchanged unless a frontend adapter is missing.
Truth sources: current running Araon UI, v7 IA lock-in HTML, `docs/design.md`, direct Toss web observation in Safari.

## Current Pass Notes

Updated on 2026-05-13 during direct Chrome/Computer Use QA.

- Home TOP100 now keeps `섹터 / TOP100` and `국내 / 미국` controls inside the left-top board.
- TOP100 mode renders 상승/하락 as two vertical halves, not stacked horizontal tabs.
- Favorites and recent surge render as one connected 50:50 split surface.
- KIS realtime appears as watchlist row/status badges, not as a separate large rail.
- Header no longer shows the old `일봉 최신` pill or global sector/TOP100 switch.
- Selected ticker panel is chart-first; quote metrics are compressed into the ticker header.
- Full Chart and Agent Detail open as expanded workspaces with icon controls, not modals.
- Toss account is a right drawer with a narrow icon rail and chevron collapse/expand.
- Bottom market tape is fixed, visible, and starts after a left notice label.
- Settings remains modal-based; current pass only checks it for layout breakage and stale visible chrome.
- Raw Toss/KIS/session/account/order values must remain absent from UI/logs/diff.

## Goal

Implement the locked Home information architecture while making the final product look like Araon, not a prototype.

Visual foundation:

- Araon light terminal surface
- IBM Plex Sans
- compact financial rows
- white cards, soft borders, restrained shadows
- status pills with clear semantic color
- real chart/state surfaces only
- no fake financial data
- no raw Toss/KIS/session/account/order payloads

## Locked Home IA

- Left half, top: TOP100 / Sector board.
- Left half, bottom: one connected 50:50 surface.
  - left: Toss-synced favorites / watchlist
  - right: recent surge
- Right half, top: selected ticker / chart-first panel.
- Right half, bottom: agent trading/event/safety panel.
- Far right: Toss account drawer + compact icon rail.
- Bottom: fixed market status tape.

## Confirmed Gaps From Direct Visual QA

### 1. Bottom Status Bar Alignment

Current issue:

- Market tape starts visually clipped or offset.
- The fixed status bar exists, but content position does not match the Toss-like tape reference.

Required:

- Add a fixed left notice label.
- Start the scrolling tape after that label.
- Keep settings button fixed at far right.
- Hover pauses tape and highlights items.

Acceptance:

- At 1920x1080, 1600x1000, 1440x900, and 900px width, the tape is visible, aligned, not clipped, and does not cover content.

### 2. Account Drawer Collapse Feels Like Layout Gap

Current issue:

- Collapsing account rail changes the whole right-side whitespace instead of feeling like a drawer.

Required:

- Treat Toss account as a right drawer with strong boundary: left border, subtle shadow, fixed icon strip.
- Collapsed state keeps narrow icon rail.
- Expanded state shows account/session content as a separate drawer surface.

Acceptance:

- No text buttons like `계좌 접기`.
- Chevron/icon control only.
- Main workspace expands, but drawer boundary remains clear.

### 3. TOP100 Controls Detached From The Block

Current issue:

- `섹터 / TOP100` lives in the app header.
- `국내 / 미국` lives above the TOP100 card rather than inside the card header.

Required:

- Move `섹터 / TOP100` into the left-top board header.
- Move `국내 / 미국` into that same header when TOP100 is active.

Acceptance:

- No global header `섹터 / TOP100`.
- TOP100 controls read as part of the TOP100 block.

### 4. Favorites And Recent Surge Are Not Connected

Current issue:

- Favorites and recent surge are separate cards with a gap.

Required:

- Render them as one connected split card with a vertical divider.
- Preserve exact 50:50 width.

Acceptance:

- No gap between the two bottom-left panels.
- Both sections scroll independently.

### 5. Excessive Bottom Whitespace

Current issue:

- Some panels leave too much unused vertical space.

Required:

- Reduce outer gaps and min-height pressure.
- Keep fixed status bar clear.
- Preserve the locked 50:50 structure.

Acceptance:

- At 1440x900, no major blank lower band appears.

### 6. `일봉 최신` Pill Remains In Header

Current issue:

- Backfill status pill remains in the main header and does not belong to the new terminal layout.

Required:

- Remove the header backfill pill from normal dashboard chrome.
- If needed later, expose backfill detail only in settings or diagnostics.

Acceptance:

- `일봉 최신` is not visible in the main header.

### 7. Toss Account Must Look Like A Separate Right Drawer

Current issue:

- Account area reads as empty spacing, not a distinct drawer.

Required:

- Strong right-side boundary.
- Icon rail visually attached to the drawer.
- Status dot visible but not noisy.

Acceptance:

- User can instantly see the account drawer starts at the right boundary.

### 8. Selected Chart Loses Space To Metrics

Current issue:

- Current price, change, absolute change, volume, and update time consume a full metric row.
- Chart becomes too small.

Required:

- Make the panel chart-first.
- Compress quote metadata into the top symbol row.
- Keep tabs compact.
- Use Toss reference: dense symbol header, large chart surface.

Acceptance:

- Home chart is clearly larger than before.
- No five-column metric strip above the chart.

### 9. Full Chart Expansion Feels Like Page Navigation

Current issue:

- The app switches to a page-like view with a large header and `홈으로`.

Required:

- Use an expand icon from the home chart panel.
- Full chart should feel like the chart panel expanded over the workspace.
- Return action should be compact, like `작게보기`/collapse control.

Acceptance:

- No prominent `전체 차트` text button in the home chart panel.
- No large page-title header that makes it feel like navigation.

### 10. Agent Detail Expansion Also Feels Like Page Navigation

Current issue:

- Agent detail looks like a separate page.

Required:

- Use compact expand/collapse control.
- Agent detail should feel like an expanded panel/workspace.

Acceptance:

- No page-like `홈으로` primary action.

### 11. Agent Input Queue Should Not Be A Modal

Current issue:

- `Agent input queue` is shown through a modal.

Required:

- Agent queue/details belong inside Agent Detail workspace.
- Modals are reserved for approval/destructive confirmations.

Acceptance:

- Home/rail agent detail actions open the Agent Detail workspace, not the agent queue modal.

### 12. Sector/TOP100 Toggle Must Be Inside The Changing Block

Current issue:

- Header-level toggle makes the UX feel detached.

Required:

- The changing left-top block owns its mode controls.

Acceptance:

- User changes sector/TOP100 from inside the left-top block header.

### 13. Sector Mode Wastes Space

Current issue:

- Sector mode does not use the same split density as TOP100.

Required:

- Sector mode uses a two-column split layout inside the left-top block.
- Each column scrolls if needed.

Acceptance:

- Sector view uses both halves of the block at desktop width.

### 14. Settings Needs Cleanup

Current issue:

- Settings mixes old and new concepts.

Required:

- Group by product areas:
  - Connections
  - Data
  - Realtime
  - Agent Safety
  - Notifications
  - Developer/Diagnostics
- Keep secrets hidden.
- Keep risky actions clearly gated.

Acceptance:

- No stale UI copy that implies removed KIS-heavy flows are primary.

### 15. Remove Old/Unused UI Code

Current issue:

- Old modal/detail/rail code remains from previous iterations.

Required:

- After main UI lands, map imports and tests.
- Remove only truly unused code.
- Do not remove backend routes or safety code by accident.

Acceptance:

- No unused frontend imports/components from the old dashboard path.
- Tests and build pass.

## Implementation Order

1. Lock this checklist in the doc.
2. Fix header controls and left-top market board.
3. Fix connected favorites/surge split.
4. Fix status bar alignment.
5. Make selected ticker panel chart-first.
6. Make chart/agent expansion feel like panel expansion.
7. Strengthen Toss account drawer boundary.
8. Clean settings/dead UI code.
9. Run tests and real visual QA.

## Verification

Commands:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Focused visual QA:

- real browser / Computer Use
- 1920x1080
- 1600x1000
- 1440x900
- 900px responsive

Manual interaction checks:

- TOP100 상승 row click changes selected ticker/chart.
- TOP100 하락 row click changes selected ticker/chart.
- Sector/TOP100 toggle stays inside the left-top block.
- TOP100 국내/미국 toggle stays inside the left-top block.
- Account drawer chevron collapse/expand works.
- Full Chart expands and returns compactly.
- Agent Detail expands and returns compactly.
- Bottom tape is visible, aligned, moves, pauses on hover.
- No raw Toss/KIS/session/account/order values visible.

## Completion Criteria

Complete only when the actual running Araon screen passes the visual and interaction checks above. Code-level checks alone are not enough.
