import type { MarketStatus } from '@shared/types';
import { isMarketLive } from './market-status';
import type { MomentumSignalType, MomentumWindow } from './realtime-momentum';
import type { StockViewModel } from './view-models';

export type SignalLevel = 'watch' | 'strong' | 'urgent' | 'none';
export type SignalConfidence = 'live' | 'snapshot' | 'collecting';

export type SignalReasonKind =
  | 'realtime-momentum'
  | 'today-strength'
  | 'favorite'
  | 'sector-co-movement'
  | 'volume-surge';

export type SignalReasonTone = 'positive' | 'warning' | 'neutral';

export interface SignalReason {
  kind: SignalReasonKind;
  text: string;
  weight: number;
  tone: SignalReasonTone;
}

export interface SignalExplanation {
  level: SignalLevel;
  score: number;
  confidence: SignalConfidence;
  primaryReason: string;
  reasons: SignalReason[];
  caveats: string[];
}

interface BuildSignalExplanationInput {
  stock: StockViewModel;
  allStocks: ReadonlyArray<StockViewModel>;
  isFavorite: boolean;
  surgeItem?: SignalSurgeInput | null;
  marketStatus: MarketStatus;
}

export interface SignalSurgeInput {
  isLive?: boolean | undefined;
  signalType?: MomentumSignalType | undefined;
  momentumPct?: number | undefined;
  momentumWindow?: MomentumWindow | undefined;
  dailyChangePct?: number | undefined;
  volumeSurgeRatio?: number | null | undefined;
  volumeBaselineStatus?:
    | 'collecting'
    | 'ready'
    | 'unavailable'
    | undefined;
}

export function buildSignalExplanation({
  stock,
  allStocks,
  isFavorite,
  surgeItem = null,
  marketStatus,
}: BuildSignalExplanationInput): SignalExplanation {
  const reasons: SignalReason[] = [];
  const caveats: string[] = [];
  const snapshotBased = stock.isSnapshot || !isMarketLive(marketStatus);
  const dailyChangePct = surgeItem?.dailyChangePct ?? stock.changePct;

  if (
    !snapshotBased &&
    surgeItem?.isLive === true &&
    surgeItem.signalType !== undefined &&
    surgeItem.momentumWindow !== undefined &&
    surgeItem.momentumPct !== undefined
  ) {
    reasons.push({
      kind: 'realtime-momentum',
      text: `실시간 ${windowLabel(surgeItem.momentumWindow)} +${surgeItem.momentumPct.toFixed(1)}% ${signalTypeLabel(surgeItem.signalType)}`,
      weight: realtimeWeight(surgeItem.signalType),
      tone: surgeItem.signalType === 'overheat' ? 'warning' : 'positive',
    });
  }

  const todayWeight = todayStrengthWeight(dailyChangePct);
  if (todayWeight > 0) {
    reasons.push({
      kind: 'today-strength',
      text: `오늘 ${dailyChangePct >= 0 ? '+' : ''}${dailyChangePct.toFixed(1)}% 강세`,
      weight: todayWeight,
      tone: 'positive',
    });
  }

  if (isFavorite) {
    reasons.push({
      kind: 'favorite',
      text: '즐겨찾기 종목',
      weight: 10,
      tone: 'neutral',
    });
  }

  const sectorReason = buildSectorReason(stock, allStocks);
  if (sectorReason !== null) reasons.push(sectorReason);

  const volumeSurgeRatio =
    surgeItem?.volumeSurgeRatio ?? stock.volumeSurgeRatio ?? null;
  const volumeBaselineStatus =
    surgeItem?.volumeBaselineStatus ??
    stock.volumeBaselineStatus ??
    'unavailable';

  if (volumeSurgeRatio !== null && volumeSurgeRatio >= 2) {
    reasons.push({
      kind: 'volume-surge',
      text: `거래량 기준선 대비 ${volumeSurgeRatio.toFixed(1)}배`,
      weight: 20,
      tone: 'positive',
    });
  } else if (volumeBaselineStatus === 'collecting') {
    caveats.push('거래량 기준선 수집 중');
  }

  if (snapshotBased) caveats.push('스냅샷 기준');

  reasons.sort((a, b) => b.weight - a.weight);

  const rawScore = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  const level = applySnapshotCap(levelFromScore(rawScore), snapshotBased);
  const confidence = snapshotBased
    ? 'snapshot'
    : volumeBaselineStatus === 'collecting' && volumeSurgeRatio === null
      ? 'collecting'
      : 'live';

  return {
    level,
    score: rawScore,
    confidence,
    primaryReason: reasons[0]?.text ?? '관찰 근거 부족',
    reasons,
    caveats,
  };
}

function todayStrengthWeight(changePct: number): number {
  if (changePct >= 10) return 40;
  if (changePct >= 5) return 30;
  if (changePct >= 3) return 20;
  return 0;
}

function realtimeWeight(type: MomentumSignalType): number {
  switch (type) {
    case 'overheat':
      return 70;
    case 'strong_scalp':
      return 50;
    case 'scalp':
      return 35;
    case 'trend':
      return 25;
  }
}

function levelFromScore(score: number): SignalLevel {
  if (score >= 75) return 'urgent';
  if (score >= 50) return 'strong';
  if (score >= 25) return 'watch';
  return 'none';
}

function applySnapshotCap(level: SignalLevel, snapshotBased: boolean): SignalLevel {
  if (!snapshotBased) return level;
  if (level === 'urgent' || level === 'strong') return 'watch';
  return level;
}

function buildSectorReason(
  stock: StockViewModel,
  allStocks: ReadonlyArray<StockViewModel>,
): SignalReason | null {
  const sector = stock.effectiveSector;
  if (sector.source === 'unclassified') return null;

  const sameSector = allStocks.filter(
    (s) =>
      s.effectiveSector.name === sector.name &&
      s.effectiveSector.source === sector.source,
  );
  if (sameSector.length < 3) return null;

  const positiveCount = sameSector.filter((s) => s.changePct > 0).length;
  const average =
    sameSector.reduce((sum, s) => sum + s.changePct, 0) / sameSector.length;
  if (positiveCount < 3 || average <= 0) return null;

  return {
    kind: 'sector-co-movement',
    text: `${sector.name} 동반 강세 ${positiveCount}종목`,
    weight: 15,
    tone: 'positive',
  };
}

function signalTypeLabel(type: MomentumSignalType): string {
  switch (type) {
    case 'overheat':
      return '과열 주의';
    case 'strong_scalp':
      return '강한 급가속';
    case 'scalp':
      return '급가속';
    case 'trend':
      return '추세 지속';
  }
}

function windowLabel(window: MomentumWindow): string {
  switch (window) {
    case '10s':
      return '10초';
    case '20s':
      return '20초';
    case '30s':
      return '30초';
    case '1m':
      return '1분';
    case '3m':
      return '3분';
    case '5m':
      return '5분';
  }
}
