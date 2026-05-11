/**
 * Bootstrap — top-level gate for `<App />`.
 *
 * Polls `GET /credentials/status` until KIS runtime reaches a usable state:
 *   - `unconfigured` → render Toss-first <App>
 *   - `starting`     → render loading screen
 *   - `started`      → render <App>
 *   - `failed`       → render Toss-first <App>; KIS can be repaired in settings
 *
 * KIS is now a fallback/provider-specific subsystem. It must not block the
 * default dashboard when Toss-backed market data is available.
 */

import { useEffect, useState } from 'react';
import { App } from './App';
import { startLauncherHeartbeat } from './lib/launcher-heartbeat';

type RuntimeStatus = 'unconfigured' | 'starting' | 'started' | 'failed';

interface StatusBody {
  configured: boolean;
  isPaper: boolean | null;
  runtime: RuntimeStatus;
  error?: { code: string; message: string };
}

interface StatusResponse {
  success: boolean;
  data: StatusBody;
}

async function fetchStatus(): Promise<StatusBody> {
  const res = await fetch('/credentials/status');
  const json = (await res.json()) as StatusResponse;
  return json.data;
}

export function Bootstrap() {
  const [status, setStatus] = useState<RuntimeStatus | 'loading'>('loading');
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void startLauncherHeartbeat()
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        stop = cleanup;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      const started = Date.now();
      while (!cancelled) {
        try {
          const data = await fetchStatus();
          if (cancelled) return;
          setStatus(data.runtime);
          if (
            data.runtime === 'started' ||
            data.runtime === 'unconfigured' ||
            data.runtime === 'failed'
          ) {
            return;
          }
          if (Date.now() - started > 30_000) setSlow(true);
          await new Promise((r) => setTimeout(r, 1000));
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    void loop();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading' || status === 'starting') {
    return <CenterMessage label="초기화 중…" hint={slow ? '잠시만 기다려주세요.' : null} />;
  }

  return <App />;
}

interface CenterMessageProps {
  label: string;
  hint: string | null;
}

function CenterMessage({ label, hint }: CenterMessageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--text-muted)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <div>{label}</div>
      {hint !== null && (
        <div style={{ fontSize: 12, color: 'var(--text-inactive)' }}>{hint}</div>
      )}
    </div>
  );
}
