import AdmZip from 'adm-zip';
import { describe, expect, it, vi } from 'vitest';

import { createDartDisclosureService } from '../dart-disclosure-service';

function buildCorpCodeZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'CORPCODE.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
      <result>
        <list>
          <corp_code>00126380</corp_code>
          <corp_name>삼성전자</corp_name>
          <stock_code>005930</stock_code>
          <modify_date>20260507</modify_date>
        </list>
      </result>`,
      'utf8',
    ),
  );
  return zip.toBuffer();
}

describe('DART disclosure service', () => {
  it('refreshes corp-code mapping and stores DART filings for one ticker', async () => {
    const corpCodeRepo = {
      findByTicker: vi.fn(() => null),
      upsertMany: vi.fn(),
    };
    const disclosureRepo = {
      upsertMany: vi.fn((items) =>
        items.map((item: any, index: number) => ({ id: `filing-${index}`, ...item })),
      ),
    };
    const service = createDartDisclosureService({
      apiKey: 'redacted-dart-key',
      corpCodeRepo,
      disclosureRepo,
      fetchCorpCodeZip: vi.fn(async () => buildCorpCodeZip()),
      fetchDisclosureList: vi.fn(async () => ({
        status: '000',
        message: '정상',
        list: [
          {
            corp_cls: 'Y',
            corp_name: '삼성전자',
            corp_code: '00126380',
            stock_code: '005930',
            report_nm: '주요사항보고서',
            rcept_no: '20260507000001',
            flr_nm: '삼성전자',
            rcept_dt: '20260507',
            rm: '',
          },
        ],
      })),
    });

    const items = await service.refreshTicker({
      ticker: '005930',
      now: new Date('2026-05-07T04:00:00.000Z'),
    });

    expect(corpCodeRepo.upsertMany).toHaveBeenCalledWith([
      {
        ticker: '005930',
        corpCode: '00126380',
        corpName: '삼성전자',
        stockName: '삼성전자',
        updatedAt: '2026-05-07T04:00:00.000Z',
      },
    ]);
    expect(disclosureRepo.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        ticker: '005930',
        source: 'dart',
        kind: 'filing',
        title: '주요사항보고서',
        url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260507000001',
        publishedAt: '2026-05-06T15:00:00.000Z',
      }),
    ]);
    expect(items[0]).toMatchObject({ id: 'filing-0', title: '주요사항보고서' });
  });

  it('is disabled when the DART API key is missing', () => {
    const service = createDartDisclosureService({
      apiKey: '',
      corpCodeRepo: { findByTicker: vi.fn(), upsertMany: vi.fn() },
      disclosureRepo: { upsertMany: vi.fn() },
    });

    expect(service.isConfigured()).toBe(false);
  });
});
