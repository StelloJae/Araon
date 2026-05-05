/**
 * CredentialsSetup — KIS 앱키 등록 화면.
 *
 * Renders when `/credentials/status` reports runtime === 'unconfigured' (or
 * 'failed'). Posts to `POST /credentials`; the server's setup mutex serializes
 * concurrent submissions, and a 4xx/5xx is mapped to a Korean-language hint.
 */

import { useState, type FormEvent } from 'react';

interface CredentialsSetupProps {
  onSuccess: () => void;
}

const ERROR_MESSAGES: Record<number, string> = {
  400: '입력값 형식을 확인해주세요.',
  401: '앱키 또는 앱시크릿이 올바르지 않습니다.',
  409: '이미 활성화된 자격증명이 있습니다. 페이지를 새로고침해주세요.',
  429: 'KIS 토큰 발급이 일시 제한되었습니다. 잠시 후 다시 시도해주세요.',
  500: '자격증명 저장에 실패했습니다.',
  502: 'KIS 서버와 통신하지 못했습니다. 네트워크를 확인해주세요.',
};

export function CredentialsSetup({ onSuccess }: CredentialsSetupProps) {
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret, isPaper: false }),
      });
      if (res.ok) {
        onSuccess();
        return;
      }
      setError(ERROR_MESSAGES[res.status] ?? `알 수 없는 오류 (${res.status})`);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        maxWidth: 460,
        width: '100%',
        margin: '80px auto',
        padding: 32,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow) 0px 8px 24px -4px',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--text-strong)',
          letterSpacing: -0.2,
        }}
      >
        KIS 앱키 등록
      </h1>
      <p
        style={{
          marginTop: 6,
          marginBottom: 14,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-muted)',
        }}
      >
        한국투자증권 OpenAPI 포털에서 발급받은 앱키와 앱시크릿을 입력하세요.
      </p>

      <div style={noticeStyle}>
        <div>Araon은 localhost에서만 실행되는 읽기 전용 모니터링 도구입니다.</div>
        <div>주문/매매 기능은 없고, 새 설치의 실시간 시세는 기본 OFF입니다.</div>
      </div>

      <div style={hintStyle}>
        실전 OpenAPI 키를 등록하면 REST 폴링이 기본 경로로 유지되고,
        실시간 시세는 별도 설정에서 켤 수 있습니다.
      </div>

      <Field label="App Key">
        <input
          value={appKey}
          onChange={(e) => setAppKey(e.target.value)}
          required
          minLength={10}
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
      </Field>

      <Field label="App Secret">
        <input
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          required
          minLength={10}
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
      </Field>

      {error !== null && (
        <div
          role="alert"
          style={{
            background: 'rgba(246, 70, 93, 0.08)',
            border: '1px solid rgba(246, 70, 93, 0.3)',
            borderLeft: '3px solid var(--kr-up)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 500,
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: 14,
          fontWeight: 700,
          color: '#1E2026',
          background: submitting ? 'var(--border)' : 'var(--gold)',
          border: 'none',
          borderRadius: 6,
          cursor: submitting ? 'not-allowed' : 'pointer',
          letterSpacing: 0.2,
          transition: 'background 120ms ease',
        }}
      >
        {submitting ? '등록 중…' : '등록'}
      </button>
    </form>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0 12px',
  height: 40,
  fontSize: 14,
  color: 'var(--text-primary)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  transition: 'border-color 120ms ease',
};

const noticeStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  marginBottom: 12,
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  borderRadius: 8,
};

const hintStyle: React.CSSProperties = {
  marginBottom: 20,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
};
