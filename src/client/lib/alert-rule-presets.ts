import type { NewAlertRuleInput, AlertRule } from '../stores/alert-rules-store';

export type QuickAlertRulePresetId =
  | 'change-up-5'
  | 'change-down-5'
  | 'volume-surge-2_5'
  | 'price-up-3';

export interface QuickAlertRuleStock {
  code: string;
  price: number;
}

export interface QuickAlertRulePreset {
  id: QuickAlertRulePresetId;
  label: string;
  hint: string;
  input: NewAlertRuleInput;
}

export function buildQuickAlertRulePresets(
  stock: QuickAlertRuleStock,
): QuickAlertRulePreset[] {
  const presets: QuickAlertRulePreset[] = [
    {
      id: 'change-up-5',
      label: '등락률 +5%',
      hint: '오늘 등락률이 +5%를 돌파하면 알림',
      input: {
        ticker: stock.code,
        kind: 'changePctAbove',
        threshold: 5,
      },
    },
    {
      id: 'change-down-5',
      label: '등락률 -5%',
      hint: '오늘 등락률이 -5% 아래로 내려가면 알림',
      input: {
        ticker: stock.code,
        kind: 'changePctBelow',
        threshold: -5,
      },
    },
    {
      id: 'volume-surge-2_5',
      label: '거래량 2.5x',
      hint: '기준선 준비 후 거래량 배수가 2.5배를 돌파하면 알림',
      input: {
        ticker: stock.code,
        kind: 'volumeSurgeRatioAbove',
        threshold: 2.5,
      },
    },
  ];

  if (stock.price > 0 && Number.isFinite(stock.price)) {
    presets.push({
      id: 'price-up-3',
      label: '현재가 +3%',
      hint: '현재가보다 약 3% 높은 가격을 돌파하면 알림',
      input: {
        ticker: stock.code,
        kind: 'priceAbove',
        threshold: Math.round(stock.price * 1.03),
      },
    });
  }

  return presets;
}

export function findMatchingAlertRule(
  rules: ReadonlyArray<AlertRule>,
  input: NewAlertRuleInput,
): AlertRule | null {
  const scope = input.marketCapFilter ?? 'all';
  return (
    rules.find(
      (rule) =>
        rule.ticker === input.ticker &&
        rule.kind === input.kind &&
        rule.threshold === input.threshold &&
        (rule.marketCapFilter ?? 'all') === scope,
    ) ?? null
  );
}
