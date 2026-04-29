import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseKisTickFrame,
  type KisTickParseResult,
  type KisRealtimeTick,
} from '../kis-tick-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixDir = resolve(here, '..', '__fixtures__');

function loadFixture(name: string): {
  raw: string;
  expected: { kind: 'ticks'; ticks: Array<Omit<KisRealtimeTick, 'updatedAt'>> };
} {
  const text = readFileSync(resolve(fixDir, name), 'utf8');
  return JSON.parse(text) as ReturnType<typeof loadFixture>;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function expectTicks(result: KisTickParseResult): KisRealtimeTick[] {
  if (result.kind !== 'ticks') {
    throw new Error(`expected kind=ticks, got ${result.kind}`);
  }
  return result.ticks;
}

// === Fixture round-trip ====================================================

describe('parseKisTickFrame — fixture round-trip', () => {
  it('parses H0STCNT0 (KRX) fixture into a single canonical tick', () => {
    const fix = loadFixture('ws-tick-h0stcnt0.json');
    const result = parseKisTickFrame(fix.raw);
    const ticks = expectTicks(result);
    expect(ticks).toHaveLength(1);
    const [t] = ticks;
    expect(t).toMatchObject(fix.expected.ticks[0]!);
    expect(t.updatedAt).toMatch(ISO_RE);
  });

  it('parses H0UNCNT0 (통합) fixture into a single canonical tick', () => {
    const fix = loadFixture('ws-tick-h0uncnt0.json');
    const result = parseKisTickFrame(fix.raw);
    const ticks = expectTicks(result);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatchObject(fix.expected.ticks[0]!);
  });

  it('fixtures carry no secrets — regression guard against accidental leaks', () => {
    for (const name of ['ws-tick-h0stcnt0.json', 'ws-tick-h0uncnt0.json']) {
      const text = readFileSync(resolve(fixDir, name), 'utf8').toLowerCase();
      expect(text).not.toContain('appkey');
      expect(text).not.toContain('appsecret');
      expect(text).not.toContain('accesstoken');
      expect(text).not.toContain('approval_key');
      expect(text).not.toContain('approvalkey');
      expect(text).not.toContain('bearer ');
    }
  });

  it('maps KRX→krx, 통합→integrated for source classification', () => {
    const krx = loadFixture('ws-tick-h0stcnt0.json');
    const uni = loadFixture('ws-tick-h0uncnt0.json');
    expect(expectTicks(parseKisTickFrame(krx.raw))[0]!.source).toBe('krx');
    expect(expectTicks(parseKisTickFrame(uni.raw))[0]!.source).toBe('integrated');
  });
});

// === Multi-tick (dataCount > 1) ============================================

describe('parseKisTickFrame — multi-tick frames', () => {
  it('expands dataCount=002 into ticks array of length 2', () => {
    const fix = loadFixture('ws-tick-h0uncnt0.json');
    const parts = fix.raw.split('|');
    // Use the same 46-field block twice with the first ticker swapped on the
    // second block to verify per-block ticker extraction.
    const block1 = parts[3]!;
    const block2 = block1.replace(/^000660/, '000661').replace('100515', '100520');
    const multi = `${parts[0]}|${parts[1]}|002|${block1}^${block2}`;

    const result = parseKisTickFrame(multi);
    const ticks = expectTicks(result);
    expect(ticks).toHaveLength(2);
    expect(ticks[0]!.ticker).toBe('000660');
    expect(ticks[0]!.tradeTime).toBe('100515');
    expect(ticks[1]!.ticker).toBe('000661');
    expect(ticks[1]!.tradeTime).toBe('100520');
    expect(ticks[1]!.price).toBe(130000);
  });

  it('returns kind=ignore reason=empty_data when dataCount=0', () => {
    const result = parseKisTickFrame('0|H0UNCNT0|000|');
    expect(result.kind).toBe('ignore');
    if (result.kind === 'ignore') expect(result.reason).toBe('empty_data');
  });
});

// === Control frames (JSON) ================================================

describe('parseKisTickFrame — control frames', () => {
  it('classifies PINGPONG as kind=pingpong (not ignore — caller may need to echo)', () => {
    const raw = JSON.stringify({
      header: { tr_id: 'PINGPONG', datetime: '20260427090000' },
    });
    const result = parseKisTickFrame(raw);
    expect(result.kind).toBe('pingpong');
    if (result.kind === 'pingpong') expect(result.raw).toBe(raw);
  });

  it('classifies subscribe-ack JSON as kind=ignore reason=control_frame', () => {
    const raw = JSON.stringify({
      header: { tr_id: 'H0STCNT0', tr_key: '005930', encrypt: 'N' },
      body: { rt_cd: '0', msg_cd: 'OPSP0000', msg1: 'SUBSCRIBE SUCCESS' },
    });
    const result = parseKisTickFrame(raw);
    expect(result.kind).toBe('ignore');
    if (result.kind === 'ignore') expect(result.reason).toBe('control_frame');
  });
});

// === Rejected frames =======================================================

describe('parseKisTickFrame — rejected frames', () => {
  it('classifies encrypted frames (flag=1) as kind=ignore reason=encrypted_frame', () => {
    // NXT1 단계에서는 AES 복호화 미지원. flag=1이면 페이로드 모양을 신경쓰지 않고 reject.
    const raw = '1|H0STCNT0|001|abcd1234base64payload==';
    const result = parseKisTickFrame(raw);
    expect(result.kind).toBe('ignore');
    if (result.kind === 'ignore') expect(result.reason).toBe('encrypted_frame');
  });

  it('classifies unsupported TR_ID (e.g., H0STASP0 호가) as kind=ignore reason=unsupported_tr_id', () => {
    const raw = '0|H0STASP0|001|005930^090032^73500^73400^73600';
    const result = parseKisTickFrame(raw);
    expect(result.kind).toBe('ignore');
    if (result.kind === 'ignore') expect(result.reason).toBe('unsupported_tr_id');
  });

  it('returns kind=error for pipe-delimited frames with fewer than 4 parts (malformed)', () => {
    const raw = '0|H0STCNT0';
    const result = parseKisTickFrame(raw);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('malformed_frame');
  });

  it('returns kind=error when dataCount and field count disagree (invalid_field_count)', () => {
    // dataCount=002 means body must have exactly 92 caret-fields; supplying 46 must fail.
    const fix = loadFixture('ws-tick-h0stcnt0.json');
    const body = fix.raw.split('|')[3]!;
    const broken = `0|H0STCNT0|002|${body}`;
    const result = parseKisTickFrame(broken);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('invalid_field_count');
  });

  it('returns kind=error when dataCount is non-numeric (invalid_data_count)', () => {
    const result = parseKisTickFrame('0|H0STCNT0|abc|005930^...');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('invalid_data_count');
  });

  it('returns kind=error for empty input (defensive)', () => {
    const result = parseKisTickFrame('');
    expect(result.kind).toBe('error');
  });
});

// === PRDY_VRSS_SIGN convention =============================================

describe('parseKisTickFrame — PRDY_VRSS_SIGN convention', () => {
  // KIS sign codes:
  //   1=상한, 2=상승  → positive
  //   3=보합          → zero
  //   4=하한, 5=하락  → negative
  // PRDY_VRSS itself is unsigned magnitude; PRDY_CTRT may already be signed.

  function frameWithSign(sign: string, vrss: string, ctrt: string): string {
    // 46 fields: ticker, time, price, sign, vrss, ctrt, then 40 placeholders.
    const head = ['005930', '090000', '70000', sign, vrss, ctrt];
    const tail = Array<string>(46 - head.length).fill('0');
    return `0|H0STCNT0|001|${[...head, ...tail].join('^')}`;
  }

  it('sign=2 (상승) yields positive changeAbs', () => {
    const t = expectTicks(parseKisTickFrame(frameWithSign('2', '500', '0.71')))[0]!;
    expect(t.changeAbs).toBe(500);
    expect(t.changeRate).toBeCloseTo(0.71, 2);
  });

  it('sign=5 (하락) yields negative changeAbs even when vrss is unsigned', () => {
    const t = expectTicks(parseKisTickFrame(frameWithSign('5', '1500', '-2.00')))[0]!;
    expect(t.changeAbs).toBe(-1500);
    expect(t.changeRate).toBeCloseTo(-2.0, 2);
  });

  it('sign=3 (보합) yields changeAbs=0 regardless of vrss field value', () => {
    const t = expectTicks(parseKisTickFrame(frameWithSign('3', '0', '0.00')))[0]!;
    expect(t.changeAbs).toBe(0);
    expect(t.changeRate).toBe(0);
  });

  it('sign=1 (상한) yields positive changeAbs', () => {
    const t = expectTicks(parseKisTickFrame(frameWithSign('1', '12000', '30.00')))[0]!;
    expect(t.changeAbs).toBe(12000);
  });

  it('sign=4 (하한) yields negative changeAbs', () => {
    const t = expectTicks(parseKisTickFrame(frameWithSign('4', '12000', '-30.00')))[0]!;
    expect(t.changeAbs).toBe(-12000);
  });
});
