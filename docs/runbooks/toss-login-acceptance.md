# Toss Login Acceptance Runbook

Use this runbook when validating Araon's Toss-first authenticated path. The goal
is to prove that a user-assisted Toss login unlocks read-only account surfaces
and SSE thin notifications without exposing session, account, order, or raw
provider payload values.

This runbook does not approve live trading. Order execution, order cancel,
order amend, and account mutation remain locked unless the user gives a fresh
explicit approval and a separate live-trading policy exists.

## Preconditions

- Work from `/Users/stello/korean-stock-follower`.
- Do not edit `/Users/stello/tossinvest-cli`; use it as read-only reference
  only.
- Start from the current working tree. Preserve user/generated uncommitted
  changes.
- Confirm `ARAON_DATA_DIR` points at the intended local test data directory if
  you do not want to use the default app data directory.
- Keep terminal output sanitized. Do not print cookies, storage values, account
  identifiers, order identifiers, or raw Toss responses.

## Step 1: No-Session Safety

Before login, verify the probes do not make authenticated Toss calls when no
session exists:

```bash
rm -rf /tmp/araon-empty-toss-acceptance
ARAON_DATA_DIR=/tmp/araon-empty-toss-acceptance \
  npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts \
    --require-existing-session=true --sse-duration-ms=1000
```

Expected result:

- exit code `2`
- report outcome `login_incomplete`
- login stage outcome `session_required`
- authenticated read and SSE stages are `null`

```bash
rm -rf /tmp/araon-empty-toss-smoke
ARAON_DATA_DIR=/tmp/araon-empty-toss-smoke \
  npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts
```

Expected result:

- exit code `2`
- report outcome `session_required`
- every read surface is `skipped`

Then verify the SSE smoke has the same no-session behavior:

```bash
rm -rf /tmp/araon-empty-toss-realtime-smoke
ARAON_DATA_DIR=/tmp/araon-empty-toss-realtime-smoke \
  npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts --duration-ms=1000
```

Expected result:

- exit code `2`
- report outcome `session_required`
- `realtime.started` is `false`
- `thinNotificationOnly` is `true`

## Step 2: QR Login

Start Araon locally and open Settings → Toss data. Start the Toss QR login
flow, then have the user scan and approve the login in the Toss app.

For the preferred operator-run terminal probe, use:

```bash
npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts \
  --login-timeout-ms=600000 --sse-duration-ms=30000
```

This opens Chrome unless a usable Toss session already exists. It runs the
read-only account smoke and bounded SSE smoke only after login succeeds or an
existing session is present. Do not run it until the user is ready to scan the
QR code.

If you need to verify only an already-captured session without opening Chrome,
add `--require-existing-session=true`.

If you only need to capture or refresh the login session, use the narrower
probe:

```bash
npx tsx scripts/internal/probes/probe-toss-login-capture.mts --timeout-ms=600000
```

Acceptance conditions:

- The login status reaches a completed/persistent session state.
- The login stage exits with outcome `succeeded` or `already_configured`.
- The UI and API expose only session summary metadata such as state,
  persistence, key counts, and expiry timestamps.
- No cookie names, cookie values, localStorage values, sessionStorage values,
  account identifiers, or raw response bodies appear in terminal output, docs,
  logs, UI text, or git diff.

If login times out or the user cannot approve the QR prompt, record the timeout
as a blocker and do not fabricate authenticated results.

## Step 3: Authenticated Read Smoke

The preferred `probe-toss-acceptance-smoke.mts` already runs the read-only
smoke after login. To rerun only the read-only smoke:

```bash
npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts
```

Optional asset-news probe:

```bash
npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts \
  --news-ticker=005930 --news-name=삼성전자
```

Expected result:

- exit code `0` for `ok`, or `1` for partial provider failure worth
  investigating
- only count/status metadata is printed
- account list, account summary, portfolio, pending orders, completed orders,
  transactions, watchlist, and Toss asset news are covered
- no account names, account numbers, order refs, transaction refs, watchlist
  refs, cookies, storage values, or raw provider payloads are printed

If a surface fails, keep the output as a generic surface error. Investigate
using code-level sanitization and targeted tests before adding provider-specific
payload handling.

## Step 4: Toss SSE Smoke

Run a bounded SSE observation:

```bash
npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts --duration-ms=30000
```

Expected result:

- exit code `0` for a clean observation, or `1` for partial/failure worth
  investigating
- report contains counter/status metadata only
- `thinNotificationOnly` remains `true`
- observed events are summarized by type and refresh-hint resource
- no raw SSE frame, raw provider key, cookie, storage value, account identifier,
  or order identifier is printed

If no events arrive during the bounded window, that is not a failure by itself.
Record the session state, duration, and zero counters honestly. Do not claim
event-to-refresh acceptance until at least one supported event type is observed.

When the local Araon server is already running, prefer the app-level route
probe for the final event-to-refresh acceptance window:

```bash
npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts --duration-ms=120000
```

This observes `/toss/realtime/status` and `/toss/realtime/refresh-results`
together, so a successful event window should show `outcome=refresh_observed`
without printing raw SSE frames, account/order identifiers, or ticker values.
The route smoke is delta-based: pre-existing refresh-result rows are ignored,
and only rows/counters newly observed after the smoke starts can close the
event-to-refresh gate. It is also result-aware: only a newly observed
`result=refreshed` row counts as completed REST refresh proof. Newly observed
`ignored` rows are reported as event evidence without refresh proof.

If an existing dev server was started before the latest realtime code changes,
or if KIS credentials in `data/credentials.enc` add noisy optional rail logs,
run the route smoke against an isolated latest-code server. Copy only the local
SQLite state and encrypted Toss session into a temporary data directory; do not
copy KIS credentials:

```bash
tmpdir=$(mktemp -d /tmp/araon-toss-sse-latest-XXXXXX)
sqlite3 data/watchlist.db ".backup '$tmpdir/watchlist.db'"
cp data/toss-session.enc "$tmpdir/toss-session.enc"
ARAON_DATA_DIR="$tmpdir" npx tsx -e "import { startAraonServer } from './src/server/app.ts'; (async () => { const server = await startAraonServer({ host: '127.0.0.1', port: 3001 }); console.log(server.url); process.stdin.resume(); })();"
```

Then run:

```bash
npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts \
  --base-url=http://127.0.0.1:3001 --duration-ms=600000 --start-if-idle=true
```

## Step 5: Toss Signal Smoke

Toss overview signals stay disabled until a vetted request-body template is
provided through `ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE`.

Before capture or without a template, this command must not call Toss:

```bash
npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts \
  --ticker=005930 --name=삼성전자
```

Expected result:

- exit code `2`
- report outcome `template_required`
- `externalCallsEnabled=false`
- `rawTemplateExposed=false`

The preferred capture path is the browser-assisted capture probe below. It
requires an already captured Toss session. If no session exists, it exits with
`session_required` and must not open Chrome or call the signal endpoint.

```bash
npx tsx scripts/internal/probes/probe-toss-signal-capture.mts \
  --ticker=005930 --name=삼성전자 \
  --write-template-file=/tmp/araon-toss-signal-template.json
```

Expected result:

- exit code `0` after a matching signal request body is observed and accepted
- exit code `2` when no session exists or the request is not observed during
  the bounded capture window
- `directSignalRequestEnabled=false`
- `rawCandidateExposed=false`
- `rawTemplateExposed=false`
- `nextAction` explains the safe follow-up, for example
  `manual_stock_page_interaction_required` when the endpoint was not observed
- placeholder counts for `productCode`, `ticker`, and `name`

The probe opens an isolated Chrome profile, installs the saved Toss session
inside that profile, observes only the signals POST request, cycles through
`/stocks/{productCode}` and `/stocks/{productCode}/order`, and performs bounded
scroll/tab/button interactions. If the endpoint does not fire automatically,
interact with the opened stock page until the overview/signal surface loads.
The raw body and raw template must never be printed.

If automatic navigation returns `capture_not_observed`, retry headfully while
the user watches the opened Chrome window:

```bash
npx tsx scripts/internal/probes/probe-toss-signal-capture.mts \
  --ticker=005930 --name=삼성전자 \
  --timeout-ms=120000 \
  --write-template-file=/tmp/araon-toss-signal-template.json
```

During that 120-second window, use only normal Toss UI navigation on the opened
stock page. Open or refresh the stock overview, news, summary, signal, or
"why moved" surfaces until the page asks Toss for overview signals. Do not open
DevTools, copy request bodies, or paste raw Toss data into docs or terminal
output. The probe itself should detect the request and write a sanitized
placeholder template if the captured body is safe.

The automatic headless and headful attempts can still return
`capture_not_observed` even with a persistent session. In that case the next
retry needs human UI interaction in the opened isolated Chrome window. Useful
normal UI actions to try during the probe window:

- refresh the Toss stock page if it stalls on an empty/loading surface
- open the stock overview page for the target ticker
- click or scroll into the stock summary, news, disclosure, signal, AI summary,
  and "why moved" areas
- switch between chart/quote, news/disclosure, stock info, trade status, and
  related non-community stock-detail tabs if they are visible

Do not open Toss community surfaces for this probe. Community text is not part
of the signal capture goal and can be tied to logged-in identity/moderation
context. The capture probe exposes `blockedRoutePathPrefixes=["/community"]`,
blocks matching document requests through CDP when possible, and navigates back
to `/stocks/{productCode}` if the Toss UI still pushes the isolated browser to
a community route.

Stop once the probe exits. If it still reports `capture_not_observed`, keep
Toss signal collection disabled and record the result in the completion audit
under `GATE-TOSS-SIGNAL-CAPTURE`.

After capture, provide only the sanitized JSON body template through
`ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE` and rerun the same smoke probe. The
probe output must remain count/contract metadata only. Do not print the raw
template, raw signal cards, provider ids, cookies, storage values, account
identifiers, or order identifiers.

Expected direct-smoke semantic states:

- `surface.semanticState=non_empty` means the provider returned at least one
  sanitized intelligence item for the sampled ticker/window.
- `surface.semanticState=supported_empty` means the authenticated endpoint was
  reached and the contract is usable, but Toss returned zero intelligence items
  for that ticker/window. This is valid empty-state evidence, not evidence that
  non-empty signal semantics have been observed.

The parser intentionally accepts only sanitized card-like containers from
`signals`, `cards`, `items`, `result.data.intelligences`, and
`sections[].cards`. A zero-item smoke after parser hardening must remain
`supported_empty`; do not synthesize a signal from shape-only or null
intelligence data.

To validate a DevTools-captured body candidate before enabling signal calls, use
the candidate validator. It makes no Toss request and prints only metadata:

```bash
ARAON_TOSS_SIGNAL_REQUEST_BODY_CANDIDATE='<captured-json-body>' \
  npx tsx scripts/internal/probes/probe-toss-signal-template-candidate.mts \
    --ticker=005930 --name=삼성전자 \
    --write-template-file=/tmp/araon-toss-signal-template.json
```

Expected result:

- exit code `0` for a safe candidate, `1` for a rejected candidate, or `2` when
  no candidate is provided
- `externalCallsEnabled=false`
- `rawCandidateExposed=false`
- `rawTemplateExposed=false`
- placeholder counts for `productCode`, `ticker`, and `name`

Only after this validator accepts the candidate should the written template be
reviewed locally and provided through `ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE`.

For the alternate DevTools-observed trading-analysis candidate, use the
shape-only smoke. It requires the persisted Toss session, makes read-only GET
requests against the known `wts-info-api` and `wts-cert-api` hosts by default,
and prints no raw payload/session data:

```bash
npx tsx scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts \
  --tickers=005930,000660,254120
```

For wider sweeps, prefer aggregate-only output:

```bash
npx tsx scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts \
  --tickers=005930,000660,035420,035720,005380,000270,068270,373220,207940,005490 \
  --summary-only
```

To isolate one host during investigation, add `--hosts=info` or
`--hosts=cert`.

Expected result:

- exit code `0` when at least one known host returns HTTP 200 for each sampled
  ticker
- `externalCallsEnabled=true`
- `rawPayloadExposed=false`
- `rawSessionExposed=false`
- default output: only host label, status, key counts, `hasResult`, and
  `resultType`
- `--summary-only` output: aggregate counts only, with `samples=[]`

`resultType=null` is valid evidence that the candidate is reachable but empty
for the sampled ticker/window. It is not evidence that Toss signal semantics
are implemented.

## Step 6: Agent Provider-Mix Smoke

After Toss login and a vetted Toss signal template exist, run the isolated
provider-mix smoke to verify the monitor can reach Naver news, Toss news, Toss
signals, and DART disclosures without mutating the real Araon database.

```bash
npx tsx scripts/internal/probes/probe-agent-event-monitor-provider-mix-smoke.mts \
  --copy-current-toss-session \
  --toss-signal-template-file=/tmp/araon-toss-signal-template.json \
  --toss-signal-endpoint-path=/api/v1/dashboard/intelligences/all
```

Expected result:

- exit code `0`
- `isolatedTempData=true`
- `copiedEncryptedTossSession=true`
- `fullMarketPolling=false`
- `watchedTickerCount=1`
- all four providers are enabled when local env contains the relevant keys and
  a Toss signal template is supplied
- Naver news, Toss news, Toss signal, and DART disclosure observations show
  `lastOutcome=refreshed`
- Toss signal may legitimately report `lastInsertedEvents=0` until Toss returns
  non-empty intelligence cards
- output contains only sanitized count/status/error-code metadata and does not
  print the raw encrypted session, request template, provider payloads, account
  values, cookies, storage values, or watched ticker list

If `--copy-current-toss-session` is omitted, Toss session-gated providers can
fail or stay disabled in the temporary data directory. That is a probe setup
issue, not evidence that the saved normal session is broken.

## Step 7: Market TOP100 Phase Smoke

When a local Araon server is running, use the TOP100 phase smoke to capture the
current Toss-first ranking state without printing ranking rows, tickers, names,
prices, or raw provider payloads:

```bash
npx tsx scripts/internal/probes/probe-market-top100-phase-smoke.mts \
  --market=kr --limit=100
```

For a scheduled supported-window check, let the probe wait only up to a bounded
operator-approved window:

```bash
npx tsx scripts/internal/probes/probe-market-top100-phase-smoke.mts \
  --market=kr --limit=100 \
  --wait-until-fetchable --max-wait-ms=900000
```

The wait guard never prints ranking rows or raw provider payloads. If the next
fetchable window is farther away than `--max-wait-ms`, it skips waiting and
reports `wait.skippedReason=exceeds_max_wait`.

Expected result:

- exit code `0`
- `rawPayloadExposed=false`
- `rawRowsExposed=false`
- `outcome=market_phase_observed` during a supported phase, or
  `outcome=unsupported_or_empty` during a closed/unsupported phase
- `wait.skippedReason` is `already_fetchable`, `disabled`,
  `exceeds_max_wait`, or `null` after a bounded wait
- `/market/top-movers` status, source phase, partial/stop reason, and coverage
  counts are shown without filling from local watchlist data
- `/market/toss/realtime-ranking` status, timestamp freshness, returned count,
  and priced count are shown without row details

Closed/unsupported phase evidence does not close `GATE-MARKET-PHASE-TOP100`.
Re-run this smoke during a supported market window, or use the bounded wait
guard above, and pair it with browser UI inspection before final acceptance.

## Step 8: Post-Smoke Verification

Run the focused and broad checks before accepting the authenticated lane:

```bash
npm test -- \
  src/server/toss/__tests__/toss-authenticated-read-smoke.test.ts \
  src/server/toss/__tests__/toss-realtime-smoke.test.ts \
  src/server/toss/__tests__/toss-realtime-service.test.ts \
  src/server/toss/__tests__/toss-signal-smoke.test.ts
npm run typecheck
npm run build
git diff --check
```

Run a tracked-file secret scan over the touched areas:

```bash
rg -n "(S[E]SSION=|U[T]K=|L[T]K=|F[T]K=|C[o]okie:|a[c]countNo=|a[p]pSecret=|a[p]pKey=|a[p]proval_key=|a[u]thorization: Bearer|r[a]w WS)" \
  src/server src/client src/shared scripts/internal/probes docs
```

Expected result:

- tests/typecheck/build pass
- `git diff --check` passes
- secret scan returns no matches

## Acceptance Record

Record the result in `docs/research/toss-primary-agent-platform-completion-audit.md`.
Include:

- login outcome
- smoke command outcomes
- surfaces that passed or failed
- whether SSE events were observed
- whether any raw value leak was found
- remaining blockers

Use the gate IDs from the completion audit when a result closes or keeps open a
known blocker, especially `GATE-TOSS-SSE-REFRESH` and
`GATE-TOSS-SIGNAL-CAPTURE`.

Do not mark the active goal complete unless the full completion audit covers
Toss startup, UI/API parity, optional KIS WS allocation, news/disclosure/signal
alerting, agent queue, order-intent safety, documentation cleanup, and legacy
KIS isolation.
