/**
 * NXT2b — leak guards for the approval-key probe artifact.
 *
 * The probe (`scripts/probe-kis-approval.mts`) writes a markdown report to
 * `docs/research/nxt2b-approval-probe.md` after a single live KIS call. The
 * report is supposed to contain only sanitized metadata (length + sha256 prefix
 * + extra-field types) and never the raw `approval_key`, `appkey`, `appsecret`,
 * or `access_token` value.
 *
 * These tests are intentionally **conditional**: the markdown file does not
 * exist until probe is run. When it exists, the regex guards trigger. The
 * script-side guards run unconditionally because the script is committed.
 *
 * Why a length-30 threshold: KIS approval keys are observed at 36+ chars in
 * community reports. The sha256 prefix we deliberately keep is 16 chars and
 * stays under the threshold. Any 30+ run of base64-style chars in the report
 * means a raw token slipped through.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt2b-approval-probe.md',
);
const SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-approval.mts',
);
const NXT3_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt3-live-ws-smoke.md',
);
const NXT3_FIXTURE_PATH = resolve(
  process.cwd(),
  'src/server/kis/__fixtures__/ws-tick-h0uncnt0-005930-live.redacted.json',
);
const NXT3_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-one-ticker.mts',
);
const NXT4B_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt4b-live-apply-smoke.md',
);
const NXT4B_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-apply-one-ticker.mts',
);
const NXT5B_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt5b-limited-live-smoke.md',
);
const NXT5B_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-favorites-smoke.mts',
);
const NXT5C_RUNBOOK_PATH = resolve(
  process.cwd(),
  'docs/runbooks/nxt-ws-rollout.md',
);
const NXT6A_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt6a-runtime-one-ticker-smoke.md',
);
const NXT6A_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-runtime-one-ticker.mts',
);
const NXT6B_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt6b-runtime-favorites-smoke.md',
);
const NXT6B_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-runtime-favorites.mts',
);
const NXT6C_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt6c-runtime-cap5-smoke.md',
);
const NXT6C_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-runtime-cap5.mts',
);
const NXT6D_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt6d-runtime-cap10-smoke.md',
);
const NXT6D_SCRIPT_PATH = resolve(
  process.cwd(),
  'scripts/probe-kis-ws-runtime-cap10.mts',
);
const NXT7B_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt7b-ui-session-live-smoke.md',
);
const NXT7C_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt7c-session-safeguards.md',
);
const NXT7D_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt7d-ui-session-limit-live-smoke.md',
);
const NXT8A_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt8a-cap10-hard-limit-live-smoke.md',
);
const NXT8B_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt8b-cap10-ui-button-live-smoke.md',
);
const NXT8C_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt8c-cap10-ui-hard-limit-retry.md',
);
const NXT8D_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt8d-rollout-readiness-summary.md',
);
const NXT8E_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt8e-cap10-ui-hard-limit-live-smoke.md',
);
const NXT9A_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt9a-cap20-readiness.md',
);
const NXT9_REPORT_PATH = resolve(
  process.cwd(),
  'docs/research/nxt9-cap20-cap40-live-smoke.md',
);

describe('NXT2b probe artifact — markdown report leak guard', () => {
  it('contains no length-30+ alphanumeric/-_ run (raw key/secret would match)', () => {
    if (!existsSync(REPORT_PATH)) return;
    const text = readFileSync(REPORT_PATH, 'utf8');
    const matches = text.match(/[A-Za-z0-9_-]{30,}/g) ?? [];
    expect(matches, `unexpected long token(s) in ${REPORT_PATH}`).toEqual([]);
  });

  it('does not bind sensitive identifiers to long values', () => {
    if (!existsSync(REPORT_PATH)) return;
    const text = readFileSync(REPORT_PATH, 'utf8');
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access_token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/);
  });
});

describe('NXT2b probe script — static leak guard', () => {
  it('does not hardcode an approval_key/appkey/appsecret literal', () => {
    const text = readFileSync(SCRIPT_PATH, 'utf8');
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access_token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
  });

  it('asserts a runtime LEAK GUARD before writing any output', () => {
    const text = readFileSync(SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
  });

  it('does not import or invoke WS / priceStore / bridge code', () => {
    const text = readFileSync(SCRIPT_PATH, 'utf8');
    // Block imports of any subsystem the probe must not touch.
    expect(text).not.toMatch(/from\s+['"][^'"]*price-store/);
    expect(text).not.toMatch(/from\s+['"][^'"]*kis-ws-client/);
    expect(text).not.toMatch(/from\s+['"][^'"]*realtime-bridge/);
    // Block call sites — bare identifiers in comments / markdown strings are
    // allowed (e.g. a checklist line saying "no priceStore.setPrice" is
    // informational). Only function-invocation shapes are forbidden.
    expect(text).not.toMatch(/createKisWsClient\s*\(/);
    expect(text).not.toMatch(/createRealtimeBridge\s*\(/);
    expect(text).not.toMatch(/\.subscribe\s*\(/);
    expect(text).not.toMatch(/\bpriceStore\.\w+\s*\(/);
    expect(text).not.toMatch(/\bwsClient\.\w+\s*\(/);
  });
});

describe('NXT3 WS smoke artifacts — leak guard', () => {
  for (const [label, path] of [
    ['markdown report', NXT3_REPORT_PATH],
    ['live fixture', NXT3_FIXTURE_PATH],
  ] as const) {
    it(`${label} contains no raw secret/token patterns when present`, () => {
      if (!existsSync(path)) return;
      const text = readFileSync(path, 'utf8');
      expect(text, `unexpected long token-like run in ${path}`).not.toMatch(
        /[A-Za-z0-9_-]{40,}/,
      );
      expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
      expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
    });
  }
});

describe('NXT3 WS smoke script — static guard', () => {
  it('does not hardcode a credential or token literal', () => {
    const text = readFileSync(NXT3_SCRIPT_PATH, 'utf8');
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access_token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
  });

  it('asserts runtime leak guards and avoids integration side effects', () => {
    const text = readFileSync(NXT3_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).not.toMatch(/from\s+['"][^'"]*price-store/);
    expect(text).not.toMatch(/from\s+['"][^'"]*sse-manager/);
    expect(text).not.toMatch(/from\s+['"][^'"]*realtime-bridge/);
    expect(text).not.toMatch(/createRealtimeBridge\s*\(/);
    expect(text).not.toMatch(/\bpriceStore\.\w+\s*\(/);
    expect(text).not.toMatch(/\bsseManager\.\w+\s*\(/);
  });
});

describe('NXT4b apply smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT4B_REPORT_PATH)) return;
    const text = readFileSync(NXT4B_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT4B_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{40,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT4b apply smoke script — static guard', () => {
  it('exists and does not hardcode a credential or token literal', () => {
    const text = readFileSync(NXT4B_SCRIPT_PATH, 'utf8');
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access_token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
  });

  it('uses an isolated apply harness and no dev-server runtime wiring', () => {
    const text = readFileSync(NXT4B_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/applyTicksToPriceStore:\s*true/);
    expect(text).toMatch(/new PriceStore\(/);
    expect(text).not.toMatch(/from\s+['"][^'"]*bootstrap-kis/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/createSseManager\s*\(/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
  });
});

describe('NXT5b limited favorites smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT5B_REPORT_PATH)) return;
    const text = readFileSync(NXT5B_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT5B_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{40,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT5b limited favorites smoke script — static guard', () => {
  it('exists and does not hardcode a credential or token literal', () => {
    const text = readFileSync(NXT5B_SCRIPT_PATH, 'utf8');
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access_token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
  });

  it('limits live subscriptions and uses only the isolated apply harness', () => {
    const text = readFileSync(NXT5B_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/MAX_SUBSCRIBE_TICKERS\s*=\s*3/);
    expect(text).toMatch(/applyTicksToPriceStore:\s*true/);
    expect(text).toMatch(/new PriceStore\(/);
    expect(text).not.toMatch(/from\s+['"][^'"]*bootstrap-kis/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/createSseManager\s*\(/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
  });
});

describe('NXT5c rollout runbook — leak guard', () => {
  it('contains no raw secret/token patterns', () => {
    const text = readFileSync(NXT5C_RUNBOOK_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT5C_RUNBOOK_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT6a one-ticker runtime smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT6A_REPORT_PATH)) return;
    const text = readFileSync(NXT6A_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT6A_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });

  it('runtime smoke script is capped to one ticker and uses the guarded runtime path', () => {
    const text = readFileSync(NXT6A_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/TARGET_TICKER\s*=\s*'005930'/);
    expect(text).toMatch(/MAX_SUBSCRIBE_TICKERS\s*=\s*1/);
    expect(text).toMatch(/createSseManager\s*\(/);
    expect(text).toMatch(/shouldApplyRuntimeWsTicks\s*\(/);
    expect(text).toMatch(/canApplyTicksToPriceStore/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
    expect(text).not.toMatch(/applyTicksToPriceStore\s*:\s*true/);
  });
});

describe('NXT6b favorites runtime smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT6B_REPORT_PATH)) return;
    const text = readFileSync(NXT6B_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT6B_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });

  it('runtime favorites smoke script is capped to 3 favorites and uses the guarded runtime path', () => {
    const text = readFileSync(NXT6B_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/MAX_SUBSCRIBE_TICKERS\s*=\s*3/);
    expect(text).toMatch(/computeTiers\s*\(/);
    expect(text).toMatch(/createSseManager\s*\(/);
    expect(text).toMatch(/shouldApplyRuntimeWsTicks\s*\(/);
    expect(text).toMatch(/canApplyTicksToPriceStore/);
    expect(text).toMatch(/no_candidates/);
    expect(text).not.toMatch(/FALLBACK_TICKER/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
    expect(text).not.toMatch(/applyTicksToPriceStore\s*:\s*true/);
  });
});

describe('NXT6c cap5 runtime smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT6C_REPORT_PATH)) return;
    const text = readFileSync(NXT6C_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT6C_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });

  it('runtime cap5 smoke script is capped to 5 favorites and uses the guarded runtime path', () => {
    expect(existsSync(NXT6C_SCRIPT_PATH), `${NXT6C_SCRIPT_PATH} missing`).toBe(true);
    if (!existsSync(NXT6C_SCRIPT_PATH)) return;
    const text = readFileSync(NXT6C_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/MAX_SUBSCRIBE_TICKERS\s*=\s*5/);
    expect(text).toMatch(/MAX_OBSERVATION_MS\s*=\s*90_000/);
    expect(text).toMatch(/computeTiers\s*\(\s*favorites,\s*\[\],\s*MAX_SUBSCRIBE_TICKERS\s*\)/);
    expect(text).toMatch(/createSseManager\s*\(/);
    expect(text).toMatch(/shouldApplyRuntimeWsTicks\s*\(/);
    expect(text).toMatch(/canApplyTicksToPriceStore/);
    expect(text).toMatch(/noTickByTicker/);
    expect(text).not.toMatch(/FALLBACK_TICKER/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
    expect(text).not.toMatch(/applyTicksToPriceStore\s*:\s*true/);
  });
});

describe('NXT6d cap10 runtime smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT6D_REPORT_PATH)) return;
    const text = readFileSync(NXT6D_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT6D_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });

  it('runtime cap10 smoke script uses tracked-stock overlay and restores favorites', () => {
    expect(existsSync(NXT6D_SCRIPT_PATH), `${NXT6D_SCRIPT_PATH} missing`).toBe(true);
    if (!existsSync(NXT6D_SCRIPT_PATH)) return;
    const text = readFileSync(NXT6D_SCRIPT_PATH, 'utf8');
    expect(text).toMatch(/LEAK GUARD/);
    expect(text).toMatch(/MAX_SUBSCRIBE_TICKERS\s*=\s*10/);
    expect(text).toMatch(/MAX_OBSERVATION_MS\s*=\s*120_000/);
    expect(text).toMatch(/readTrackedStocks\s*\(/);
    expect(text).toMatch(/restoreFavoritesSnapshot\s*\(/);
    expect(text).toMatch(/favoritesRestored/);
    expect(text).toMatch(/temporaryOverlay/);
    expect(text).toMatch(/computeTiers\s*\(\s*overlayFavorites,\s*\[\],\s*MAX_SUBSCRIBE_TICKERS\s*\)/);
    expect(text).toMatch(/createSseManager\s*\(/);
    expect(text).toMatch(/shouldApplyRuntimeWsTicks\s*\(/);
    expect(text).toMatch(/canApplyTicksToPriceStore/);
    expect(text).toMatch(/noTickByTicker/);
    expect(text).not.toMatch(/FALLBACK_TICKER/);
    expect(text).not.toMatch(/from\s+['"][^'"]*index/);
    expect(text).not.toMatch(/websocketEnabled\s*:\s*true/);
    expect(text).not.toMatch(/applyTicksToPriceStore\s*:\s*true/);
  });
});

describe('NXT7b UI session live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT7B_REPORT_PATH)) return;
    const text = readFileSync(NXT7B_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT7B_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT7c session safeguards artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT7C_REPORT_PATH)) return;
    const text = readFileSync(NXT7C_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT7C_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT7d UI session limit live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT7D_REPORT_PATH)) return;
    const text = readFileSync(NXT7D_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT7D_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT8a cap10 hard-limit live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT8A_REPORT_PATH)) return;
    const text = readFileSync(NXT8A_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT8A_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT8b cap10 UI button live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT8B_REPORT_PATH)) return;
    const text = readFileSync(NXT8B_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT8B_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT8c cap10 UI hard-limit retry artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT8C_REPORT_PATH)) return;
    const text = readFileSync(NXT8C_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT8C_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT8d rollout readiness summary artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT8D_REPORT_PATH)) return;
    const text = readFileSync(NXT8D_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT8D_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT8e cap10 UI hard-limit live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT8E_REPORT_PATH)) return;
    const text = readFileSync(NXT8E_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT8E_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT9a cap20 readiness artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT9A_REPORT_PATH)) return;
    const text = readFileSync(NXT9A_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT9A_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});

describe('NXT9 cap20/cap40 live smoke artifact — leak guard', () => {
  it('markdown report contains no raw secret/token patterns when present', () => {
    if (!existsSync(NXT9_REPORT_PATH)) return;
    const text = readFileSync(NXT9_REPORT_PATH, 'utf8');
    expect(text, `unexpected long token-like run in ${NXT9_REPORT_PATH}`).not.toMatch(
      /[A-Za-z0-9_-]{80,}/,
    );
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/approvalkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);
  });
});
