import { KisRestError } from './kis-rest-client.js';

export type KisEndpointClass =
  | 'foreground'
  | 'polling'
  | 'ranking'
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
  endpointClass: KisEndpointClass | null;
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
  cooldownMsByEndpointClass?: Partial<Record<KisEndpointClass, number>>;
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
  const cooldownMsByEndpointClass = options.cooldownMsByEndpointClass ?? {};
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  let tokens = burst;
  let lastRefillAtMs = now();
  const cooldownUntilByKey = new Map<string, number>();

  async function acquire(input: KisOutboundLimiterAcquireInput = {}): Promise<void> {
    const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    refill();
    const cooldownUntilMs = cooldownUntilByKey.get(cooldownKey) ?? 0;
    const current = now();
    if (cooldownUntilMs > current) {
      if (shouldFailFastOnCooldown(input.endpointClass)) {
        throw new KisRestError(
          'KIS outbound limiter cooldown active',
          429,
          null,
          'EGW00201',
          {
            localCooldown: true,
            cooldownUntilMs,
          },
        );
      }
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
    const cooldownKey = cooldownMapKey(profileId, input.endpointClass);
    const endpointCooldownMs = cooldownMsForEndpoint(
      cooldownMs,
      cooldownMsByEndpointClass,
      input.endpointClass,
    );
    cooldownUntilByKey.set(
      cooldownKey,
      Math.max(cooldownUntilByKey.get(cooldownKey) ?? 0, now() + endpointCooldownMs),
    );
  }

  function snapshot(): KisOutboundLimiterSnapshot {
    const current = now();
    return {
      ratePerSec,
      burst,
      tokens,
      profiles: Array.from(cooldownUntilByKey.entries())
        .map(([key, cooldownUntilMs]) => ({
          ...parseCooldownMapKey(key),
          cooldownUntilMs,
        }))
        .sort((a, b) => {
          const profileOrder = a.profileId.localeCompare(b.profileId);
          if (profileOrder !== 0) return profileOrder;
          return String(a.endpointClass ?? '').localeCompare(String(b.endpointClass ?? ''));
        })
        .map(({ profileId, endpointClass, cooldownUntilMs }) => ({
          profileId,
          endpointClass,
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

function cooldownMapKey(profileId: string, endpointClass: KisEndpointClass | undefined): string {
  return `${profileId}\u0000${endpointClass ?? ''}`;
}

function parseCooldownMapKey(key: string): {
  profileId: string;
  endpointClass: KisEndpointClass | null;
} {
  const [profileId = DEFAULT_PROFILE_ID, endpointClass = ''] = key.split('\u0000');
  return {
    profileId,
    endpointClass: endpointClass.length > 0 ? (endpointClass as KisEndpointClass) : null,
  };
}

function shouldFailFastOnCooldown(endpointClass: KisEndpointClass | undefined): boolean {
  return endpointClass !== undefined;
}

function cooldownMsForEndpoint(
  defaultCooldownMs: number,
  overrides: Partial<Record<KisEndpointClass, number>>,
  endpointClass: KisEndpointClass | undefined,
): number {
  if (endpointClass === undefined) return defaultCooldownMs;
  return Math.max(1, overrides[endpointClass] ?? defaultCooldownMs);
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof KisRestError) {
    if (isLocalCooldownError(error)) return false;
    return error.status === 429 || error.msgCd === 'EGW00201';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|EGW00201|rate.?limit|throttle|초당/.test(message);
}

function isLocalCooldownError(error: KisRestError): boolean {
  const payload = error.payload;
  return (
    typeof payload === 'object'
    && payload !== null
    && (payload as Record<string, unknown>)['localCooldown'] === true
  );
}
