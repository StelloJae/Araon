import { describe, expect, it, vi } from 'vitest';
import type { ToastSpec } from '../alert-evaluator';
import { queuePhoneAlertDelivery } from '../phone-alert-delivery';

function spec(overrides: Partial<ToastSpec> = {}): ToastSpec {
  return {
    id: 'toast-1',
    cooldownKey: 'rule:1',
    ticker: '005930',
    name: '삼성전자',
    kind: 'rule',
    direction: 'up',
    changePct: 5.2,
    title: '삼성전자 · 룰 발동',
    detail: '005930 · 등락률 ≥ 5%',
    ts: 1_775_000_000_000,
    ...overrides,
  };
}

describe('queuePhoneAlertDelivery', () => {
  it('sends the exact crossing alert payload and records a phone delivery', async () => {
    const sender = vi.fn(async () => ({ sent: true }));
    const record = vi.fn();

    queuePhoneAlertDelivery(spec(), record, sender, () => 1_775_000_001_000);
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());

    expect(sender).toHaveBeenCalledWith({
      ticker: '005930',
      name: '삼성전자',
      title: '삼성전자 · 룰 발동',
      detail: '005930 · 등락률 ≥ 5%',
      kind: 'rule',
      direction: 'up',
      changePct: 5.2,
    });
    expect(record).toHaveBeenCalledWith({
      ts: 1_775_000_001_000,
      ticker: '005930',
      name: '삼성전자',
      title: '삼성전자 · 룰 발동',
      detail: '005930 · 등락률 ≥ 5%',
      kind: 'rule',
      direction: 'up',
      channel: 'phone',
      status: 'sent',
    });
  });
});
