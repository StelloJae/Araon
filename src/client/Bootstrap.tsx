/**
 * Bootstrap — top-level gate for `<App />`.
 *
 * Polls `GET /credentials/status` until KIS runtime reaches a terminal state:
 *   - `unconfigured` → render <CredentialsSetup>
 *   - `starting`     → render loading screen
 *   - `started`      → render <App>
 *   - `failed`       → render error + <CredentialsSetup>
 *
 * The dashboard never renders before runtime === 'started', so all KIS-backed
 * routes (`/stocks`, `/favorites`, `/events`) return 503 + KIS_RUNTIME_NOT_READY
 * are not reachable from a happy-path render.
 */

import { useEffect, useState } from 'react';
import { App } from './App';
import { CredentialsSetup } from './components/CredentialsSetup';

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
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      const started = Date.now();
      while (!cancelled) {
        try {
          const data = await fetchStatus();
          if (cancelled) return;
          setStatus(data.runtime);
          setErrMsg(data.error?.message ?? null);
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

  if (status === 'failed') {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: '0 auto' }}>
        <div
          style={{
            color: 'var(--kr-up)',
            fontWeight: 600,
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          KIS 초기화 실패{errMsg ? ` — ${errMsg}` : ''}
        </div>
        <CredentialsSetup onSuccess={() => setStatus('started')} />
      </div>
    );
  }

  if (status === 'unconfigured') {
    return <CredentialsSetup onSuccess={() => setStatus('started')} />;
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
