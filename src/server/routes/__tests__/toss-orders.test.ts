import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { tossOrdersRoutes } from '../toss-orders.js';
import type { TossOrdersClient } from '../../toss/toss-orders-client.js';

describe('toss orders routes', () => {
  it('returns sanitized pending Toss orders through a read-only route', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        orders: [
          {
            ref: 'pending-order-1',
            symbol: '005930',
            name: '삼성전자',
            market: 'kr',
            side: 'BUY',
            status: 'PENDING',
            quantity: 4,
            originalQuantity: 10,
            price: 70000,
            orderedDate: '2026-05-11',
            submittedAt: '2026-05-11T09:03:04.000000000',
          },
        ],
      })),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({ method: 'GET', url: '/toss/orders/pending' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        orders: [
          {
            ref: 'pending-order-1',
            symbol: '005930',
            name: '삼성전자',
            market: 'kr',
            side: 'BUY',
            status: 'PENDING',
            quantity: 4,
            originalQuantity: 10,
            price: 70000,
            orderedDate: '2026-05-11',
            submittedAt: '2026-05-11T09:03:04.000000000',
          },
        ],
      },
    });
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain('fixture-order-id');
  });

  it('maps missing Toss session to 503 without leaking internals', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(async () => {
        throw new Error('Toss session is required');
      }),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({ method: 'GET', url: '/toss/orders/pending' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  });

  it('sanitizes unexpected Toss order failures', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(async () => {
        throw new Error('raw Toss order response SESSION=[test-session] orderNo=[test-order-no]');
      }),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({ method: 'GET', url: '/toss/orders/pending' });

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
    expect(res.body).not.toContain('orderNo');
    expect(res.body).not.toContain('[test-order-no]');
  });

  it('returns sanitized completed Toss orders with range options', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(),
      listCompletedOrders: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        range: {
          market: 'kr',
          from: '2026-05-01',
          to: '2026-05-11',
          size: 25,
          number: 2,
        },
        orders: [
          {
            ref: 'completed-order-1',
            symbol: '005930',
            name: '삼성전자',
            market: 'kr',
            side: 'BUY',
            status: 'COMPLETED',
            quantity: 10,
            filledQuantity: 10,
            price: 70000,
            averageExecutionPrice: 69900,
            orderedDate: '2026-05-10',
            submittedAt: '2026-05-10T10:01:00.000000000',
          },
        ],
      })),
      getOrder: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/orders/completed?market=kr&from=2026-05-01&to=2026-05-11&size=25&number=2',
    });

    expect(res.statusCode).toBe(200);
    expect(ordersClient.listCompletedOrders).toHaveBeenCalledWith({
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
      size: 25,
      number: 2,
    });
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        range: {
          market: 'kr',
          from: '2026-05-01',
          to: '2026-05-11',
          size: 25,
          number: 2,
        },
        orders: [
          {
            ref: 'completed-order-1',
            symbol: '005930',
            name: '삼성전자',
            market: 'kr',
            side: 'BUY',
            status: 'COMPLETED',
            quantity: 10,
            filledQuantity: 10,
            price: 70000,
            averageExecutionPrice: 69900,
            orderedDate: '2026-05-10',
            submittedAt: '2026-05-10T10:01:00.000000000',
          },
        ],
      },
    });
    expect(res.body).not.toContain('orderNo');
  });

  it('returns a single sanitized Toss order by list-derived ref', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(async () => ({
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        ref: 'completed-order-1',
        kind: 'completed',
        range: {
          market: 'kr',
          from: '2026-05-01',
          to: '2026-05-11',
          size: 25,
          number: 2,
        },
        order: {
          ref: 'completed-order-1',
          symbol: '005930',
          name: '삼성전자',
          market: 'kr',
          side: 'BUY',
          status: 'COMPLETED',
          quantity: 10,
          filledQuantity: 10,
          price: 70000,
          averageExecutionPrice: 69900,
          orderedDate: '2026-05-10',
          submittedAt: '2026-05-10T10:01:00.000000000',
        },
      })),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/orders/completed-order-1?market=kr&from=2026-05-01&to=2026-05-11&size=25&number=2',
    });

    expect(res.statusCode).toBe(200);
    expect(ordersClient.getOrder).toHaveBeenCalledWith('completed-order-1', {
      market: 'kr',
      from: '2026-05-01',
      to: '2026-05-11',
      size: 25,
      number: 2,
    });
    expect(res.json()).toEqual({
      success: true,
      data: {
        provider: 'toss',
        fetchedAt: '2026-05-11T07:00:00.000Z',
        ref: 'completed-order-1',
        kind: 'completed',
        range: {
          market: 'kr',
          from: '2026-05-01',
          to: '2026-05-11',
          size: 25,
          number: 2,
        },
        order: {
          ref: 'completed-order-1',
          symbol: '005930',
          name: '삼성전자',
          market: 'kr',
          side: 'BUY',
          status: 'COMPLETED',
          quantity: 10,
          filledQuantity: 10,
          price: 70000,
          averageExecutionPrice: 69900,
          orderedDate: '2026-05-10',
          submittedAt: '2026-05-10T10:01:00.000000000',
        },
      },
    });
    expect(res.body).not.toContain('orderNo');
  });

  it('rejects raw-looking Toss order identifiers on the single-order route', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/orders/2026-05-10%2F[test-order-no]',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'INVALID_TOSS_ORDER_REF' },
    });
    expect(ordersClient.getOrder).not.toHaveBeenCalled();
  });

  it('maps missing Toss order refs to 404 without leaking lookup details', async () => {
    const ordersClient: TossOrdersClient = {
      listPendingOrders: vi.fn(),
      listCompletedOrders: vi.fn(),
      getOrder: vi.fn(async () => {
        throw new Error('Toss order ref was not found');
      }),
    };
    const app = Fastify({ logger: false });
    await app.register(tossOrdersRoutes, { ordersClient });

    const res = await app.inject({
      method: 'GET',
      url: '/toss/orders/completed-order-9',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'TOSS_ORDER_NOT_FOUND' },
    });
  });
});
