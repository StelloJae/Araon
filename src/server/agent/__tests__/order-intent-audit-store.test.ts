import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateUp } from '../../db/migrator.js';
import {
  createSqliteOrderIntentStore,
} from '../order-intent-audit-store.js';
import { createOrderIntentService } from '../order-intent-service.js';

describe('SQLite order intent store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrateUp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('persists previews and audit entries across service instances', () => {
    const store = createSqliteOrderIntentStore(db);
    const service = createOrderIntentService({
      store,
      idFactory: () => 'intent-persisted',
      auditIdFactory: () => 'audit-persisted',
      now: () => '2026-05-11T14:10:00.000Z',
    });

    service.createPreview({
      ticker: 'A005930',
      side: 'buy',
      market: 'KR',
      quantity: 2,
      orderType: 'limit',
      limitPrice: 900000,
      triggerEventId: 'evt-news-1',
      agentId: 'araon-agent',
      reason: 'persist this preview',
      requestedMode: 'paper',
    });

    const restored = createOrderIntentService({ store });

    expect(restored.snapshotPreviews()).toEqual([
      expect.objectContaining({
        id: 'intent-persisted',
        ticker: '005930',
        requestedMode: 'paper',
        executionMode: 'paper',
        liveExecutionLocked: true,
        auditRef: 'audit-persisted',
      }),
    ]);
    expect(restored.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-persisted',
        intentId: 'intent-persisted',
        event: 'preview_created',
        decision: 'allowed',
        ticker: '005930',
      }),
    ]);
    expect(restored.snapshotPaperLedger()).toEqual({
      returnedCount: 1,
      items: [
        expect.objectContaining({
          id: 'paper-preview:intent-persisted',
          intentId: 'intent-persisted',
          ticker: '005930',
          side: 'buy',
          status: 'preview_only',
          booked: false,
          positionDelta: 2,
          cashDeltaKrw: null,
        }),
      ],
      summary: {
        entryCount: 1,
        bookedCount: 0,
        previewOnlyCount: 1,
        cashDeltaKrw: 0,
        byTicker: [
          {
            ticker: '005930',
            previewCount: 1,
            positionDelta: 2,
            cashDeltaKrw: 0,
            lastPreviewAt: '2026-05-11T14:10:00.000Z',
          },
        ],
      },
    });
  });

  it('persists blocked live attempts without creating a preview row', () => {
    const store = createSqliteOrderIntentStore(db);
    const service = createOrderIntentService({
      store,
      auditIdFactory: () => 'audit-blocked',
      now: () => '2026-05-11T14:11:00.000Z',
    });

    const result = service.createPreview({
      ticker: '005930',
      side: 'buy',
      quantity: 1,
      reason: 'live remains locked',
      requestedMode: 'live',
    });

    expect(result.preview).toBeNull();
    expect(createOrderIntentService({ store }).snapshotPreviews()).toEqual([]);
    expect(createOrderIntentService({ store }).snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-blocked',
        intentId: null,
        event: 'live_execution_blocked',
        decision: 'blocked',
        reason: 'Live order execution is disabled until a fresh explicit approval policy is present.',
      }),
    ]);
  });

  it('persists approval challenges and confirm audit across service instances', () => {
    const store = createSqliteOrderIntentStore(db);
    const service = createOrderIntentService({
      store,
      idFactory: () => 'intent-confirm-persisted',
      auditIdFactory: (() => {
        const ids = ['audit-preview', 'audit-challenge', 'audit-confirm'];
        return () => ids.shift() ?? 'audit-extra';
      })(),
      approvalChallengeIdFactory: () => 'challenge-persisted',
      now: (() => {
        const values = [
          '2026-05-11T14:12:00.000Z',
          '2026-05-11T14:12:05.000Z',
          '2026-05-11T14:12:20.000Z',
        ];
        return () => values.shift() ?? '2026-05-11T14:12:20.000Z';
      })(),
    });

    const preview = service.createPreview({
      ticker: '005930',
      side: 'buy',
      cashAmount: 500000,
      reason: 'confirm gate persistence',
      requestedMode: 'simulated',
    }).preview;
    expect(preview).not.toBeNull();
    const challenge = service.createApprovalChallenge({ intentId: preview!.id });
    expect(challenge.challenge?.confirmationText).toBe('CONFIRM 005930 BUY LIVE');
    service.confirmApprovalChallenge({
      challengeId: 'challenge-persisted',
      confirmationText: 'CONFIRM 005930 BUY LIVE',
    });

    const restored = createOrderIntentService({ store });

    expect(restored.snapshotApprovalChallenges()).toEqual([
      expect.objectContaining({
        id: 'challenge-persisted',
        intentId: 'intent-confirm-persisted',
        status: 'confirmed_live_locked',
        confirmationText: 'CONFIRM 005930 BUY LIVE',
        intentHash: expect.stringMatching(/^[a-f0-9]{16}$/),
        orderSummary: expect.objectContaining({
          ticker: '005930',
          side: 'buy',
          cashAmount: 500000,
        }),
        killSwitch: 'engaged',
        confirmedAt: '2026-05-11T14:12:20.000Z',
      }),
    ]);
    expect(restored.snapshotAudit()).toEqual([
      expect.objectContaining({
        id: 'audit-confirm',
        event: 'confirm_token_verified_live_locked',
        decision: 'blocked',
        reason: 'Confirmation token verified; live execution remains locked.',
      }),
      expect.objectContaining({
        id: 'audit-challenge',
        event: 'confirm_challenge_created',
        decision: 'allowed',
      }),
      expect.objectContaining({
        id: 'audit-preview',
        event: 'preview_created',
      }),
    ]);
  });
});
