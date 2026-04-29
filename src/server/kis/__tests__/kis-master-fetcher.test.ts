import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import iconv from 'iconv-lite';
import AdmZip from 'adm-zip';
import {
  decodeMasterZip,
  fetchMaster,
  parseMasterFile,
  KisMasterFetchError,
  type MasterStockRow,
} from '../kis-master-fetcher.js';

// === Helpers ==================================================================

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/**
 * Build a synthetic mst row in fixed-width head layout matching the official
 * KIS sample (`[0:9]` ticker, `[9:21]` standardCode, `[21:]` name).
 */
function buildLine(ticker: string, standardCode: string, name: string, rearWidth: number): string {
  const head = ticker.padEnd(9) + standardCode.padEnd(12) + name;
  const rear = ' '.repeat(rearWidth);
  return head + rear;
}

function findRow(rows: MasterStockRow[], ticker: string): MasterStockRow {
  const r = rows.find((x) => x.ticker === ticker);
  if (r === undefined) throw new Error(`row not found in fixture: ${ticker}`);
  return r;
}

// === parseMasterFile — synthetic =============================================

describe('parseMasterFile (synthetic)', () => {
  it('extracts KOSPI rows with classification skeleton', () => {
    const lines = [
      buildLine('005930', 'KR7005930003', '삼성전자', 228),
      buildLine('000660', 'KR7000660001', 'SK하이닉스', 228),
    ].join('\n');

    const rows = parseMasterFile(lines, 'KOSPI');
    expect(rows).toHaveLength(2);

    const samsung = rows[0]!;
    expect(samsung.ticker).toBe('005930');
    expect(samsung.name).toBe('삼성전자');
    expect(samsung.market).toBe('KOSPI');
    expect(samsung.standardCode).toBe('KR7005930003');
    expect(samsung.marketCapTier).toBeNull();

    // No classification info in synthetic rows (rear is all spaces).
    expect(samsung.classification.securityGroupCode).toBeNull();
    expect(samsung.classification.indexIndustryLarge).toBeNull();
    expect(samsung.classification.krxSector.krxSemiconductor).toBeNull();
  });

  it('extracts KOSDAQ rows (222 char rear)', () => {
    const lines = [
      buildLine('050890', 'KR7050890009', '쏠리드', 222),
      buildLine('108860', 'KR7108860005', '셀바스AI', 222),
    ].join('\n');

    const rows = parseMasterFile(lines, 'KOSDAQ');
    expect(rows.map((r) => r.ticker)).toEqual(['050890', '108860']);
    expect(rows[0]?.market).toBe('KOSDAQ');
  });

  it('skips empty and too-short lines instead of throwing', () => {
    const lines = ['', '   ', 'xxx'].join('\n');
    expect(parseMasterFile(lines, 'KOSPI')).toEqual([]);
  });

  it('rejects bogus standardCode candidates and keeps the row', () => {
    // Synthetic edge: ticker [0..8] + non-KR-style candidate at [9..20]
    // followed by a name. Parser must produce ticker + name with null
    // standardCode rather than a poisoned ISIN.
    const head = '999999   ' + 'XXBADCANDID9' + '임시종목';
    const rear = ' '.repeat(228);
    const rows = parseMasterFile(head + rear, 'KOSPI');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ticker).toBe('999999');
    expect(rows[0]?.standardCode).toBeNull();
    expect(rows[0]?.name).toBe('임시종목');
  });
});

// === parseMasterFile — live fixtures =========================================

describe('parseMasterFile (live fixture, KOSPI)', () => {
  const text = loadFixture('kospi-master.sample.txt');
  const rows = parseMasterFile(text, 'KOSPI');

  it('parses 6 rows from the live KOSPI fixture (5 stocks + 1 fund)', () => {
    expect(rows).toHaveLength(6);
  });

  it('reads ticker / name / standardCode for 005930 삼성전자', () => {
    const r = findRow(rows, '005930');
    expect(r.name).toBe('삼성전자');
    expect(r.standardCode).toBe('KR7005930003');
    expect(r.market).toBe('KOSPI');
  });

  it('classifies 005380 현대차 as KRX자동차 = Y', () => {
    const r = findRow(rows, '005380');
    expect(r.classification.krxSector.krxAuto).toBe('Y');
    expect(r.classification.krxSector.krxSemiconductor).toBe('N');
    expect(r.classification.securityGroupCode).toBe('ST');
  });

  it('classifies 068270 셀트리온 as KRX바이오 = Y', () => {
    const r = findRow(rows, '068270');
    expect(r.classification.krxSector.krxBio).toBe('Y');
    expect(r.classification.krxSector.krxAuto).toBe('N');
    expect(r.classification.securityGroupCode).toBe('ST');
  });

  it('classifies 105560 KB금융 as KRX은행 = Y', () => {
    const r = findRow(rows, '105560');
    expect(r.classification.krxSector.krxBank).toBe('Y');
    expect(r.classification.krxSector.krxAuto).toBe('N');
    expect(r.classification.securityGroupCode).toBe('ST');
  });

  it('classifies 042700 한미반도체 as KRX반도체 = Y', () => {
    const r = findRow(rows, '042700');
    expect(r.classification.krxSector.krxSemiconductor).toBe('Y');
    expect(r.classification.securityGroupCode).toBe('ST');
  });

  it('handles fund/non-stock ticker without internal space (F70900001)', () => {
    const r = findRow(rows, 'F70900001');
    // Fixed-width head fixes the previous broken parsing where the entire
    // head was crammed into the ticker field.
    expect(r.ticker.length).toBe(9);
    expect(r.standardCode).toBe('KR5709000016');
    expect(r.name).toMatch(/대신하이일드공모주알파증권/);
    // Fund/REIT rows have a non-ST securityGroupCode — used downstream to
    // filter them out of the dashboard search if desired.
    expect(r.classification.securityGroupCode).not.toBe('ST');
  });

  it('extracts index industry codes (4-digit numeric) for 005930', () => {
    const r = findRow(rows, '005930');
    expect(r.classification.indexIndustryLarge).toMatch(/^\d{4}$/);
  });

  it('extracts a YYYYMMDD listing date for 005930', () => {
    const r = findRow(rows, '005930');
    expect(r.classification.listedAt).toMatch(/^\d{8}$/);
  });
});

describe('parseMasterFile (live fixture, KOSDAQ)', () => {
  const text = loadFixture('kosdaq-master.sample.txt');
  const rows = parseMasterFile(text, 'KOSDAQ');

  it('parses 1 KOSDAQ fixture row', () => {
    expect(rows).toHaveLength(1);
  });

  it('reads ticker / name for 108860 셀바스AI', () => {
    const r = findRow(rows, '108860');
    expect(r.name).toBe('셀바스AI');
    expect(r.market).toBe('KOSDAQ');
    expect(r.standardCode).toBe('KR7108860008');
    expect(r.classification.securityGroupCode).toBe('ST');
  });
});

// === decodeMasterZip + fetchMaster ============================================

describe('decodeMasterZip', () => {
  it('decompresses + CP949-decodes the inner file', () => {
    const text = buildLine('005930', 'KR7005930003', '삼성전자', 228);
    const zip = new AdmZip();
    zip.addFile('kospi_code.mst', iconv.encode(text, 'cp949'));
    const decoded = decodeMasterZip(zip.toBuffer());
    expect(decoded).toBe(text);
  });

  it('throws on an empty zip', () => {
    const zip = new AdmZip();
    expect(() => decodeMasterZip(zip.toBuffer())).toThrow(KisMasterFetchError);
  });

  it('throws on a corrupt buffer', () => {
    const garbage = Buffer.from('not a zip');
    expect(() => decodeMasterZip(garbage)).toThrow(KisMasterFetchError);
  });
});

describe('fetchMaster (with stub download)', () => {
  function makeZip(text: string, name: string): Buffer {
    const zip = new AdmZip();
    zip.addFile(name, iconv.encode(text, 'cp949'));
    return zip.toBuffer();
  }

  it('combines KOSPI + KOSDAQ, deduped by ticker', async () => {
    const kospiText = buildLine('005930', 'KR7005930003', '삼성전자', 228);
    const kosdaqText = [
      buildLine('050890', 'KR7050890009', '쏠리드', 222),
      // duplicated ticker — should be skipped on combined
      buildLine('005930', 'KR7005930003', '삼성전자(중복)', 222),
    ].join('\n');

    const result = await fetchMaster({
      download: async (url) =>
        url.includes('kospi') ? makeZip(kospiText, 'kospi.mst') : makeZip(kosdaqText, 'kosdaq.mst'),
    });
    expect(result.kospi.map((r) => r.ticker)).toEqual(['005930']);
    expect(result.kosdaq.map((r) => r.ticker)).toEqual(['050890', '005930']);
    expect(result.combined.map((r) => r.ticker)).toEqual(['005930', '050890']);
  });

  it('wraps download failures in KisMasterFetchError', async () => {
    await expect(
      fetchMaster({
        download: async () => {
          throw new Error('network down');
        },
      }),
    ).rejects.toBeInstanceOf(KisMasterFetchError);
  });
});
