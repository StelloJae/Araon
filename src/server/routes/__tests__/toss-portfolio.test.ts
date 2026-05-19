import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossPortfolioRoutes } from '../toss-portfolio.js';
import type { TossPortfolioClient } from '../../toss/toss-portfolio-client.js';

describe('toss portfolio routes', () => {
  it('returns sanitized Toss positions through a read-only route', async () => {
    const portfolioClient: TossPortfolioClient = {
      listPositions: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T06:30:00.000Z',
        positions: [
          {
            productCode: '005930',
            symbol: '005930',
            name: '삼성전자',
            marketType: 'KR',
            marketCode: 'KRX',
            quantity: 3,
            averagePrice: 65000,
            currentPrice: 70000,
            marketValue: 210000,
            unrealizedPnl: 15000,
            profitRate: 7.6923,
            dailyProfitLoss: 1200,
            dailyProfitRate: 0.57,
            averagePriceUsd: 0,
            currentPriceUsd: 0,
            marketValueUsd: 0,
            unrealizedPnlUsd: 0,
            profitRateUsd: 0,
            dailyProfitLossUsd: 0,
            dailyProfitRateUsd: 0,
          },
        ],
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossPortfolioRoutes, { portfolioClient });

    const res = await app.inject({ method: 'GET', url: '/toss/portfolio/positions' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T06:30:00.000Z',
        positions: [
          {
            productCode: '005930',
            symbol: '005930',
            name: '삼성전자',
            marketType: 'KR',
            marketCode: 'KRX',
            quantity: 3,
            averagePrice: 65000,
            currentPrice: 70000,
            marketValue: 210000,
            unrealizedPnl: 15000,
            profitRate: 7.6923,
            dailyProfitLoss: 1200,
            dailyProfitRate: 0.57,
            averagePriceUsd: 0,
            currentPriceUsd: 0,
            marketValueUsd: 0,
            unrealizedPnlUsd: 0,
            profitRateUsd: 0,
            dailyProfitLossUsd: 0,
            dailyProfitRateUsd: 0,
          },
        ],
      },
    });
    expect(res.body).not.toContain('accountNo');
    expect(res.body).not.toContain('[test-account]');
  });

  it('maps missing Toss session to 503 without leaking internals', async () => {
    const portfolioClient: TossPortfolioClient = {
      listPositions: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossPortfolioRoutes, { portfolioClient });

    const res = await app.inject({ method: 'GET', url: '/toss/portfolio/positions' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss portfolio failures', async () => {
    const portfolioClient: TossPortfolioClient = {
      listPositions: vi.fn(async () => {
        throw new Error('raw Toss portfolio response SESSION=[test-session] accountNo=[test-account]');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossPortfolioRoutes, { portfolioClient });

    const res = await app.inject({ method: 'GET', url: '/toss/portfolio/positions' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'TOSS_READ_REQUEST_FAILED',
        message: 'Toss read request failed',
      },
    });
    expect(res.body).not.toContain(['SESSION', ''].join('='));
    expect(res.body).not.toContain('[test-session]');
    expect(res.body).not.toContain('accountNo');
  });
});
