import { KisRestError } from './kis-rest-client.js';

export type KisEndpointClass =
  | 'foreground'
  | 'polling'
  | 'daily-backfill'
  | 'selected-minute'
  | 'maintenance'
  | 'token';

export interface KisOutboundLimiterAcquireInput {
  profileId?: string;
  endpointClass?: KisEndpointClass;
}

export interface KisOutboundLimiterFailureInput extends KisOutboundLimiterAcquireInput {
  error: unknown;
}

export interface KisOutboundLimiterProfileSnapshot {
  profileId: string;
  cooldownUntilMs: number;
  cooldownActive: boolean;
}

export interface KisOutboundLimiterSnapshot {
  ratePerSec: number;
  burst: number;
  tokens: number;
  profiles: KisOutboundLimiterProfileSnapshot[];
}

export interface KisOutboundLimiter {
  acquire(input?: KisOutboundLimiterAcquireInput): Promise<void>;
  recordFailure(input: KisOutboundLimiterFailureInput): void;
  snapshot(): KisOutboundLimiterSnapshot;
}

export interface CreateKisOutboundLimiterOptions {
  ratePerSec: number;
  burst: number;
  cooldownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_PROFILE_ID = 'primary';

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createKisOutboundLimiter(
  options: CreateKisOutboundLimiterOptions,
): KisOutboundLimiter {
  const ratePerSec = Math.max(0.1, options.ratePerSec);
  const burst = Math.max(1, Math.trunc(options.burst));
  const cooldownMs = Math.max(1, options.cooldownMs ?? DEFAULT_COOLDOWN_MS);
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  let tokens = burst;
  let lastRefillAtMs = now();
  const cooldownUntilByProfile = new Map<string, number>();

  async function acquire(input: KisOutboundLimiterAcquireInput = {}): Promise<void> {
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    refill();
    const cooldownUntilMs = cooldownUntilByProfile.get(profileId) ?? 0;
    const current = now();
    if (cooldownUntilMs > current) {
      await sleep(cooldownUntilMs - current);
      refill();
    }

    if (tokens >= 1) {
      tokens -= 1;
      return;
    }

    const waitMs = Math.ceil(((1 - tokens) / ratePerSec) * 1000);
    await sleep(waitMs);
    refill();
    tokens = Math.max(0, tokens - 1);
  }

  function recordFailure(input: KisOutboundLimiterFailureInput): void {
    if (!isRateLimited(input.error)) return;
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    cooldownUntilByProfile.set(
      profileId,
      Math.max(cooldownUntilByProfile.get(profileId) ?? 0, now() + cooldownMs),
    );
  }

  function snapshot(): KisOutboundLimiterSnapshot {
    const current = now();
    return {
      ratePerSec,
      burst,
      tokens,
      profiles: Array.from(cooldownUntilByProfile.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([profileId, cooldownUntilMs]) => ({
          profileId,
          cooldownUntilMs,
          cooldownActive: cooldownUntilMs > current,
        })),
    };
  }

  function refill(): void {
    const current = now();
    const elapsedMs = Math.max(0, current - lastRefillAtMs);
    if (elapsedMs <= 0) return;
    tokens = Math.min(burst, tokens + (elapsedMs / 1000) * ratePerSec);
    lastRefillAtMs = current;
  }

  return { acquire, recordFailure, snapshot };
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof KisRestError) {
    return error.status === 429 || error.msgCd === 'EGW00201';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|EGW00201|rate.?limit|throttle|초당/.test(message);
}
