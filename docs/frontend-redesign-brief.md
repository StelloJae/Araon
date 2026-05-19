# Araon Frontend Redesign Brief

> Status: authoritative execution brief for the Araon frontend redesign goal.
> Date: 2026-05-13
> Scope: React/Vite frontend rebuild only, preserving backend/API contracts wherever possible.

## 1. Purpose

This document is the detailed source of truth for the next Araon frontend redesign goal. The persistent Codex goal text can stay short and should point here. If the goal text is compressed, this document carries the full product, design, interaction, data, safety, and verification requirements.

Use this together with:

- [Araon Design System](./design.md)
- Current React/Vite frontend under `src/client/`
- Existing Fastify/backend API contracts under `src/server/` and `src/shared/`
- Toss screenshots supplied by the user on 2026-05-13, used only as layout/density references
- OpenDesign outputs, used only as loose wireframe references

Do not treat Toss screenshots as a visual style to copy. Araon must remain an original UI using the Araon design system.

## 2. Non-Negotiable Direction

Build a real React/Vite frontend implementation, not only an HTML prototype.

The frontend is allowed to be redesigned from the ground up. The backend should be preserved. Existing frontend components may be reused only when they fit the new information architecture and design system.

The new app should feel like:

- a professional Korean stock terminal,
- with consumer-fintech clarity,
- centered on selected ticker/chart analysis,
- supported by persistent account/ops awareness,
- honest about provider, data, safety, and trading state.

Primary output:

- Actual React/Vite UI in `/Users/stello/korean-stock-follower/src/client/`
- Browser-first implementation
- Electron adaptation later, after browser UI is accepted

## 3. Design System Authority

The top-level design authority is [docs/design.md](./design.md).

Follow these rules unless the user later overrides them:

- Light mode first.
- Dark mode also supported/refined.
- Keep Araon palette: red/blue/gold.
- Korean stock convention: red is up/gain, blue is down/loss.
- IBM Plex Sans and Korean fallbacks.
- Tabular numerals for prices, percent, rank, counts, latency, timestamps.
- White panels on soft grey page background.
- Compact status pills.
- No marketing hero sections.
- No decorative gradients, blobs, or filler cards.
- No fake final finance data.

Toss screenshots are references for:

- rail persistence,
- density,
- portfolio/position rhythm,
- ticker detail/chart focus,
- chart/fullscreen affordances,
- account/right rail behavior.

Toss screenshots are not references for:

- exact colors,
- proprietary branding,
- copying distinctive UI details,
- raw account/order presentation,
- live trading behavior.

## 4. Product-Level UX Model

Araon should have two primary modes:

### 4.1 Home / Operations Mode

Shown when no ticker is explicitly selected, or when the user returns home.

Purpose:

- market overview,
- TOP100/movers,
- recent surge/theme,
- provider state,
- watchlist/KIS realtime status,
- Toss account/session summary,
- agent/order safety readiness.

The home view is operational. It should answer:

- Is market data flowing?
- What is moving now?
- What am I watching?
- Is Toss connected?
- Is KIS realtime available?
- Are agents/events/safety rails healthy?

### 4.2 Selected Ticker / Detail Mode

Shown when the user selects a ticker.

Purpose:

- selected ticker quote,
- real candle chart,
- orderbook/호가,
- news/disclosures/signals,
- trading/status context,
- right-side account/position awareness.

The selected ticker/chart is the center of gravity.

Default selected ticker:

1. Most recently selected ticker if available.
2. 삼성전자 if no recent selection exists.

## 5. Layout Model

Start from the Araon design system's 4-rail terminal structure:

1. Market rail
2. Watchlist + KIS rail
3. Selected ticker + chart focus area
4. Ops/account rail

This is the default unless implementation evidence shows a better structure.

### 5.1 Required Rail Roles

Market rail:

- TOP100/movers
- recent surge / 급등·급락
- theme/sector surface if useful
- provider coverage and warning state

Watchlist + KIS rail:

- unified Toss/Araon watchlist
- favorite/star/pin controls
- KIS realtime slot/candidate list
- fallback/polling/subscribed state

Focus area:

- selected ticker header
- quote metrics
- real candle chart
- orderbook/호가 tab or panel
- news/disclosures/signals tab or panel
- detail/page mode transition

Ops rail:

- Toss account/portfolio summary
- orders summary
- session/auth pill and login action where needed
- agent event summary
- order safety / live locked status

### 5.2 Responsive Targets

Must visually verify at minimum:

- 1920x1080
- 1600x1000
- 1440x990

Browser-first. Electron can be handled later.

The layout must react naturally across those sizes:

- no incoherent overlap,
- no horizontal overflow,
- no clipped important labels,
- no hidden safety state,
- no unusable scroll ownership.

## 6. Toss Account / Ops Rail

The right rail should feel inspired by Toss Securities' persistent account/position rail, but use Araon's own design system.

Required:

- compact account/portfolio summary,
- total assets/evaluation/profit surfaces when data is available,
- position list summary,
- order status summary,
- pending/completed/conditional order access,
- login/session state,
- read-only/mutation safety state.

Toss auth/session:

- Do not make auth/session a large fixed panel by default.
- Show a compact pill/status indicator.
- If logged out, QR login action must be easy to find.
- If logged in, persistent large login button is unnecessary.
- Toss SSE/provider state belongs in the status bar.

Never expose raw Toss session, cookie, storage, account, order, or response identifiers.

## 7. Watchlist And Favorite Model

Toss watchlist and Araon favorite/watchlist should be unified in the UI.

Target UX:

- If a ticker is in Toss watchlist, it appears in Araon watchlist/favorites.
- If a ticker is starred/pinned in Araon, it is intended to be added to Toss watchlist.
- If removed from Toss watchlist, it should leave the Araon/Toss-linked watchlist state.
- Watchlist membership should feed KIS WS slot candidacy.
- Star/pin should be visually understandable as both user priority and watchlist intent.

Important implementation boundary:

- If Toss watchlist mutation is not yet safely implemented, the UI must show the action as pending/gated/sync unavailable rather than pretending it succeeded.
- Any Toss mutation must respect explicit approval and safety boundaries.

## 8. KIS Realtime Rail

KIS role:

- optional realtime market-data acceleration rail,
- not account source,
- not order source,
- not chart/backfill truth source,
- not primary provider if Toss data is available.

UI must explain this simply. The user said the role is not fully clear, so the product should make it clear.

Required:

- KIS credential absent state.
- KIS available state.
- Per-profile slot usage.
- Full candidate list with scrolling.
- Candidate reason/source.
- Candidate state: subscribed, fallback, polling, waiting, pinned.
- Very simple fallback indicators with word/color.
- Pin/star interaction.

Candidate reasons can include:

- holding,
- user pin,
- current view,
- recent news,
- recent disclosure,
- Toss signal,
- agent candidate,
- manual watchlist,
- TOP100 rotation.

KIS credential absent state should not make the app look broken.

## 9. Market / TOP100 / Home

Home must show TOP100/movers and 급등/급락.

TOP100 rule:

- Display provider ranking only.
- Do not fill TOP100 with watchlist fallback and make it look like market-wide ranking.
- If ranking is partial/stale/fallback/failed, warn strongly.

Provider warning rule:

- Partial/stale/fallback/failed state should be visible enough that the user notices quickly.
- Do not hide provider failure in console-only state.

## 10. Selected Ticker Detail

Default target state:

- real candle chart ready,
- selected ticker header visible,
- quote metrics visible,
- right rail still present,
- chart/orderbook/news/disclosure/signal surfaces reachable.

Required tabs/panels:

- Chart
- Orderbook / 호가
- News / 뉴스
- Disclosures / 공시
- Signals / 시그널
- Trading/status context if useful

Detail modal vs page:

- Re-evaluate the current modal pattern.
- Prefer a page/center-panel experience similar in function to the Toss screenshots, where selecting a ticker shifts the main center into ticker detail mode.
- Modal is allowed only if it improves flow and does not hide critical right rail/account/safety information.

Chart:

- Render actual backend/provider candle data.
- Do not create synthetic candles.
- If data is unavailable, show honest state such as `수집 중`, `대기`, or `미제공`.

## 11. Agent Events

Rail behavior:

- Rail shows a compact summary only.
- Clicking opens an agent events page or modal.

Required event types:

- `news_detected`
- `disclosure_detected`
- `toss_signal_detected`
- `market_movement_detected`

The UI must explain what these events mean.

Definition:

- An agent event is an input signal or observation that can be reviewed by Araon's agent layer.
- An event does not automatically mean buy/sell.
- An event can lead to analysis, a simulated preview, or a gated order intent.
- Live execution remains locked unless explicit approval and live policy requirements are satisfied.

Event click behavior:

- If the event is primarily ticker-related, it should select/open that ticker.
- If the event is agent-decision-related, it should open the agent events page/modal.
- The page/modal should show reason, source, freshness, confidence/relevance if available, and any linked preview/order intent.

## 12. Preview / Order Intent / Order Safety

The user asked what preview/order intent means, so the UI must teach it.

Definitions:

- Preview: a simulated/paper/gated draft of a possible order. It is not a real order.
- Order intent: a structured agent/user intention to place an order, still subject to risk checks and approval.
- Approval challenge: a fresh user confirmation step required before live execution.
- Audit trail: record of why an action was suggested, previewed, approved, blocked, or skipped.
- Live execution: actual broker-side order placement/cancel/modify. This is locked by default.

Required:

- Strong live trading locked indicator.
- Order safety rail or page/modal.
- Approval flow UI.
- Kill switch state when relevant.
- Audit state.
- Clear visual separation between preview and live execution.

Unknowns resolved by design judgment:

- Place summary in the right ops rail.
- Place detailed approval/audit flow in a modal or dedicated page.
- Make live execution locked state strongly visible.
- Do not expose one-click live buy/sell by default.

Never execute real order, cancel, modify, account mutation, or live auto-buy without separate explicit approval.

## 13. Data Policy

Implementation should use real backend data whenever possible.

Allowed during building:

- static sample data for layout exploration,
- real ticker names for examples,
- placeholder state labels.

Not allowed in final accepted UI:

- fake prices,
- fake P/L,
- fake account values,
- fake order values,
- fake historical candles,
- fake TOP100 rankings,
- fake provider freshness.

Unknown or unavailable values should display:

- `수집 중`
- `대기`
- `미제공`
- `로그인 필요`
- `locked`
- `read-only`
- `fallback`
- `stale`
- `partial`

Price/account UI can be implemented with placeholders only if it is ready to swap to real API data and visibly does not pretend placeholder data is real.

## 14. Visual Tone

Light mode first.

Dark mode:

- supported/refined,
- but not allowed to delay the primary light-mode browser acceptance.

Tone target:

- Toss-like density and account rail confidence,
- Araon-owned palette and component language,
- professional terminal feel,
- consumer-fintech clarity,
- no generic neutral SaaS dashboard,
- no dark-copy of Toss.

The Toss screenshots feel closer to a professional trading terminal with consumer-fintech polish. Araon should aim for that balance.

## 15. Implementation Strategy

Start from a new layout shell.

Preferred approach:

1. Read current `src/client/App.tsx`, `src/client/styles/global.css`, stores, API client, and major existing components.
2. Map existing data contracts to the new view model.
3. Create a new app layout shell with clear routes/modes:
   - home/operations mode,
   - selected ticker/detail mode,
   - agent events modal/page,
   - order safety/approval modal/page.
4. Convert inline-heavy components toward CSS class-based styles.
5. Reuse existing backend-connected components only where they fit.
6. Add new frontend components freely when cleaner.
7. Keep backend/API contract stable where possible.

CSS:

- Keep `global.css` tokens.
- Improve tokens only when needed and consistent with [docs/design.md](./design.md).
- Prefer named classes for new surfaces.
- Preserve tabular numerals.

## 16. Interaction Requirements

Must be checked by real browser interaction:

- selecting ticker from TOP100/movers,
- selecting ticker from watchlist,
- returning home,
- chart/detail tab switching,
- orderbook tab switching,
- news/disclosure/signal surface,
- right rail visibility,
- Toss login action discoverability when logged out,
- Toss session pill when logged in,
- KIS slot list scroll,
- pin/star interaction,
- agent event click,
- agent events modal/page,
- order safety/approval modal/page,
- live locked state visibility,
- responsive layout at target viewports.

The user explicitly wants visual/interaction QA like a real human using the app.

## 17. Verification Requirements

Do not judge completion by code inspection only.

Required checks before claiming completion:

- focused frontend tests or `npm test` where relevant,
- `npm run typecheck`,
- `npm run build`,
- `git diff --check`,
- sensitive/raw value check for UI/console/docs/diff/stdout exposure,
- actual browser/Computer Use visual inspection.

Viewport checks:

- 1920x1080,
- 1600x1000,
- 1440x990.

Visual acceptance checklist:

- no horizontal overflow,
- no overlapping text,
- no clipped important buttons,
- no incoherent nested cards,
- no hidden live-trading risk,
- no fake final finance data,
- provider warnings visible,
- right ops rail usable,
- chart area stable,
- modal/page flows reachable,
- dark mode not broken if touched.

## 18. Milestones

### Milestone 1: Inventory And Design Mapping

Read current frontend and API data contracts. Produce a short implementation map:

- what to reuse,
- what to replace,
- what data exists,
- what requires frontend adapter,
- what is blocked or gated.

### Milestone 2: New Layout Shell

Build the new shell:

- header,
- status bar,
- home/detail mode,
- market rail,
- watch/KIS rail,
- focus panel,
- ops rail.

### Milestone 3: Ticker Detail Experience

Implement:

- selected ticker default,
- chart,
- orderbook/호가 tab,
- news/disclosure/signal surfaces,
- home/detail transitions.

### Milestone 4: Toss Account And Watchlist UX

Implement:

- Toss session pill,
- QR login discoverability,
- account/portfolio rail,
- unified watchlist/favorite UI,
- Toss sync pending/gated state where mutation is not safely available.

### Milestone 5: KIS Realtime Candidate UX

Implement:

- KIS absent/available state,
- full candidate list scroll,
- slot usage,
- subscribed/fallback/polling indicators,
- pin/star interaction UI.

### Milestone 6: Agent And Order Safety UX

Implement:

- agent event summary rail,
- agent events page/modal,
- preview/order-intent explanation,
- order safety rail/page/modal,
- approval flow UI,
- live trading locked state.

### Milestone 7: Visual QA And Hardening

Run:

- tests/typecheck/build/diff checks,
- real browser visual inspection,
- target viewport checks,
- interaction checks,
- sensitive/raw value checks.

## 19. Compact Goal Prompt

Use this compact prompt when starting or resuming the persistent goal:

```text
Araon 프론트엔드를 처음부터 새 React/Vite UI로 재설계/구현한다. 기준 repo는 /Users/stello/korean-stock-follower 이고, 백엔드/API 계약은 가능한 유지한다. 상세 요구사항과 완료 조건은 /Users/stello/korean-stock-follower/docs/frontend-redesign-brief.md 를 authoritative source로 따른다. 디자인 시스템은 /Users/stello/korean-stock-follower/docs/design.md 를 사용한다. OpenDesign과 Toss 스크린샷은 레이아웃/밀도 참고만 한다. 완료는 실제 브라우저/Computer Use에서 1920x1080, 1600x1000, 1440x990 visual/interaction QA를 통과하고, home 운영 view + selected ticker/chart detail + Toss-like ops rail + unified watchlist/KIS rail + agent events + order safety/approval flow가 동작할 때만 처리한다.
```

## 20. Completion Definition

The goal is complete only when:

- new React/Vite frontend is implemented,
- home/operations mode works,
- selected ticker/detail/chart mode works,
- Toss-like ops rail works,
- Toss auth/session state is visible and safe,
- unified watchlist/favorite/KIS candidate flow is represented,
- KIS optional realtime rail handles absent/available states,
- agent events modal/page exists,
- order safety and approval flow UI exists,
- live trading locked is obvious,
- final UI uses real backend data or honest unavailable states,
- no fake final finance data remains,
- no raw sensitive provider/account/session/order values are exposed,
- required tests/build/diff checks pass or any failure is clearly explained,
- actual browser visual/interaction QA passes at required viewports.
