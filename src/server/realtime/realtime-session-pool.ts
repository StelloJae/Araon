export interface RealtimeCredentialProfile {
  id: string;
  label: string;
  enabled: boolean;
}

export interface RealtimeSessionPlan {
  profileId: string;
  label: string;
  cap: number;
  tickers: string[];
}

export interface RealtimeSessionPoolPlan {
  profileCount: number;
  enabledProfileCount: number;
  perSessionCap: number;
  totalCapacity: number;
  candidateCount: number;
  assignedTickerCount: number;
  fallbackTickerCount: number;
  sessions: RealtimeSessionPlan[];
}

export function planRealtimeSessionPool(input: {
  profiles: readonly RealtimeCredentialProfile[];
  candidates: readonly string[];
  perSessionCap: number;
}): RealtimeSessionPoolPlan {
  const perSessionCap = Math.max(1, Math.trunc(input.perSessionCap));
  const enabledProfiles = input.profiles.filter((profile) => profile.enabled);
  const sessions: RealtimeSessionPlan[] = [];
  let cursor = 0;
  for (const profile of enabledProfiles) {
    const tickers = input.candidates.slice(cursor, cursor + perSessionCap);
    cursor += tickers.length;
    sessions.push({
      profileId: profile.id,
      label: profile.label,
      cap: perSessionCap,
      tickers,
    });
  }
  const totalCapacity = enabledProfiles.length * perSessionCap;
  const assignedTickerCount = Math.min(input.candidates.length, totalCapacity);
  return {
    profileCount: input.profiles.length,
    enabledProfileCount: enabledProfiles.length,
    perSessionCap,
    totalCapacity,
    candidateCount: input.candidates.length,
    assignedTickerCount,
    fallbackTickerCount: Math.max(0, input.candidates.length - assignedTickerCount),
    sessions,
  };
}
