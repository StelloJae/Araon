# Araon KIS Multi-Key Realtime and Adaptive Tick Rendering Design

## Goal

Move Araon from a single cap40 realtime path toward a managed multi-profile
runtime while improving perceived chart smoothness and making coverage visible.

## User Decisions

- Keep Araon as a monitoring tool, not a trading tool.
- Add support for the first KIS key during onboarding and additional KIS
  profiles in Settings.
- Use multiple KIS profiles to expand realtime coverage later, but keep
  unverified extra live sessions behind the allocator/status layer first.
- Keep selected-ticker minute backfill scoped. Do not enable full-watchlist or
  automatic historical minute backfill.
- Improve late-day tick rendering by downsampling historical context and keeping
  a detailed live tail.

## Scope

1. Adaptive sparkline/realtime geometry
   - Downsample older intraday price points.
   - Preserve the most recent tail at higher fidelity.
   - Keep endpoint/direction behavior available to the UI.

2. KIS outbound limiter
   - Add a shared REST limiter that can throttle by endpoint class.
   - Preserve existing polling fallback.
   - Surface rate-limit cooldown state without raw credentials.

3. Credential profiles
   - Keep the existing primary credential contract for runtime compatibility.
   - Store additional encrypted profile entries with redacted summaries only.
   - First-run onboarding creates the primary profile; Settings can add more.

4. Realtime session allocation foundation
   - Add a pure allocator that can split candidates across enabled profiles.
   - Do not silently claim extra WebSocket live verification.
   - Runtime status reports current active coverage and planned capacity.

5. Coverage/status UI
   - Show realtime capacity, active subscription count, fallback count, and
     profile count in Settings/status surfaces.

## Non-Goals

- No raw tick permanent storage.
- No full-market backfill.
- No automatic historical minute backfill.
- No npm/GitHub release work in this implementation.
- No live KIS probe as part of tests.

## Verification

- Unit tests for adaptive downsampling, outbound limiter, profile store/routes,
  and realtime allocation.
- Typecheck/build.
- Browser smoke for status UI and hover smoothness when practical.
