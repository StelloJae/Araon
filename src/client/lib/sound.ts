/**
 * Sound — short bleeps for alerts.
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
 * `playBleep` returns whether a playback path was started. Alert fallback
 * paths (toast, desktop notif) still work even if audio is blocked.
 */

type Direction = 'up' | 'down';

type WindowWithWebkit = typeof window & {
  webkitAudioContext?: typeof AudioContext;
  Audio?: typeof Audio;
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
 * Play a short rising/falling bleep. Uses Web Audio when unlocked, then falls
 * back to a tiny generated WAV data URL for Electron/Windows environments
 * where AudioContext construction or resume can fail.
 * `volume` is clamped to [0, 1]. Returns true when playback was attempted.
 */
export function playBleep(volume: number, direction: Direction): boolean {
  const v = Math.max(0, Math.min(1, volume));
  if (v === 0) return false;
  if (ctx === null || ctx.state !== 'running') {
    return playFallbackBleep(v, direction);
  }
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
    return true;
  } catch {
    return playFallbackBleep(v, direction);
  }
}

function playFallbackBleep(volume: number, direction: Direction): boolean {
  if (typeof window === 'undefined') return false;
  const AudioCtor = (window as WindowWithWebkit).Audio;
  if (typeof AudioCtor !== 'function') return false;
  const src = makeBleepWavDataUrl(direction);
  if (src === null) return false;
  try {
    const audio = new AudioCtor(src);
    audio.volume = volume;
    void audio.play().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function makeBleepWavDataUrl(direction: Direction): string | null {
  const btoaFn =
    typeof btoa === 'function'
      ? btoa
      : typeof window !== 'undefined' && typeof window.btoa === 'function'
        ? window.btoa.bind(window)
        : null;
  if (btoaFn === null) return null;

  const sampleRate = 8000;
  const durationSec = 0.25;
  const sampleCount = Math.floor(sampleRate * durationSec);
  const data = new Uint8Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const progress = i / Math.max(1, sampleCount - 1);
    const hz =
      direction === 'up'
        ? 880 + (1320 - 880) * progress
        : 440 + (330 - 440) * progress;
    const envelope = Math.sin(Math.PI * progress);
    data[i] = Math.round(128 + 80 * envelope * Math.sin(2 * Math.PI * hz * t));
  }

  const bytes: number[] = [];
  pushAscii(bytes, 'RIFF');
  pushU32(bytes, 36 + data.length);
  pushAscii(bytes, 'WAVEfmt ');
  pushU32(bytes, 16);
  pushU16(bytes, 1);
  pushU16(bytes, 1);
  pushU32(bytes, sampleRate);
  pushU32(bytes, sampleRate);
  pushU16(bytes, 1);
  pushU16(bytes, 8);
  pushAscii(bytes, 'data');
  pushU32(bytes, data.length);
  for (const byte of data) bytes.push(byte);
  const binary = String.fromCharCode(...bytes);
  return `data:audio/wav;base64,${btoaFn(binary)}`;
}

function pushAscii(out: number[], value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    out.push(value.charCodeAt(i));
  }
}

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}
