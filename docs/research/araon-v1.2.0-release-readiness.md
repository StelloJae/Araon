# Araon v1.2.0 Release Readiness

Date: 2026-05-19
Branch: `codex/araon-release-slices`
Package version: `1.2.0`

## Purpose

This document records the remaining release lane after the product 100 work was
implemented and committed. It is intentionally separate from the product
completion audits: those answer whether the app behavior is ready; this file
answers what must happen before GitHub Release and npm publish.

## Current State

- Product implementation commits are present on `codex/araon-release-slices`.
- Product 100 completion evidence is recorded in
  `docs/research/araon-product-100-12-area-completion-audit.md`.
- Post-commit readiness evidence is recorded in
  `docs/research/araon-post-commit-product-100-readiness-audit.md`.
- Root visual QA screenshots have been archived under
  `docs/archive/visual-qa/2026-05-19-product-100/`.
- `README.md`, `README.ko.md`, `INSTALL.md`, and release notes have been
  updated for the Toss-first v1.2.0 product lane.

## Release Boundary

This lane prepares release materials only. Do not perform any of the following
without an explicit final release instruction:

- `npm publish`
- `gh release create`
- GitHub tag creation
- Live order, order cancel, order amend, account mutation, or live auto-trading

## Required Final Checks Before Public Release

Run these from a clean release checkout after the branch is merged or immediately
before tagging:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm pack --dry-run --json
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
npm run audit:pre-release-product
npx tsx scripts/internal/probes/probe-pre-release-product-100-audit.mts --require-complete
npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts --require-complete
npx tsx scripts/internal/probes/probe-commit-slice-coverage.mts
```

Also perform a tracked-file secret scan before publishing. No raw Toss session,
KIS credential, token, approval key, account number, order identifier, or
watchlist raw payload should appear in tracked files or release notes.

## Recommended Publish Sequence

1. Merge the PR after review.
2. Confirm `package.json` and `package-lock.json` are on `1.2.0`.
3. Rerun the required final checks.
4. Create a signed or annotated Git tag if that is the project convention.
5. Create the GitHub Release for `v1.2.0`.
6. Attach desktop artifacts only after platform-specific packaging checks.
7. Run `npm publish` for `@stellojae/araon@1.2.0`.
8. Verify `npm view @stellojae/araon dist-tags version`.

## Known Release Notes

- Desktop packages are still unsigned and may trigger OS warnings.
- Agent live trading remains locked. The shipped product is decision-support and
  simulated preview only.
- KIS remains optional realtime tracking only. Toss is the primary product path.
- Market-hours behavior depends on upstream market availability and should be
  spot-checked after release if a new market session has opened.
