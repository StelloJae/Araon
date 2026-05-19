# Araon Design System

> Category: Fintech & Korean Stock Terminal
> Localhost-first personal trading dashboard. Toss-first account/read surfaces, optional KIS low-latency market-data rail, agent-event readiness.

## 1. Visual Theme & Atmosphere

Araon should feel like a calm Korean market terminal for one serious operator. It is not a marketing site, not a crypto exchange splash page, and not a playful consumer app. It is a dense but composed desktop console where the user can scan market movement, select a ticker, understand account/session state, and see whether agent-facing events are ready without leaving the first screen.

The original Claude Design prototype established the core visual DNA: a light operational canvas, white cards, compact Korean stock rows, red/blue market semantics, IBM Plex Sans, tabular numerals, sticky top chrome, and a sticky bottom status bar. The production Araon UI should keep that DNA while evolving from a watchlist dashboard into a Toss-first terminal with optional KIS realtime acceleration.

The interface should borrow the confidence and density of professional trading software, but keep the friendliness and legibility of a local personal tool. Numbers, provider state, freshness, and safety locks are primary visual objects. Decorative graphics, hero sections, marketing copy, and synthetic sample data should be avoided.

Araon's distinctive tension is between consumer-fintech clarity and operator-console honesty. Toss account/session surfaces should feel approachable and readable; KIS realtime slot allocation, provider state, SSE status, news/disclosure freshness, and order safety should be explicit and audit-friendly. If data is missing, partial, stale, locked, or waiting, the UI should say so plainly.

Key Characteristics:
- Light terminal-first layout: white panels on a soft grey page canvas
- Korean stock convention: red for gains/up, blue for losses/down, grey for flat
- IBM Plex Sans with tabular numerals for dense stock and account values
- Compact status pills for provider state, freshness, locks, and rail assignment
- Locked home information architecture: 50:50 market/account workspace with a narrow collapsible Toss account rail
- Chart/detail panel as the center of gravity, not a decorative card
- Right ops rail that stays visible for Toss session, account, agent events, and order safety
- Explicit empty/collecting/locked states instead of invented finance data
- Minimal animation: tick flashes, live dots, view transitions, and status changes only

### Current Home Layout Lock-In

This section overrides older four-rail exploratory language when designing the
current Araon home screen.

- Home is the primary operating screen.
- Excluding the right account sidebar, the main workspace splits 50:50 horizontally.
- Left half:
  - Top 50%: rising/falling TOP100 or market movers.
  - Bottom 50%: split 50:50 into Toss-synced watchlist/favorites and recent surge.
- Right half:
  - Top 50%: selected ticker panel with chart, quote state, and source tabs.
  - Bottom 50%: agent candidates, evidence, and safety summary.
- The right Toss account rail is narrow, white/Araon-styled, and collapsible.
- When the account rail collapses, the main workspace expands to fill the freed space.
- Full Chart expands from the selected ticker panel into a whole-workspace view.
- Agent Detail expands from the agent panel into a whole-workspace view.
- Do not use the term `Ticker Detail`; use `selected ticker panel`, `Full Chart`, and `Agent Detail`.
- Bottom market/status marquee remains visible on every primary screen.

## 2. Color Palette & Roles

Araon inherits the initial handoff token set from `Korean Watchlist.html` and production `src/client/styles/global.css`. Use these tokens first. Add new colors only when a product state cannot be expressed with an existing token.

### Brand & Primary

- Araon Accent Red (`#F6465D` / `--accent`): primary brand accent, live market emphasis, selected tab underline, positive Korean price movement
- Araon Gold (`#F0B90B` / `--gold`): favorite stars, caution/readiness pills, approval-preview emphasis, low-volume secondary accent
- Gold Soft (`rgba(240, 185, 11, 0.14)` light / `rgba(240, 185, 11, 0.18)` dark): background for non-danger caution and preview states
- Gold Text (`#B88704` light / `#F0B90B` dark): readable text on gold-soft surfaces

### Korean Market Semantics

Korean equity UI reverses common western/crypto semantics. This is non-negotiable.

- KR Up (`#F6465D` / `--kr-up`): positive price movement, gainers, bullish bars, up ticks, positive P/L
- KR Down (`#1EAEDB` / `--kr-down`): negative price movement, losers, down ticks, negative P/L
- KR Flat (`#848E9C` / `--kr-flat`): unchanged price, unknown direction, neutral deltas

Tint scale:

| Token | Light Value | Role |
|---|---:|---|
| `--up-tint-1` | `rgba(246, 70, 93, 0.08)` | Mild gain row background |
| `--up-tint-2` | `rgba(246, 70, 93, 0.16)` | Active gain emphasis |
| `--up-tint-3` | `rgba(246, 70, 93, 0.32)` | Strong flash or high-movement overlay |
| `--down-tint-1` | `rgba(30, 174, 219, 0.08)` | Mild loss row background |
| `--down-tint-2` | `rgba(30, 174, 219, 0.16)` | Active loss emphasis |
| `--down-tint-3` | `rgba(30, 174, 219, 0.32)` | Strong flash or high-movement overlay |

Do not use green for Korean stock gains. Green may appear only for generic connectivity/success states when no market direction is implied.

### Surface & Background

- Page Background (`#F5F5F5` / `--bg-page`): app canvas behind terminal panels
- Card Background (`#FFFFFF` / `--bg-card`): primary panel and card surface
- Tinted Background (`#F5F5F5` / `--bg-tint`): segmented controls, inactive buttons, input fill, disabled-adjacent states
- Flash Overlay (`rgba(255,255,255,0.6)` / `--bg-flash-overlay`): transient tick updates and gentle overlay effects
- Dark Page (`#0E1116` dark mode): optional dark theme canvas
- Dark Card (`#161B22` dark mode): optional dark theme panel surface

### Text

- Strong Text (`#1E2026` / `--text-strong`): major headings, selected ticker name, important account values
- Primary Text (`#1E2026` / `--text-primary`): standard labels and row text
- Secondary Text (`#32313A` / `--text-secondary`): supporting text, row metadata, control labels
- Muted Text (`#848E9C` / `--text-muted`): provider messages, timestamps, empty-state detail, low-priority metadata
- Inactive Text (`#D7DBE0` / `--text-inactive`): disabled or absent controls

### Borders

- Standard Border (`#E6E8EA` / `--border`): panel frames, row separators, inputs
- Soft Border (`#F0F2F4` / `--border-soft`): internal row separators, compact rail dividers
- Sentiment Borders: use KR red/blue alpha borders only when a row or card is directionally meaningful

### Provider & Safety State Roles

Use color by meaning, not by provider branding alone:

- Toss session ready: neutral text + compact "read-only" or "session ready" pill
- Toss login required: gold-soft pill, because it is an action needed but not an error
- Toss SSE collecting: blue dot or neutral collecting pill
- KIS realtime active/subscribed: KR up red may be used only as "active market rail" emphasis; avoid implying price gain unless paired with price data
- Toss REST refresh / non-WS lane: neutral or gold-soft pill only when user action is needed
- Live order execution locked: gold-soft or muted locked pill; never use red unless the action is dangerous or blocked
- Error or failed provider call: accent red border/text, with short human-readable reason

## 3. Typography Rules

### Font Family

Primary:

```css
'IBM Plex Sans', -apple-system, 'Apple SD Gothic Neo',
'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif
```

IBM Plex Sans is the intended product typeface because it has a precise data-interface feel and works well with tabular numerals. The Korean system fallbacks must remain in the stack for Hangul rendering quality.

Numeric settings:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1;
```

Use tabular numerals in every price, percent, rank, count, latency, and timestamp surface.

### Hierarchy

Araon is a terminal, so type is smaller and denser than a landing page. Avoid oversized hero typography.

| Role | Size | Weight | Line Height | Letter Spacing | Use |
|---|---:|---:|---:|---:|---|
| App Wordmark KR | 18px | 800 | 1.0 | -0.4px | Header brand |
| Selected Ticker Title | 24px | 900 | 1.1 | 0 | Focus panel stock name |
| Panel Title | 13-14px | 800 | 1.2 | 0 | Rail/card headers |
| Section Title | 15-17px | 800 | 1.2 | 0 | TOP100, watchlist, sector blocks |
| Metric Value Large | 18-24px | 900 | 1.0 | 0 | Current price, total assets |
| Metric Value | 13-14px | 800 | 1.1 | 0 | Quote/account rail values |
| Row Primary | 12-14px | 700-800 | 1.25 | 0 | Stock names, tickers, event rows |
| Body / Helper | 11-12px | 600-700 | 1.35 | 0 | Empty states, subtitles, provider details |
| Pill Text | 10-11px | 800-900 | 1.0 | 0 | Status pills and count badges |
| Micro Label | 9-10px | 700-800 | 1.0 | 0.3px max | Market badges, rank labels |

### Principles

- Use heavier weights for data and state labels. Araon should feel decisive, not airy.
- Keep letter spacing at `0` by default. Use slight positive spacing only for uppercase micro labels.
- Never scale font size with viewport width. Use responsive layout changes instead.
- Long Korean labels must wrap or truncate intentionally. No clipped button labels.
- Use muted text for explanation, not for primary data.
- Do not put large paragraph copy inside the app surface. If a panel needs explanation, reduce it to a short state line.

## 4. Component Stylings

### Terminal Shell

- Page background: `var(--bg-page)`
- Main width: up to 1920px, centered
- Desktop padding: 16-20px horizontal, 40px bottom
- Wide desktop grid:
  - Market rail: `minmax(320px, 0.92fr)`
  - Watch/KIS rail: `minmax(260px, 0.72fr)`
  - Focus panel: `minmax(520px, 1.45fr)`
  - Ops rail: `minmax(300px, 0.86fr)`
- Gap: 16px
- Sticky rails on wide desktop: top offset 84px, full-height operational panels

### Header

- Height: 64px
- Background: `var(--bg-card)`
- Border bottom: `1px solid var(--border)`
- Padding: `0 24px`
- Contents:
  - Logo mark + "아라온 · Araon"
  - Market status pill
  - Center global search
  - Optional backfill/status pill
  - View segmented control
  - Theme/settings buttons
  - SSE/realtime indicator

Header should be quiet and utility-focused. Do not turn it into a navigation bar with marketing links.

### Status Bar

- Height: about 40px
- Sticky bottom
- Background: `var(--bg-card)`
- Border top: `1px solid var(--border)`
- Font: 12px, muted labels, strong values
- Should expose:
  - market status
  - total tracked symbols
  - favorite or KIS realtime count
  - non-WS refresh count
  - Toss price/provider coverage
  - last update timestamp

### Panels & Cards

Panel defaults:

- Background: `var(--bg-card)`
- Border: `1px solid var(--border)`
- Radius: 12px for current legacy panels; prefer 8-12px and do not exceed 12px for terminal surfaces
- Shadow: none or extremely subtle; border does most of the work
- Overflow: hidden when rows are framed; visible only when menus/tooltips require it

Use cards for:

- panels
- rows inside repeated lists
- modals
- truly framed tools

Avoid:

- cards inside cards when a divider row would work
- decorative nested cards
- marketing-style hero sections
- gradient/orb backgrounds

### Buttons

Icon buttons:

- Size: 32-34px square
- Radius: 8px
- Background: `var(--bg-tint)`
- Border: `1px solid var(--border)`
- Icon color: `var(--text-secondary)`
- Use for settings, favorite, close, more, refresh, detail actions where icons are familiar

Compact text buttons:

- Height: 24-32px
- Radius: 8px or pill depending on context
- Font: 10-12px, 800-900
- Use short labels only: `상세`, `preview`, `새로고침`, `로그인`

Segmented controls:

- Track: `var(--bg-tint)`
- Active segment: `var(--bg-card)`
- Radius: 8px track, 6px active segment
- Active shadow: subtle `rgba(32,32,37,0.08) 0px 1px 3px`

Dangerous or live-trading buttons:

- Do not expose one-click live execution.
- Show preview/order-intent creation separately from live approval.
- Live execution must be visually locked unless explicit policy and approval gates are satisfied.

### Status Pills

Pills are core Araon vocabulary. They should be small, explicit, and consistent.

Default:

- Font: 10-11px / 800-900
- Radius: 50px
- Padding: 2-8px horizontal
- Background: `var(--bg-tint)`
- Border: `1px solid var(--border-soft)`

Recommended labels:

- `LIVE`
- `SNAPSHOT`
- `수집 중`
- `대기`
- `미제공`
- `read-only`
- `login required`
- `session ready`
- `실시간 추적 32/40`
- `Toss Synced`
- `Local Only`
- `Sync Pending`
- `Sync Unavailable`
- `실시간 추적`
- `비실시간`
- `live locked`
- `preview`

Do not use vague labels like "OK" when the user needs to know provider/source/freshness.
Do not use `fallback`, `polling`, or `KIS WS` as user-facing status labels.
Prefer Korean product terms such as `비실시간`, `대기`, `지원 대기`, `Toss 가격`,
or `실시간 추적`, depending on what the user can actually act on.

### Stock Rows

Rows should be scan-first, not card-first.

Layout:

- Rank: 20px fixed, right-aligned, muted
- Main: name + code/market metadata
- Price: right-aligned, tabular
- Change: right-aligned, KR red/blue
- Optional reason/source: truncated metadata text

Tint:

- Directional depth bars can show movement intensity.
- Cap visual depth so large moves do not flood the entire row.
- Use red/blue overlays with alpha, not solid fills.

Interaction:

- Hover: `var(--bg-tint)`
- Incoming tick flash: border/glow or row overlay for about 280ms
- Click row selects ticker in focus panel; detail modal is secondary

### Stock Cards

The original prototype used stock cards heavily. In terminal mode, prefer rows for dense lists and reserve cards for:

- compact watchlist summaries
- selected ticker metrics
- modal detail sections

If a StockCard is used:

- Radius: 12px
- Padding: 14px 16px
- Price: 24px / 700-900
- Name: 15px / 700-800
- Code: 11px / 600, muted
- Market badge: 9-10px, tight border, 3px radius
- Favorite star: gold when active, muted outline when inactive

### Charts

Charts are data surfaces, not illustrations.

- Render only stored or provider-returned candles.
- If no candles exist, show `수집 중`, `대기`, or `미제공`; do not draw synthetic candles.
- Chart container should have stable height and not resize on loading text.
- Grid lines should be low-contrast `var(--border-soft)`.
- Price axis and labels must use tabular numerals.
- Overlays should be functional: selected range, moving averages, buy/sell markers, or freshness state.

### Toss Account / Session Rail

This rail explains whether Toss can serve the account surfaces.

Required surfaces:

- Login/session status
- QR login action when needed
- Session extension/readiness state
- Account summary
- Portfolio positions
- Cash/orderable amount
- Pending/completed orders
- Transactions
- Toss watchlist

Design rules:

- Treat Toss account data as read-only unless live mutation is separately approved.
- Do not display raw session, cookie, account identifier, order identifier, or raw response payload.
- Use "login required", "session ready", "수집 중", "미제공", and short provider failure messages.
- Keep totals readable, but avoid overwhelming the ops rail with every account field.

### KIS Realtime Rail

KIS is not the primary account, order, ranking, chart, or backfill truth source. It is an optional low-latency Korean-stock market-data rail.

Required surfaces:

- Per-profile cap usage: `32/40` style
- Active slot candidates
- Candidate reason: `보유`, `고정`, `화면`, `뉴스`, `공시`, `Toss`, `agent`, `관심`, `TOP100`
- State: subscribed, pinned, waiting, unavailable
- Toss 가격 / non-realtime count
- Diff summary: subscribe/unsubscribe changes
- Churn/cooldown state when relevant

Design rules:

- Show why a symbol received a realtime slot.
- Show why another symbol is waiting, unavailable, or staying on Toss 가격 updates.
- Never imply KIS is the trading/account source.
- Never display raw KIS credentials, tokens, approval key, account number, or raw WS frame.

### Agent Events Rail

Agent events are an input queue, not a magical trading box.

Required event types:

- `news_detected`
- `disclosure_detected`
- `toss_signal_detected`
- `market_movement_detected`

Each visible event should include:

- ticker
- source
- reason
- freshness or first-seen label
- confidence/relevance where available
- optional preview action

Design rules:

- Event rows should be compact and newest-first.
- Reasons should truncate, not wrap into tall paragraphs.
- Preview actions are allowed; live execution is not.
- If no events exist, show a calm empty state, not filler events.

### Order Intent / Safety Rail

This rail exists to prevent accidental live trading.

Required surfaces:

- latest simulated/paper preview
- order-intent status
- approval challenge status
- audit decision
- live policy / kill switch state
- "live locked" until explicit gates exist

Design rules:

- Preview and live execution must look visually different.
- Use gold-soft for preview/gated state.
- Use muted/locked state for live execution unavailable.
- Never place a primary red "buy now" button in the rail by default.
- Every live path should visibly stop at fresh approval.

### Empty, Loading, Stale, and Partial States

Araon's honesty depends on state surfaces.

Preferred labels:

- `수집 중`
- `대기`
- `미제공`
- `로그인 필요`
- `세션 확인 중`
- `provider 대기`
- `partial`
- `Polling`
- `Sync Pending`
- `Sync Unavailable`
- `stale`
- `locked`

Avoid:

- fake zeros for missing finance data
- fake historical candles
- watchlist rows pretending to be TOP100
- generic "No data" without provider or next state

## 5. Layout Principles

### Spacing System

Base unit: 4px with 8px rhythm.

| Token | Value | Use |
|---|---:|---|
| space-1 | 4px | micro gaps, icon/text gaps |
| space-2 | 8px | row gaps, small padding |
| space-3 | 12px | row padding, compact panels |
| space-4 | 16px | panel gaps, standard grid gap |
| space-5 | 20px | header/body split, larger padding |
| space-6 | 24px | header horizontal padding, major panel padding |
| space-7 | 32px | modal/content section padding |
| space-8 | 40-48px | bottom breathing room |

### Desktop Information Architecture

Primary target: desktop/Electron-like operation at 1440x900 and 1600x1000.

Current wide home layout:

1. Main workspace, excluding account rail, split 50:50 horizontally.
2. Left half:
   - top: TOP100/movers
   - bottom: 50:50 watchlist/favorites and recent surge
3. Right half:
   - top: selected ticker panel with chart and provider tabs
   - bottom: agent candidates/evidence/safety
4. Narrow right account rail:
   - Toss auth/session
   - Toss account/portfolio
   - order and activity summary
   - collapsible icon rail

The selected ticker panel and agent panel should be the center of gravity. The
account rail should stay narrow and collapsible rather than occupying a full
dashboard column.

### Responsive Collapse

Breakpoints:

| Width | Layout |
|---:|---|
| `>1500px` | 50:50 main workspace + narrow account rail |
| `1200-1500px` | 50:50 workspace; account rail may compact |
| `900-1200px` | account rail collapses; main workspace fills width |
| `<900px` | stacked scan order: selected ticker, TOP100, watchlist/surge, agent, account |

Mobile is not the primary surface. Still, no horizontal overflow, clipped labels, or inaccessible controls are allowed.

### Whitespace Philosophy

Araon should use whitespace to separate operational domains, not to create marketing spaciousness. Dense data rows can be tight; panel boundaries and rail gaps provide structure. The user should be able to scan the screen quickly without feeling trapped inside nested boxes.

### Border Radius Scale

| Value | Context |
|---:|---|
| 3px | Market badges, tiny tags |
| 6px | Active segmented-control item, compact row actions |
| 8px | Icon buttons, inputs, tight terminal controls |
| 10px | Small status groups and search boxes |
| 12px | Current panel/card standard |
| 50px | Pills, status badges, favorites/count chips |

Do not exceed 12px on app panels unless designing a modal/window shell.

## 6. Depth, Motion & Feedback

### Depth

Araon is mostly flat.

| Level | Treatment | Use |
|---|---|---|
| Flat | border only | default panels and rows |
| Subtle | `rgba(32,32,37,0.05) 0px 3px 5px` | legacy stock cards, active segmented item |
| Flash | `0 0 0 2px <sentiment>33` | transient tick update |
| Overlay | soft shadow + red left border | error banner, toast |

Heavy shadows are inappropriate for normal terminal panels.

### Motion

Allowed:

- live dot pulse
- tick flash, about 280ms
- error/toast slide-in, about 200ms
- view transition for stock sorting when stable
- small hover transitions, 120-200ms

Avoid:

- decorative entrance animations
- looping background effects
- large card lift
- chart animation that hides stale or missing data

### Feedback

Every action should immediately show state:

- selecting a ticker updates the focus panel
- QR login starts a visible session state
- refresh actions show collecting/ready/error
- order preview creates an audit-visible preview row
- KIS slot assignment shows reason and waiting/Toss-refresh state if not selected

## 7. Product & Data Safety Rules

These are design-system rules because visual design can accidentally lie.

### Do Not Expose Raw Sensitive Values

Never show raw values for:

- Toss session/cookie/storage identifiers
- Toss account identifiers
- Toss order identifiers
- raw Toss response payloads
- KIS app credentials
- KIS access/approval tokens
- KIS account numbers
- raw KIS WS frames
- Telegram/Naver/OpenDART secrets

UI may show sanitized status such as `session ready`, `read-only`, `token 만료`, or `login required`.

### Do Not Create Synthetic Finance Data

If a value is unknown:

- leave it blank, or
- show `수집 중`, `대기`, `미제공`, `로그인 필요`, or `partial`

Never invent:

- prices
- P/L
- orderable cash
- candle history
- TOP100 ranking rows
- provider freshness
- agent confidence

Design mockups may use static sample data only when clearly labeled as static sample and never mixed with production screenshots.

### Provider Truth

- Toss-first: quote, chart, search, TOP100, account, portfolio, watchlist, orders, transactions, cash overview
- Toss realtime: SSE thin notification plus REST refresh
- KIS optional rail: low-latency market ticks for high-value Korean symbols under the slot cap
- KIS REST polling/chart/master/import legacy surfaces must stay hidden behind explicit legacy/manual controls and must not visually dominate Toss-first architecture

### Trading Safety

- Live order execution is locked by default.
- Preview/order-intent is allowed when clearly labeled simulated/paper/gated.
- Fresh approval is required before live execution.
- Kill switch, amount limits, ticker limits, order type, cooldown, and audit state must be visible before any live automation design is considered.

## 8. Do's and Don'ts

### Do

- Use existing Araon CSS variables before inventing new tokens.
- Keep red for Korean gains and blue for Korean losses.
- Use tabular numerals everywhere numbers align.
- Keep the chart/detail area central and wide.
- Keep the ops rail visible on desktop.
- Show provider source and freshness where it affects trust.
- Show KIS slot reasons and waiting/Toss-refresh state.
- Show Toss login/session state plainly.
- Use compact rows for data-dense lists.
- Use status pills for state, but keep labels short.
- Preserve empty states that communicate real collection status.
- Design for 1440x900 and 1600x1000 first.

### Don't

- Don't use a landing-page hero inside the app.
- Don't use large decorative gradients, blobs, or orbs.
- Don't use green for Korean price gains.
- Don't make TOP100 from watchlist filler rows.
- Don't show account/order/session raw identifiers.
- Don't show fake candles or fake historical charts.
- Don't hide live trading locks behind a tiny footer.
- Don't place UI cards inside other decorative cards.
- Don't over-round terminal panels.
- Don't bury provider errors in console-only state.
- Don't use long explanatory paragraphs in panels.
- Don't let button labels clip or overlap in narrow Electron widths.

## 9. Responsive Behavior

### Primary Viewports

| Viewport | Expectation |
|---|---|
| 1600x1000 | 50:50 main workspace plus narrow account rail visible |
| 1440x900 | 50:50 main workspace remains usable; no clipped labels |
| 1280x800 | account rail may compact; selected ticker remains readable |
| 900px wide | stacked scan order; selected ticker first |

### Touch & Click Targets

- Icon buttons: at least 32x32px on desktop, 40x40px where touch is plausible
- Primary actions: at least 32px high on desktop
- Row targets: full row clickable, not only ticker text
- Search input: large enough for Korean names and six-digit codes

### Text Behavior

- Ticker and code should not wrap.
- Korean stock names may truncate with ellipsis in list rows.
- Provider reason text should truncate in rails.
- Empty-state copy may wrap but should stay under two lines where possible.
- Long status pill text should be shortened rather than squeezed.

## 10. Agent Prompt Guide

Use this section when asking Codex Design or another design agent to create or revise Araon screens.

### Quick Color Reference

- Accent / KR Up: `#F6465D`
- KR Down: `#1EAEDB`
- Gold / Favorite / Preview: `#F0B90B`
- Page: `#F5F5F5`
- Card: `#FFFFFF`
- Strong Text: `#1E2026`
- Secondary Text: `#32313A`
- Muted Text: `#848E9C`
- Border: `#E6E8EA`
- Soft Border: `#F0F2F4`
- Dark Page: `#0E1116`
- Dark Card: `#161B22`

### Example Component Prompts

- "Design an Araon terminal header using the existing tokens: 64px sticky white header, Araon wordmark, LIVE market pill, centered ticker search, compact segmented view toggle, settings icon button, and SSE/KIS realtime status. Keep it utility-first and avoid marketing navigation."
- "Create a TOP100/movers rail with two compact list columns for 상승 and 하락. Use Korean stock semantics: red `#F6465D` for gains, blue `#1EAEDB` for losses, rank numbers, ticker/name, price, percent change, and subtle alpha depth bars."
- "Design a selected ticker focus panel. Header shows stock name, code, market, favorite button, and source pills. Below it show quote metrics, a real candle chart area, and tabs for Chart, News, Disclosures, Signals. Use `수집 중` or `미제공` for missing data."
- "Design the Toss account/session ops rail. It should show login required/session ready/read-only states, account summary, positions, orders, transactions, and watchlist counts. Do not show raw session, account, order, or response identifiers."
- "Design 실시간 추적 state as optional market-data acceleration. Show `실시간 추적 32/40`, subscribed/waiting rows, source reason such as 보유/고정/화면/뉴스/agent/TOP100, and cooldown/diff metadata. If a row is not in a realtime slot, label it as Toss 가격 or waiting, never as a KIS-owned waiting lane. Do not present KIS as account, chart-history, ranking, or trading source."
- "Design the order safety rail. Show simulated preview, gated order intent, approval audit, live policy, and a clear `live locked` state. Do not include one-click live buy execution."
- "Design an agent event queue with rows for news_detected, disclosure_detected, toss_signal_detected, and market_movement_detected. Each row should include ticker, source, reason, freshness, confidence/relevance when available, and a preview action only."

### Iteration Guide

When refining Araon:

1. Preserve the existing `src/client/styles/global.css` tokens unless there is a strong reason to add a new token.
2. Fix information architecture before visual polish.
3. Verify desktop density at 1440x900 and 1600x1000.
4. Keep the right ops rail visible for session, safety, and agent readiness.
5. Make provider/freshness/partial states visible before adding visual decoration.
6. Remove synthetic data from designs unless explicitly labeled as static sample.
7. Tune one surface at a time: header, market rail, watch/KIS rail, focus panel, ops rail, status bar.
8. After any visual change, inspect the real app screen; code review alone is not enough for layout acceptance.

### Design Review Checklist

- Are KR gains red and KR losses blue everywhere?
- Are unknown values shown as `수집 중`, `대기`, `미제공`, or similarly honest states?
- Does TOP100 come from provider ranking, not watchlist filler?
- Is the selected ticker focus panel the clearest area on the screen?
- Is Toss session/account state visible without exposing sensitive raw values?
- Is KIS clearly optional and limited to realtime market data?
- Is live trading clearly locked?
- Are agent events inputs/audit surfaces, not autonomous execution promises?
- Does the UI fit without overlap at 1440x900?
- Are text labels unclipped in Korean?
