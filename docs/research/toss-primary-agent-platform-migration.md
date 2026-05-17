# Toss Primary Agent Platform Migration

## Purpose

Araon is moving from a KIS-first Korean stock dashboard to a Toss-primary
personal investment terminal with news, disclosure, signal, and agent event
foundations.

This is not a full KIS deletion plan. KIS is re-scoped as an optional
low-latency Korean equity realtime WebSocket market-data rail. Toss becomes the
primary source for login, account, portfolio, orders, transaction views, public
market data, charts, and authenticated notification triggers.

Frontend implementation should move with the backend, but the existing Araon
React/Vite structure, design-system variables, component tone, layout density,
and status-display style remain the source of truth. OpenDesign output is a
reference wireframe only; visual redesign must not break API contracts, data
safety boundaries, or the no-synthetic-financial-data rule.

## Current Workspace Snapshot

- Repo: `/Users/stello/korean-stock-follower`
- Reference repo: `/Users/stello/tossinvest-cli`
- `tossinvest-cli` is read-only reference material and must not be edited.
- The current Araon worktree already has uncommitted TOP100 market selector
  changes in:
  - `src/client/components/SectionStack.tsx`
  - `src/client/lib/api-client.ts`
  - `src/server/app.ts`
  - `src/server/market/market-top-movers-service.ts`
  - `src/server/routes/market.ts`
  - `src/shared/types.ts`

These changes appear aligned with Toss-first TOP100 work and must be preserved
unless the user explicitly asks to replace them.

## Reference Facts From tossinvest-cli

### Toss Session

The reference CLI uses browser-assisted QR login and stores a persistent web
session. The user must confirm device persistence from the phone prompt, or the
session behaves like a short-lived browser session. Toss also has a server-side
session expiry clock separate from cookie max-age. The reference CLI extends it
through a phone approval flow.

Araon already has the start of this model:

- encrypted Toss session storage in `src/server/toss/toss-session-store.ts`
- Chrome/CDP login capture in `src/server/toss/toss-cdp-login-service.ts`
- sanitized auth routes in `src/server/routes/toss-auth.ts`

Remaining session work should prioritize server-side expiry refresh and status
clarity without exposing cookie names, cookie values, storage values, QR
payloads, account identifiers, or raw Toss responses.

### Toss Realtime

Toss upstream must not be treated as WebSocket. The reference CLI documents and
implements the authenticated notification stream as SSE:

- `GET https://sse-message.tossinvest.com/api/v1/wts-notification`
- `Accept: text/event-stream`
- graceful `connection-close` events require immediate reconnect
- events are thin notifications and require REST re-fetch

Araon already has:

- `src/server/toss/toss-sse-client.ts`
- `src/server/toss/toss-realtime-service.ts`
- `src/server/toss/toss-realtime-quote-refresh.ts`
- `src/server/routes/toss-realtime.ts`

The current implementation correctly marks Toss SSE as
`thinNotificationOnly=true`. It should grow from price-refresh metadata into a
typed refresh router:

| Toss SSE type | Araon follow-up |
| --- | --- |
| `price-refresh` | refresh Toss quote for tracked/supported ticker |
| `pending-order-refresh` | refresh pending orders |
| `purchase-price-refresh` | refresh buying power, average price, cost basis |
| `share-holdings` | refresh portfolio position and account summary |
| `web-push` | count sanitized user notification presence and emit a generic local UI notification, no raw payload exposure |
| unknown | count and classify safely, then document before wiring |

Implementation note:

- Toss session extension foundation is implemented in
  `src/server/toss/toss-session-extension-service.ts` and
  `POST /toss/auth/session/extend`.
- Toss session status now distinguishes browser cookie expiry from Toss
  server-side activity expiry through `expiresAt`, `serverExpiresAt`, and
  `effectiveExpiresAt`. The UI renders the effective earliest expiry first so a
  long persistent cookie cannot hide a shorter server-side extension deadline.
- After QR login capture succeeds, Araon now does a best-effort server expiry
  refresh through the same sanitized session service, persisting
  `serverExpiresAt` without starting a phone approval document. If this refresh
  fails, login still succeeds and the user can use the explicit extend action.
- The first authenticated account read client is implemented in
  `src/server/toss/toss-account-client.ts` and exposed through
  `GET /toss/account/list`. It intentionally returns sanitized account
  references instead of raw Toss `accountNo` or `key` values.
- The first authenticated account summary/cash overview client is implemented
  in `src/server/toss/toss-account-summary-client.ts` and exposed through
  `GET /toss/account/summary`. It combines Toss all-market overview, cached
  orderable amounts, and KR/US withdrawable buckets without exposing raw account
  identifiers.
- The first authenticated portfolio positions client is implemented in
  `src/server/toss/toss-portfolio-client.ts` and exposed through
  `GET /toss/portfolio/positions`. It reads the Toss `SORTED_OVERVIEW` asset
  section and returns sanitized position fields without raw account identifiers.
- The first authenticated pending-orders client is implemented in
  `src/server/toss/toss-orders-client.ts` and exposed through
  `GET /toss/orders/pending`. It returns read-only order rows with local
  `pending-order-N` references instead of raw Toss order identifiers.
- The first authenticated completed-orders client is implemented in
  `src/server/toss/toss-orders-client.ts` and exposed through
  `GET /toss/orders/completed`. It supports market/date/page query options and
  returns sanitized `completed-order-N` references instead of raw Toss order
  identifiers.
- The first authenticated transaction ledger client is implemented in
  `src/server/toss/toss-transactions-client.ts` and exposed through
  `GET /toss/transactions`. It supports KR/US market, date range, filter, and
  paging query options while removing raw Toss `referenceId`, cursor, and
  `compositeKey` identifiers from the response.
- The first authenticated Toss watchlist client is implemented in
  `src/server/toss/toss-watchlist-client.ts` and exposed through
  `GET /toss/watchlist`. It reads the Toss `WATCHLIST` asset section and returns
  local `watchlist-group-N` / `watchlist-item-N` references instead of raw list
  or item identifiers.
- Authenticated Toss read routes now share a sanitized failure boundary. Missing
  sessions still return `TOSS_SESSION_REQUIRED`, known local order refs can
  return `TOSS_ORDER_NOT_FOUND`, and all other account/portfolio/order/
  transaction/watchlist read failures return `TOSS_READ_REQUEST_FAILED` without
  copying raw upstream response text, session material, account ids, order ids,
  or list identifiers into API responses.
- Toss auth/session routes now also use a sanitized failure boundary. Expected
  unavailable/invalid-input states keep their explicit responses, while
  unexpected status, clear, login, or extension failures return
  `TOSS_AUTH_REQUEST_FAILED` without copying raw session, storage, browser
  session, account, or phone-approval identifiers into API responses.
- QR login status messages are normalized before they reach the API/UI. Known
  operator-safe lifecycle messages are preserved, but unknown failure text is
  reduced to `TOSS_LOGIN_CAPTURE_FAILED` instead of exposing Chrome/CDP,
  session, storage, or browser-session details.
- A typed SSE refresh router is implemented in
  `src/server/toss/toss-sse-refresh-router.ts` and surfaced through
  `src/server/toss/toss-realtime-service.ts` status counters. It maps Toss thin
  notifications to sanitized internal refresh hints such as `pending-orders`,
  `account-summary`, `portfolio-positions`, and `user-notifications`.
- Toss realtime status now counts `web-push` notification presence separately
  through `userNotificationEventCount` and `lastUserNotificationAt`. Araon does
  not expose Toss notification title/message/content identifiers from the raw
  SSE frame.
- `web-push` presence is also pushed to connected browsers through a sanitized
  `toss-user-notification` app SSE frame. The client shows a generic
  ticker-scoped "Toss 알림" toast when a supported ticker is present, but still
  omits raw web-push title/message/content identifiers.
- Supported read-only REST refresh hints are executed by
  `src/server/toss/toss-sse-refresh-executor.ts`: pending orders, completed
  orders, account summary, and portfolio positions. Quote refresh remains on
  the existing Toss quote refresh handler, while notification/preferences/icon
  hints are intentionally classified but not yet executed.
- Toss realtime status keeps only sanitized error codes such as
  `TOSS_REALTIME_STREAM_FAILED`, `TOSS_PRICE_REFRESH_DISPATCH_FAILED`, and
  `TOSS_REFRESH_HINT_DISPATCH_FAILED`; route-level unexpected failures return
  `TOSS_REALTIME_REQUEST_FAILED`. Raw SSE/upstream/session/account messages do
  not cross into status API responses or the settings UI.
- SSE-triggered REST refresh audit rows also code unexpected failures as
  `TOSS_SSE_REFRESH_FAILED` instead of preserving provider error text, URLs,
  session material, account identifiers, or order identifiers.
- SSE-triggered account-wide REST refreshes are throttled by resource rather
  than by ticker. A burst of `share-holdings` notifications for multiple
  tickers therefore coalesces into one bounded portfolio/account refresh window
  instead of duplicating full-account Toss reads.
- `price-refresh` SSE notifications now enqueue sanitized
  `market_movement_detected` agent events while still dispatching Toss quote
  refresh.
- Browser-detected realtime momentum signals persisted through
  `POST /stocks/:ticker/signals` now also enqueue sanitized
  `market_movement_detected` agent events. The event references the local
  stock-signal id and signal type/window/momentum reason only, without
  exposing price/baseline raw fields.
- Existing Naver news refresh and DART disclosure refresh now enqueue sanitized
  `news_detected` and `disclosure_detected` events for agent consumers when
  Araon first sees a new item. Event payloads reference local row ids rather
  than raw provider URLs.
- Naver Finance/Search news inputs canonicalize Naver article URL variants
  before local dedupe, so the same article surfaced through iframe/search URLs
  does not re-enter the agent queue as a fresh event.
- Naver news identity now also includes a conservative same-day title cluster
  key after stripping common headline labels and punctuation. This prevents
  search/feed title variants of the same article from producing duplicate
  `news_detected` alerts without treating a later-day reused headline as the
  same event.
- Naver Search results are now cached only when the normalized title or
  description mentions the requested ticker or stock name. This keeps broad
  provider search noise from becoming false `news_detected` events.
- A Toss asset-section news parser now mirrors the observed
  `HEADLINE_NEWS` / `PERSONAL_NEWS` / `NEWS` card shape from the
  `asset/sections/all` authenticated surface. The read-only client is session
  gated and fails closed without a Toss session; the parser only emits local
  `toss-asset-news` candidates when the title or related-stock metadata matches
  the requested ticker/name. Raw `newsId`, image URLs, and related-stock payload
  fields stay out of the normalized output.
- The background agent event monitor now wires that client through a no-session
  adapter: clean/no-login runs return no Toss-news candidates and make no Toss
  network call, while a captured Toss session lets matching Toss news become
  sanitized `news_detected` queue events with a hashed dedupe key and no raw
  provider payload reference.
- Agent monitor status now exposes Naver news, Toss asset news, Toss signal,
  and DART as separate provider states. Toss asset news is reported as
  `session-gated`, which means the monitor can ask for it but the app adapter
  returns no candidates and makes no Toss request until a Toss session exists.
- Manual monitor tick results also keep Naver news and Toss asset news refresh
  counts separate (`refreshedNews` vs `refreshedTossNews`), so provider
  freshness/latency can be reasoned about without merging the two surfaces.
- DART disclosure event dedupe now uses canonical receipt-number identity
  keys in both the stock disclosure refresh route and the background agent
  event monitor. Query-string variants of the same `rcpNo` no longer create
  duplicate `disclosure_detected` events.
- Public agent event delivery now uses a sanitized DTO for both
  `/agent/events` and SSE `agent-event` frames. Internal provider `dedupeKey`
  stays inside the server queue/store, while consumers receive `freshnessMs`
  plus a coarse `freshness` bucket (`unknown`, `near_realtime`, `recent`,
  `stale`) for policy/UI decisions.
- The bounded agent event monitor now has an optional Toss signal provider
  contract. When a vetted Toss signal collector is wired later, new signal
  cards can enter the same queue as sanitized `toss_signal_detected` events
  with no raw provider payload or provider id exposed through `payloadRef`.
- A read-only Toss signal client adapter now exists for that future collector.
  It targets the catalogued `/api/v2/dashboard/wts/overview/signals` endpoint,
  but it fails closed until the request body contract is supplied from a
  verified DevTools capture. Its parser hashes raw card ids into local stable
  ids and returns only ticker/source/title/publishedAt/firstSeenAt/relevance/
  confidence fields, so provider ids and raw cards do not become agent-facing
  payloads. The app wires this provider into the monitor only when
  `ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE` is configured; otherwise Toss
  signal monitoring stays disconnected and makes no external signal calls.
- The Toss signal request-body template parser rejects captured templates that
  include sensitive session/account/order fields such as cookie/session tokens,
  browser/device identifiers, account numbers, order numbers, or authorization
  material. This keeps DevTools-assisted signal capture from accidentally
  turning raw Toss identity material into local config.
- The agent monitor also hashes Toss signal item ids again when building queue
  dedupe keys. This keeps `GET /agent/events` and app SSE notifications safe
  even if a future provider accidentally passes through a raw signal card id.
- The agent monitor status now exposes a sanitized Toss signal contract snapshot:
  endpoint host/path/method, `capture_required` vs `configured`, whether
  external signal calls are enabled, and `rawTemplateExposed=false`. This gives
  the UI and operators a clear "capture pending" state without exposing the
  request body template, raw Toss response, session material, or provider card
  ids.
- The agent monitor status now also exposes provider-specific runtime
  observations for Naver news, Toss asset news, Toss signals, and DART
  disclosures. Each provider observation records only attempted time,
  coarse outcome, refresh duration, inserted event count, and sanitized error
  code. This keeps latency/freshness visible per provider without exposing raw
  upstream payloads, URLs, session material, or provider identifiers.
- The Toss signal contract also exposes sanitized capture guidance. While the
  body contract is missing, UI/API can say user-assisted Toss login plus
  DevTools capture is required, but the raw request body template remains local
  and hidden from status output.
- `scripts/internal/probes/probe-toss-signal-smoke.mts` is the matching
  sanitized verifier for that future capture. Without
  `ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE`, it exits with
  `template_required` and makes no Toss signal request. With a vetted template,
  it calls the signal client and prints count/contract metadata only.
- `scripts/internal/probes/probe-toss-signal-template-candidate.mts` validates
  a DevTools-captured body candidate before any signal calls are enabled. It
  accepts the candidate through `ARAON_TOSS_SIGNAL_REQUEST_BODY_CANDIDATE`,
  rejects sensitive fields, replaces the selected stock values with
  `{{productCode}}`, `{{ticker}}`, and `{{name}}`, and writes the sanitized
  template only when an explicit output path is provided. It makes no Toss
  request and prints only placeholder/count metadata.
- `scripts/internal/probes/probe-toss-signal-capture.mts` is the safer
  browser-assisted capture path for the same contract. It requires an
  already-captured Toss session, opens an isolated Chrome profile, installs the
  saved session into that profile, observes only the Toss overview signals POST
  request, cycles through stock detail route variants, performs bounded
  scroll/tab/button interactions, converts the captured body into the same
  placeholder template, and prints only metadata. If no session exists, it exits
  with `session_required` before opening Chrome. If the endpoint is not
  observed during the bounded window, it exits with `capture_not_observed`
  instead of fabricating a template. The report also includes
  `targetRouteTemplate`, `endpointPath`, `captureMode`, and a sanitized
  `nextAction` so the next manual step is explicit without printing raw browser
  or Toss request material.
- The first read-only agent event surface is `GET /agent/events`.
- Newly inserted agent events are also fanned out over app `/events` as
  sanitized `agent-event` SSE frames, omitting provider dedupe keys and raw
  payloads. The browser hook maps those frames into the existing toast stack
  and also dispatches a browser-local `araon:agent-event` event so the
  dashboard agent event rail can prepend the sanitized event immediately
  instead of waiting for its next bounded polling refresh.
- Agent events are now also written to a local SQLite audit table
  (`agent_events`) and restored into the bounded in-memory queue on startup.
  The table stores only the normalized agent contract fields: type, ticker,
  source, publishedAt, firstSeenAt, freshnessMs, relevance, confidence, reason,
  dedupeKey, payloadRef, and createdAt. It does not store raw provider
  responses, URLs, session material, account identifiers, order identifiers, or
  raw tick frames.
- The settings connection tab now includes a read-only agent event feed backed
  by `GET /agent/events`, showing event type, ticker, source, reason,
  first_seen, and freshness while intentionally hiding provider dedupe keys and
  raw payload material.
- The main dashboard now includes a compact read-only Toss account rail in the
  existing watchlist-side rail stack. It first checks local Toss session status;
  when no Toss session is ready it shows an honest login-required empty state
  without fetching authenticated account surfaces. When a session is ready it
  summarizes total asset amount, profit, orderable KRW cash, position count,
  pending order count, completed order count, recent transaction count, and
  Toss watchlist count from sanitized Toss account/portfolio/order/
  transaction/watchlist APIs without exposing raw account, order, transaction,
  or watchlist refs.
- The dashboard rail's session gate is covered by
  `src/client/lib/toss-account-rail.ts`: focused tests assert that logged-out
  or unready Toss states do not call account summary, portfolio, pending order,
  or watchlist fetchers, preserving the clean no-session boundary on the client
  side.
- Sanitized `toss-refresh-result` SSE frames now dispatch a browser-local
  `araon:toss-refresh-result` event. The dashboard listens for successful
  account-summary, portfolio-position, pending-order, and completed-order
  refresh results and reloads the session-gated Toss account rail; quote-only
  or failed/throttled/in-flight results do not trigger account reads.
- The main dashboard now also includes a compact read-only KIS realtime rail in
  the existing watchlist-side rail stack. It polls the sanitized
  `GET /runtime/realtime/kis-ws-slots` preview, passes the currently focused
  ticker as a current-view hint, and shows capacity, fallback count, cooldown,
  ticker, state, source, and reason without exposing KIS credentials, profile
  identifiers, approval keys, account numbers, or raw runtime frames.
- `GET /runtime/data-health` now separates KIS legacy REST from the optional
  KIS realtime rail. The legacy REST surface is explicitly `optional_fallback`,
  not account/order or live-trading truth, and exposes foreground quote,
  watchlist polling, daily chart, minute chart, master metadata refresh, and
  KIS watchlist import as individual `off`/`available`/`suppressed` surfaces
  with a Toss/local primary provider. Clean no-credential startup reports those
  surfaces as off and `externalCallsWithoutCredentials=false`.
- The chart empty state and candle source status no longer imply that provider-
  neutral backfilled candles came from KIS. Unknown-source backfills render as
  automatic chart backfill, while explicit Toss/KIS source mixes still name the
  actual provider.
- Live UI notification attempts for newly inserted agent events are now written
  to a local SQLite audit table (`agent_event_alert_deliveries`) and exposed via
  `GET /agent/event-alert-deliveries`. The current channel is `browser-sse` /
  `local-ui`; records keep event id/type, ticker, status, client count, reason,
  `dispatchLatencyMs`, and createdAt only, so provider raw payloads and session
  material are not copied into notification audit.
- The settings connection tab displays the same alert delivery audit next to
  the agent event feed, preserving the initial browser toast path while leaving
  a clean place for future Telegram, desktop, or browser notification channels.
- The main dashboard also shows a compact read-only Agent events rail under
  the watchlist column. It refreshes only the local agent queue snapshot and
  does not create new upstream Toss/KIS/Naver/DART calls.
- A bounded agent event monitor foundation is implemented behind an explicit
  opt-in gate. `GET /agent/event-monitor/status` exposes its disabled/running
  state and watch scope with candidate source/reason metadata, while
  `POST /agent/event-monitor/tick` reports provider refresh counts separately
  for news, Toss signals, and disclosures.
  `POST /agent/event-monitor/tick` runs a manual cycle. Automatic polling stays
  disabled by default unless
  `ARAON_AGENT_EVENT_MONITOR_ENABLED=1` is set, so clean installs do not begin
  external news or disclosure calls.
- `POST /agent/event-monitor/start` and `POST /agent/event-monitor/stop` now
  provide the explicit runtime control surface for the same opt-in monitor.
  The settings connection tab exposes matching "자동 시작" / "자동 정지" controls,
  but those controls remain inert unless the monitor was enabled by policy.
  Route failures return only `AGENT_EVENT_MONITOR_CONTROL_FAILED`, so raw
  provider/session/account details do not cross into API or UI responses.
- The monitor watch scope remains bounded, but it now promotes fresh local
  agent-event tickers ahead of generic tracked-stock fallback. This lets a
  market movement, Toss signal, news, or disclosure event pull its ticker into
  the next news/disclosure/signal refresh cycle without starting full-market
  polling.
- Watch scope sources are configurable with
  `ARAON_AGENT_EVENT_MONITOR_WATCH_SOURCES` using the safe source ids
  `favorite`, `agent_event`, and `tracked`. The default preserves
  `favorite,agent_event,tracked`; omitting `tracked` keeps the monitor from
  falling back to every locally tracked stock. There is intentionally no
  full-market watch source.
- The monitor now has a per-provider/per-ticker refresh cooldown. Rapid manual
  ticks or short automatic intervals skip provider calls that are still inside
  the guard window and expose the skipped count through status/result payloads,
  so UI operators can see rate protection without raw upstream details. The
  default guard is 10 seconds and can be raised with
  `ARAON_AGENT_EVENT_MONITOR_PROVIDER_COOLDOWN_MS` when a provider needs a
  wider safety margin.
- Provider failures are also sanitized at the monitor and route boundary.
  `lastErrorCode` is reduced to a known generic provider code, and
  `POST /agent/event-monitor/tick` returns a safe failed result instead of
  letting raw Toss/Naver/DART error text reach API or UI responses.
- Agent event read surfaces now catch snapshot/status failures explicitly.
  `GET /agent/events`, `GET /agent/event-alert-deliveries`, and
  `GET /agent/event-monitor/status` return generic failure envelopes when
  their local queue/store/monitor throws, and failed manual ticks fall back to
  `AGENT_EVENT_MONITOR_TICK_FAILED` even if status lookup also fails.
- The monitor status now exposes an explicit dispatch/provider policy surface:
  `dispatchPolicy` marks the target as best-effort delivery after Araon
  `firstSeenAt` with a 10-30 second window, while
  `providerPublicationGuarantee=false` prevents claiming that upstream Naver,
  DART, or Toss itself published within that window. `providerPolicies` expose
  provider enabled state, cooldown, and freshness semantics for Naver news,
  Toss asset news, Toss signals, and disclosures. The settings UI renders this
  policy and manual tick result by provider surface without showing provider
  raw payloads.
- A sanitized agent event monitor smoke probe now exists at
  `scripts/internal/probes/probe-agent-event-monitor-smoke.mts`. By default it
  reads only monitor status and reports provider state, provider observations,
  watch-source policy, watched/candidate counts, and the Toss signal capture
  contract. It does not print watched ticker lists, candidate names, candidate
  reasons, raw provider errors, session data, or account/order identifiers.
  `--run-tick` is an explicit opt-in because it can call configured external
  providers when the monitor is enabled.
- A later status-only smoke against the running local server confirmed the
  default opt-in boundary: the monitor reported `enabled=false`,
  `running=false`, watch sources limited to favorite, agent event, and tracked
  stocks, max 5 tickers per cycle, and `fullMarketPolling=false`. An explicit
  `--run-tick` while disabled returned `state=disabled`,
  `externalCallsMayRun=false`, zero provider refreshes, and zero inserted
  events. Toss signals remained fail-closed with capture required and external
  signal calls disabled.
- A local first_seen alert-delivery smoke probe now exists at
  `scripts/internal/probes/probe-agent-event-alert-delivery-smoke.mts`. It
  starts an isolated temporary Araon server, blocks unexpected external fetches,
  creates one local signal-derived agent event, confirms no immediate delivery
  audit row, then waits for the 10s delay and checks the local delivery audit
  against the 30s target. The probe prints only count/status/latency fields and
  reported `unexpectedExternalFetchCount=0` in the latest run.
- KIS WS ticks that pass the guarded `RealtimeBridge` apply path now normalize
  into throttled `market_movement_detected` agent events through
  `src/server/agent/market-movement-agent-event.ts`. The event uses a
  per-source/ticker/minute dedupe key, skips snapshot and non-KR prices, records
  exchange trade time as `publishedAt` when available, and avoids storing raw
  price values in the public reason/payload surface.
- Toss TOP100 refreshes now also have a conservative market-movement event
  path. `MarketTopMoversService` emits only newly entered TOP100 rotation
  samples after an existing cache is present, so the first ranking load does not
  flood the user. The app wires those KR rotation entries into
  `market_movement_detected` with `source=toss-top100-rotation`, using the
  provider timestamp, rank reason, relevance score, and no raw price payload.
- The TOP100 tab now keeps the user-facing surface useful when the current
  market phase makes `/market/top-movers` unavailable. In that case Araon
  attempts the separate Toss public realtime popularity ranking and renders the
  existing `TossRealtimeRankingBoard` only when it has provider rows. This keeps
  the UI Toss-first without pretending that local/watchlist rows are an
  official whole-market TOP100.
- The first order-intent safety surface is implemented as local-only endpoints:
  `POST /agent/order-intents/preview` creates simulated or paper previews with
  live execution locked, `GET /agent/order-intents` lists persisted previews,
  and `GET /agent/order-intents/audit` exposes the persisted audit trail. Live
  mode requests return a locked response and record a blocked audit entry.
- Order-intent preview reasons are treated as a public operator surface. They
  now redact Toss/KIS/session/account/order-like token patterns before preview
  storage or UI exposure, and optional identifiers reject sensitive-looking
  values before truncation so long raw inputs cannot slip through by prefix.
- Order-intent mutation route errors also pass through a small sanitized
  boundary. Expected local validation messages stay visible, while unexpected
  service/store failures that mention Toss/KIS/session/account/order-like
  fields return a generic invalid-request message instead of echoing the raw
  exception.
- Order-intent read-only snapshot routes now also catch service/store failures
  explicitly. Preview, audit, approval-challenge, and live-policy snapshots
  return generic `order_intent_snapshot_failed` responses rather than relying
  on Fastify's default error serializer, which can echo raw exception text.
- The first fresh approval / confirm-token gate is also local-only:
  `POST /agent/order-intents/:intentId/approval-challenge` creates a short-lived
  confirmation challenge such as `CONFIRM 005930 BUY LIVE`,
  `POST /agent/order-intents/approval-challenges/:challengeId/confirm` verifies
  that text, and `GET /agent/order-intents/approval-challenges` lists the
  persisted challenge state. A successful confirmation records
  `confirm_token_verified_live_locked`; it still returns
  `liveExecutionLocked: true` and does not create any live Toss/KIS order path.
- `GET /agent/order-intents/live-policy` now exposes the default local live
  policy snapshot. It is intentionally disabled: `liveExecutionEnabled=false`,
  `policyApproved=false`, `killSwitch=engaged`, and every production constraint
  remains listed as missing until the user separately approves ticker,
  amount, loss limit, trading-hours, order-type, cooldown, and kill-switch
  release policy. The settings UI renders this as `policy 없음 · kill switch
  on` and `필수 정책 8개 미승인`.
- The main dashboard now includes a compact Order safety rail under the
  watchlist/agent-events column. It reads only the local order-intent preview
  and audit snapshots, keeps live execution visibly locked, and does not expose
  intent ids, audit refs, agent ids, or trigger event ids.
- The same main dashboard rail now also surfaces the local live policy and
  fresh approval challenge status in compact form. It shows the kill switch and
  missing policy constraint count plus a coarse approval state, while still
  hiding challenge ids, confirmation text, operator ids, and audit refs.
- The frontend API client now exposes a thin
  `createAgentOrderIntentPreview` helper for the local preview endpoint, so
  future agent/UI flows can create simulated or paper previews without adding a
  live execution path.
- Agent event rows can now start an explicit simulated buy preview from the UI.
  The mapping carries ticker, event id, event type/source/reason, and simulated
  mode only; it does not invent cash amount, quantity, or a live execution path.

### Toss Public and Authenticated Data

Reference endpoints and commands cover the target product surface:

- public quote/search/chart via Toss web APIs
- TOP100 and realtime ranking surfaces
- account list and account summary
- portfolio positions and allocation
- pending and completed orders
- order detail
- watchlist surface, though standalone endpoints may need more discovery
- transaction ledger and cash overview

Araon already has a strong public-data phase in
`docs/research/toss-first-provider-migration.md` and `src/server/toss/*`.
Authenticated account, cash overview, portfolio positions, pending orders,
completed orders, transaction ledger, and watchlist now have first read-only
Araon surfaces. Order detail now has a conservative first pass through
`GET /toss/orders/:ref`: it only accepts the sanitized list-derived refs already
returned by pending/completed order lists, re-queries those lists, and returns a
sanitized detail payload without raw Toss order identifiers.
- Toss SSE-triggered REST refresh outcomes now have a bounded sanitized and
  durable UI polling surface at `GET /toss/realtime/refresh-results`. They are
  persisted in `toss_sse_refresh_results` via migration 016 and record resource,
  ticker, source type, result, timestamps, and sanitized error text only; they
  do not store raw SSE keys, session material, account identifiers, or raw
  provider responses. The same sanitized result is also fanned out over the
  app-level `/events` stream as `toss-refresh-result` for future immediate
  operator UI updates.

### Toss Trading Safety

The reference CLI requires preview, policy gates, live-action kill switch,
temporary permission, explicit execute flag, and confirm token before live
mutations. Araon should import the safety model, not the CLI UX literally.

Araon agent work must stop at:

- read-only analysis
- paper or simulated order
- gated order intent
- order preview

Live order placement, cancel, amend, or account mutation must stop at a fresh
approval gate until the user explicitly approves a live policy with symbol,
amount, loss limit, time window, order type, cooldown, and kill switch.

## Current Araon Foundation

Araon already contains useful pieces:

- Toss public provider: `src/server/toss/toss-public-market-data-provider.ts`
- Toss public quote polling: `src/server/toss/toss-quote-polling-service.ts`
- Toss chart clients: `src/server/toss/toss-daily-chart.ts`,
  `src/server/toss/toss-minute-chart.ts`
- Toss login/session/SSE foundation under `src/server/toss/`
- KIS realtime bridge and tier manager under `src/server/realtime/`
- KIS hard cap in `src/shared/kis-constraints.ts`
- Naver news service in `src/server/news/news-feed-service.ts`
- OpenDART disclosure service in
  `src/server/disclosures/dart-disclosure-service.ts`
- signal/news/disclosure persistence in migrations 006, 007, 008, 011, and 013
- app-level SSE contracts in `src/shared/types.ts`

The missing platform pieces are:

- deeper authenticated account/order drilldowns beyond the sanitized order ref
  lookup
- final production approval policy for enabling autonomous 10-30 second
  news/disclosure/signal polling in always-on operation. The current monitor
  exposes safe scope, cooldown, first_seen dispatch, and provider freshness
  policy in API/UI, but automatic polling still requires explicit opt-in env
  configuration.
- unified Toss signal collection beyond the current readiness/status surface and
  optional template-driven adapter
- user-approved production live-trading policy. The local policy snapshot now
  explicitly keeps all live constraints missing and the kill switch engaged;
  no live execution path exists until a separate approval process is designed
  and authorized.

## KIS WS Smart Slot Allocator

KIS WS is valuable because Toss does not expose a KIS-style realtime price tick
WebSocket in current evidence. KIS should therefore be used as a low-latency
market pulse, not as the account or order source of truth.

### Inputs

The allocator should build candidates from:

1. Toss portfolio holdings
2. user-pinned realtime tickers
3. currently focused stock detail or chart ticker
4. recent news, disclosure, or Toss signal tickers
5. agent watch or order-intent candidates
6. manual watchlist/favorites
7. TOP100 or momentum rotation sample

### Candidate Contract

Each candidate should be normalized before scoring:

```ts
interface RealtimeSlotCandidate {
  ticker: string;
  source:
    | 'toss-holding'
    | 'user-pin'
    | 'current-view'
    | 'news'
    | 'disclosure'
    | 'toss-signal'
    | 'agent-watch'
    | 'manual-watchlist'
    | 'top100-rotation';
  score: number;
  reason: string;
  ttlMs: number | null;
  lastSeenAt: string;
  pinned: boolean;
}
```

### Initial Scoring

Start with a simple deterministic score model:

| Source | Base score |
| --- | ---: |
| Toss holding | 1000 |
| user pin | 900 |
| current view | 700 |
| recent news/disclosure/Toss signal | 600 |
| agent watch/order-intent candidate | 550 |
| manual watchlist | 400 |
| TOP100/momentum rotation sample | 100-300 |

Apply modifiers:

- recency decay for news, disclosures, signals, and current view
- stickiness bonus for currently subscribed tickers until minimum residency ends
- churn penalty for recently evicted tickers
- market-phase guard for pre-market, regular, after-hours, and closed states
- pinned tickers should not be evicted except by user action or hard invalidity

### Allocation

For a single KIS profile:

1. Build and dedupe candidates by ticker.
2. Score candidates.
3. Sort by pinned, score, source priority, lastSeenAt, ticker.
4. Select at most `WS_MAX_SUBSCRIPTIONS`.
5. Emit `subscribe` and `unsubscribe` diffs against the current active set.
6. Send only the diff to `RealtimeBridge.applyDiff`.
7. Send excluded tickers to Toss REST refresh, polling, or event-waiting lanes.

For future multi-profile expansion, reuse
`src/server/realtime/realtime-session-pool.ts` as a planning layer, but do not
claim more than one live profile is verified until policy-compliant observation
exists.

Initial allocator implementation lives in
`src/server/realtime/kis-ws-slot-allocator.ts`. It currently covers source
priority, ticker dedupe, per-profile cap enforcement, subscribe/unsubscribe
diffs, and churn-cooldown sticky retention. Runtime bridge wiring is now split
between an explicit session enable path and an active-session rebalance path:
`POST /runtime/realtime/session-enable` opens the bounded KIS WS session, while
`src/server/realtime/kis-ws-slot-session-rebalancer.ts` can re-plan an already
enabled session without resetting its expiry or tick-count safety bounds.

The first sanitized preview API is
`GET /runtime/realtime/kis-ws-slots`. It is available without KIS credentials
and currently builds candidates from cached Toss KR holdings, the current
screen ticker, recent news/disclosure/Toss-signal agent events, order-intent
previews, manual watchlist pins, and TOP100 rotation samples before applying
the same allocator rules as the write path. It does not open or mutate the KIS
WS bridge.
The preview route also has an explicit sanitized failure boundary: if any local
source snapshot or allocator input fails, it returns
`KIS_WS_SLOTS_PREVIEW_FAILED` instead of Fastify's raw error body, so Toss
session/account material and KIS approval/account details cannot leak into the
UI rail.
Because the rail is Korean-equity KIS WS only, candidate building filters
manual watchlist/favorite inputs to normalized KR tickers before planning.
US or otherwise non-KR symbols stay on the Toss REST/event lane instead of
breaking the KIS slot allocator.
Agent order-intent previews are also TTL-bound slot hints: expired previews or
invalid expiry timestamps are dropped before planning, so stale agent ideas do
not occupy low-latency WS capacity.
`POST /runtime/realtime/session-enable` now uses the same safety boundary while
building the allocator plan. If a local slot source fails before the KIS bridge
connects, the route returns a generic `REALTIME_SESSION_ENABLE_FAILED` response,
does not open or diff the WebSocket session, and does not expose raw Toss/KIS
source error text.
When a new agent event is inserted, Araon schedules a KIS WS slot rebalance only
if a session-scoped realtime gate is already enabled. The rebalance applies only
the subscribe/unsubscribe diff, updates the session ticker allowlist, preserves
the original session expiry and safety counters, and skips entirely when KIS
realtime is disabled. This makes recent news/disclosure/Toss-signal candidates
eligible for low-latency KIS slots without silently turning on KIS.

### UI and Status

Expose a sanitized status payload:

```ts
interface RealtimeSlotAllocatorStatus {
  enabled: boolean;
  provider: 'kis';
  perProfileCap: number;
  activeCount: number;
  fallbackCount: number;
  churnCooldownMs: number;
  diff: {
    subscribe: string[];
    unsubscribe: string[];
  };
  candidates: Array<{
    ticker: string;
    state: 'subscribed' | 'fallback' | 'pinned';
    source: string;
    reason: string;
    score: number;
    ttlMs: number | null;
  }>;
}
```

The UI should make capacity and reasons visible, for example:

- `KIS WS 32/40 active`
- `005930 subscribed: current view`
- `042660 subscribed: news detected`
- `329180 fallback: slot capacity`

No raw KIS frame, token, approval key, profile identifier, account number, or
upstream body should be included.

## News, Disclosure, Signal, and Agent Event Model

Araon should normalize provider data into event records that separate provider
publication time from Araon detection time.

```ts
type AgentEventType =
  | 'news_detected'
  | 'disclosure_detected'
  | 'toss_signal_detected'
  | 'market_movement_detected';

interface AgentEvent {
  id: string;
  type: AgentEventType;
  ticker: string;
  source: string;
  publishedAt: string | null;
  firstSeenAt: string;
  freshnessMs: number | null;
  relevance: number | null;
  confidence: number;
  reason: string;
  dedupeKey: string;
  payloadRef: string | null;
  createdAt: string;
}

interface AgentEventAlertDelivery {
  eventId: string;
  eventType: AgentEventType;
  ticker: string;
  channel: 'browser-sse';
  target: 'local-ui';
  status: 'dispatched' | 'skipped_no_client';
  clientCount: number;
  dispatchLatencyMs: number;
  reason: string;
  createdAt: string;
}
```

Provider latency must be reported honestly:

- `publishedAt`: what the provider claims, when available
- `firstSeenAt`: when Araon first observed it
- `freshnessMs`: difference between those timestamps when both exist
- no claim that the provider itself publishes within 10-30 seconds
- the product goal is dispatch within 10-30 seconds after Araon first sees the
  item
- `dispatchLatencyMs`: local alert audit delta from `firstSeenAt` to the UI/SSE
  delivery attempt

Deduplication should consider canonical URL, provider item id, title hash,
ticker, publishedAt bucket, and source cluster hints. Ticker matching should
prefer explicit provider stock codes and fall back to guarded name/symbol
matching only with confidence labels.

## Milestones

1. Preserve current dirty TOP100 changes and document the existing state.
2. Add Toss session extension and expiration status parity.
3. Add Toss authenticated read clients for account, portfolio, orders,
   transactions, and cash overview.
4. Add typed Toss SSE refresh router.
5. Add KIS WS smart slot allocator as a pure module with tests.
6. Wire allocator into the existing KIS realtime bridge without changing the
   bridge safety model.
7. Add normalized news/disclosure/Toss-signal event persistence.
8. Add agent event queue and app-level SSE UI notification delivery.
9. Add local audit log surfaces for agent events and order-intent decisions.
10. Add persisted order-intent/audit records and keep live execution disabled.
11. Revisit legacy KIS REST/polling/chart/master/import and either remove,
    isolate, or document them as inactive fallback.
12. Update README, install docs, and runbooks.

## Verification

For every implementation milestone:

- focused unit tests for new pure logic and route contracts
- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

For package or release changes:

- `npm pack --dry-run --json`

For security-sensitive changes:

- tracked-file secret grep covering Toss session/cookies/storage/account/order
  identifiers and KIS secrets/tokens/raw frames

Clean no-credentials startup must not make unexpected external Toss, KIS,
Naver, or OpenDART calls.

### Local E2E Notes

- A local Toss QR login capture smoke reached `waiting_for_qr` and then failed
  closed after the timeout because no persistent session was captured. The
  sanitized status exposed only lifecycle state, cookie/storage counts, and
  missing-count diagnostics.
- The settings UI now starts QR login capture with an explicit ten-minute
  timeout, matching the server-side maximum, so user-assisted QR approval has a
  practical window while still failing closed if no persistent session appears.
- The same settings surface renders sanitized login diagnostics such as
  lifecycle message, cookie/storage counts, and missing-count totals. It does
  not expose cookie names, storage keys, or session values.
- Vite dev proxy now forwards `/agent/*` to the Fastify backend. Without this,
  the settings connection tab received SPA HTML for agent event and order-intent
  API calls, which hid the Toss/KIS realtime controls behind a generic load
  error during local UI verification.
- The dashboard Toss account rail was browser-checked at
  `http://127.0.0.1:5173/` in a no-session state. It rendered as
  `Toss account / read-only / 토스 로그인 필요 / 계좌 데이터 없음` inside the
  existing Araon rail stack, with no invented account numbers or synthetic
  portfolio values.
- With no Toss session persisted, authenticated read routes returned
  `TOSS_SESSION_REQUIRED` and Toss realtime stayed `idle`, which preserves the
  Toss-first no-credential startup boundary until a user-assisted QR login can
  complete.
- A sanitized internal authenticated-read smoke harness now exists at
  `scripts/internal/probes/probe-toss-authenticated-read-smoke.mts`. With an
  empty `ARAON_DATA_DIR`, it returns `session_required` and skips account,
  summary, portfolio, orders, transactions, watchlist, and Toss asset-news
  surfaces without making Toss authenticated network calls. After QR login, the
  same harness should be used for count/status-only validation.
- A matching sanitized Toss SSE smoke harness exists at
  `scripts/internal/probes/probe-toss-realtime-sse-smoke.mts`. It should be run
  after QR login to observe bounded SSE counter/status metadata only, confirming
  the EventSource path without printing raw stream frames or session material.
- A complementary app-level route smoke harness exists at
  `scripts/internal/probes/probe-toss-realtime-route-smoke.mts`. It observes
  the running Araon server's `/toss/realtime/status` plus
  `/toss/realtime/refresh-results`, and reports whether a real SSE hint
  produced a durable REST refresh audit row. Output is limited to counters,
  resource/result names, and ticker presence.
- A real user-assisted Toss acceptance run completed with:
  `npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --login-timeout-ms=600000 --sse-duration-ms=30000`.
  The first browser load stalled before showing the QR code, but a user refresh
  revealed the QR page and approval completed successfully. The combined probe
  then returned sanitized `ok` outcomes for QR login, account list, account
  summary/cash overview, portfolio positions, pending orders, completed orders,
  KR transactions, KR/US transaction overview, watchlist, and Toss asset news.
  The bounded SSE stage connected successfully and reported
  `thinNotificationOnly=true`; no SSE event arrived during the 30s observation,
  so real event-to-refresh audit evidence remains opportunistic.
- A persistent-session UI smoke was run at `http://127.0.0.1:5173/` against the
  local Fastify server. The dashboard rendered the Toss account rail, KIS
  realtime rail, agent events rail, and order safety rail with the existing
  Araon component tone. The settings connection tab initially showed its normal
  loading state, then settled into a ready Toss session state with enabled SSE
  and session controls. A read-only account surface refresh populated the
  portfolio/order/transaction surfaces without live order mutation. Browser
  console errors/warnings were empty, and DOM snapshots did not show raw
  session, KIS secret, account, order, browser-session, or device identifiers.
- `README.md` and `INSTALL.md` now describe the product as Toss-first rather
  than KIS-required. Toss public market data is documented as the default path,
  Toss QR login as the read-only account-aware path, Toss realtime as SSE thin
  notification plus REST refresh, and KIS as an optional capped realtime rail.
- The install acceptance runbook, NXT WebSocket rollout runbook, and KIS
  OpenAPI setup guides now carry the same role boundary: KIS material is
  optional realtime-rail or historical validation guidance, not the default
  onboarding path.
- Legacy KIS master auto refresh is now disabled by default. App boot and the
  post-credential hook only queue KIS master refresh when
  `ARAON_KIS_MASTER_AUTO_REFRESH=1` is set; otherwise KIS master refresh remains
  an explicit manual maintenance path.
- Legacy KIS chart fallback is now disabled by default. Toss c-chart remains the
  primary daily/minute chart backfill path, and KIS chart fallback only runs
  when `ARAON_KIS_CHART_FALLBACK_ENABLED=1` is explicitly set.
- Legacy KIS foreground quote fallback is now disabled by default. Toss quote
  refresh remains the foreground source, and KIS quote fallback only runs when
  `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1` is explicitly set.
- Legacy KIS watchlist polling fallback is now disabled by default. KIS REST
  polling only runs when `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` is explicitly
  set and Toss quote polling is disabled or repeatedly failing.
- The current KIS footprint is inventoried in
  `docs/research/kis-legacy-role-inventory.md`. The current conclusion is that
  the KIS WS allocator path is aligned with the optional low-latency rail, while
  KIS watchlist import is now labelled as an optional migration helper and KIS
  watchlist failure logs/responses use sanitized diagnostics rather than raw
  upstream error objects or payloads. The remaining KIS REST fallback surfaces
  are opt-in legacy fallback plumbing.

## Completion Definition

The prompt-to-artifact audit lives in
`docs/research/toss-primary-agent-platform-completion-audit.md`. Treat that
file as the current evidence map before any goal completion claim.

The machine-checkable gate IDs in that audit are the current authority for
remaining work:

- `GATE-TOSS-SSE-REFRESH`
- `GATE-TOSS-SIGNAL-CAPTURE`
- `GATE-PROVIDER-LATENCY`
- `GATE-MARKET-PHASE-TOP100`
- `GATE-FRONTEND-FINAL-SMOKE`
- `GATE-CLEAN-NO-CREDS`
- `GATE-FINAL-VERIFY`
- `GATE-TOSSINVEST-READONLY`

This goal is complete only when Araon has:

- Toss-first startup and core UI/API verification
- Toss account, portfolio, watchlist, orders, transactions, and cash overview
- Toss SSE thin-notification refresh mapping
- optional KIS WS smart slot allocator with profile cap enforcement
- news/disclosure/Toss signal alert dispatch
- agent event queue
- order-intent, preview, permission, confirm, and audit foundation
- legacy KIS heavy REST/polling/chart/master/import dependency either removed
  or explicitly isolated outside the default Toss-first path
