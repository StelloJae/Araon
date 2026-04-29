/**
 * Sound — short Web Audio bleeps for alerts.
 *
 * `AudioContext` is lazily constructed and resumed inside a user gesture
 * (the SettingsModal sound toggle) — browsers block audio that isn't
 * preceded by a user interaction.
 *
 * `playBleep` is a no-op when:
 *   - we're in a non-DOM environment (tests, SSR)
 *   - the AudioContext hasn't been unlocked yet
 *   - the context is suspended (browser hasn't allowed audio)
 *
 * Failure is silent on purpose: alert fallback paths (toast, desktop notif)
 * still work even if audio is blocked.
 */

type Direction = 'up' | 'down';

type WindowWithWebkit = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithWebkit;
  if (typeof w.AudioContext === 'function') return w.AudioContext;
  if (typeof w.webkitAudioContext === 'function') return w.webkitAudioContext;
  return null;
}

/**
 * Create the AudioContext if needed and resume it. Must be called from a
 * user-gesture handler (click / keydown / change) for the browser to
 * actually unlock audio. Returns true on success.
 */
export async function ensureAudioUnlocked(): Promise<boolean> {
  const Ctor = getAudioContextCtor();
  if (Ctor === null) return false;
  if (ctx === null) {
    try {
      ctx = new Ctor();
    } catch {
      return false;
    }
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/**
 * Play a short rising/falling sine bleep. Silent if context isn't running.
 * `volume` is clamped to [0, 1].
 */
export function playBleep(volume: number, direction: Direction): void {
  if (ctx === null || ctx.state !== 'running') return;
  const v = Math.max(0, Math.min(1, volume));
  if (v === 0) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const startHz = direction === 'up' ? 880 : 440;
    const endHz = direction === 'up' ? 1320 : 330;
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(startHz, t0);
    osc.frequency.exponentialRampToValueAtTime(endHz, t0 + 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    osc.start();
    osc.stop(t0 + 0.27);
  } catch {
    // Web Audio failed mid-call (rare). Toast/desktop notif still work.
  }
}
