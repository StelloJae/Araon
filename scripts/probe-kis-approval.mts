/**
 * NXT2b — KIS approval key live probe (1회 실행 전용)
 *
 * 목적: createApprovalIssuer를 라이브 KIS에 1회만 호출하여 응답 shape를
 * 검증한다. approval_key 원문은 메모리 외 어디에도 저장하지 않음 — length +
 * sha256 prefix(16자)만 기록한다.
 *
 * 정책 (NXT2b spec):
 *   - WS 연결 / subscribe / priceStore 반영 0회
 *   - credentials.enc는 read-only로만 접근
 *   - 출력: stdout JSON + docs/research/nxt2b-approval-probe.md (둘 다 metadata only)
 *   - 실패해도 REST polling은 영향 없음 (probe는 standalone, server 미실행)
 *
 * 실행: `npx tsx scripts/probe-kis-approval.mts` (프로젝트 루트에서)
 */

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createFileCredentialStore } from '../src/server/credential-store.js';
import { createKisRestClient } from '../src/server/kis/kis-rest-client.js';
import {
  createApprovalIssuer,
  type ApprovalRequest,
} from '../src/server/kis/kis-approval.js';

interface ProbeReport {
  probeRunAt: string;
  elapsedMs: number;
  environment: 'live' | 'paper';
  outcome: 'ok' | 'fail';
  issuerState:
    | { status: 'ready'; issuedAt: string }
    | { status: 'failed'; code: string; message: string }
    | { status: 'none' | 'issuing' };
  rawResponse?: {
    keys: string[];
    approvalKey: { length: number; sha256_16: string };
    extraFields: Record<string, { type: string; sampleLength?: number }>;
  };
  error?: { code: string; message: string };
}

interface SanitizedCapture {
  result: NonNullable<ProbeReport['rawResponse']>;
  rawApprovalKey: string;
}

const REPORT_PATH = 'docs/research/nxt2b-approval-probe.md';

function sanitizeResponse(raw: unknown): SanitizedCapture | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const ak = typeof obj['approval_key'] === 'string' ? obj['approval_key'] : '';
  const extraFields: Record<string, { type: string; sampleLength?: number }> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'approval_key') continue;
    extraFields[k] =
      typeof v === 'string'
        ? { type: 'string', sampleLength: v.length }
        : { type: typeof v };
  }
  return {
    result: {
      keys: Object.keys(obj),
      approvalKey: {
        length: ak.length,
        sha256_16:
          ak.length > 0
            ? createHash('sha256').update(ak).digest('hex').slice(0, 16)
            : '',
      },
      extraFields,
    },
    rawApprovalKey: ak,
  };
}

function renderMarkdown(r: ProbeReport): string {
  const lines: string[] = [];
  lines.push('# NXT2b — KIS approval key live probe');
  lines.push('');
  lines.push(`**실행 일시 (UTC)**: ${r.probeRunAt}`);
  lines.push(`**소요 시간**: ${r.elapsedMs}ms`);
  lines.push(`**환경**: ${r.environment}`);
  lines.push(`**결과**: ${r.outcome}`);
  lines.push('');
  lines.push('## Issuer state (post-issue)');
  lines.push('```json');
  lines.push(JSON.stringify(r.issuerState, null, 2));
  lines.push('```');
  lines.push('');
  if (r.rawResponse) {
    const { keys, approvalKey, extraFields } = r.rawResponse;
    lines.push('## Response shape (sanitized)');
    lines.push('');
    lines.push(
      `- 응답 top-level keys: ${keys.map((k) => `\`${k}\``).join(', ')}`,
    );
    lines.push(
      `- \`approval_key\`: 길이 ${approvalKey.length}, sha256 prefix ${approvalKey.sha256_16} (raw value 미저장)`,
    );
    if (Object.keys(extraFields).length > 0) {
      lines.push('- 추가 필드 (type/length만, value 미저장):');
      for (const [k, v] of Object.entries(extraFields)) {
        const lenSuffix =
          v.sampleLength !== undefined ? ` (length=${v.sampleLength})` : '';
        lines.push(`  - \`${k}\`: ${v.type}${lenSuffix}`);
      }
    } else {
      lines.push('- 추가 필드: 없음');
    }
    lines.push('');
  } else {
    lines.push('## Response shape');
    lines.push('');
    lines.push('(응답 캡처 안 됨 — 호출 실패 또는 응답이 object가 아님)');
    lines.push('');
  }
  if (r.error) {
    lines.push('## Error (failure path)');
    lines.push('```json');
    lines.push(JSON.stringify(r.error, null, 2));
    lines.push('```');
    lines.push('');
  }
  lines.push('## 정책 준수 체크리스트');
  lines.push('');
  lines.push(
    '- [x] approval_key 원문은 디스크에 0회 저장 (length + sha256 prefix만 기록)',
  );
  lines.push('- [x] WS 연결 / subscribe / priceStore.setPrice 0회');
  lines.push('- [x] credentials.enc 수정 0회');
  lines.push(
    '- [x] 호출 1회 (issuer.issue() 1회 — kis-rest-client 내장 retry는 408/429/5xx에 한함)',
  );
  lines.push(
    '- [x] REST polling 영향 없음 (probe는 standalone, server 미실행)',
  );
  lines.push('');
  lines.push('## TTL / expiresAt 추론');
  lines.push('');
  if (r.rawResponse) {
    const expCandidates = Object.keys(r.rawResponse.extraFields).filter((k) =>
      /(expir|ttl|valid|life|interval)/i.test(k),
    );
    if (expCandidates.length > 0) {
      lines.push(
        `응답 body에 expires/ttl 단서 추정 필드: ${expCandidates.map((k) => `\`${k}\``).join(', ')}. 추가 라이브 캡처에서 type/range 확인 필요.`,
      );
    } else {
      lines.push(
        '응답 body에 expires/ttl 단서 필드 없음. approval key의 명시적 만료 시각은 응답에서 확인 불가 — 현재 구현은 unknown TTL / session-scoped로 취급 (새 WS 세션 시작 시 재발급).',
      );
    }
  } else {
    lines.push('(응답 캡처 실패로 추론 불가)');
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const store = createFileCredentialStore();
  const payload = await store.load();
  if (payload === null) {
    console.error(
      '[probe] no credentials.enc — POST /credentials first or run server setup',
    );
    process.exit(2);
    return;
  }
  const { credentials } = payload;
  const env: 'live' | 'paper' = credentials.isPaper ? 'paper' : 'live';

  console.error(
    `[probe] environment=${env} (credentials.isPaper=${credentials.isPaper})`,
  );
  console.error('[probe] sending POST /oauth2/Approval (1 call)...');

  // NXT2b spec: exactly 1 call, no retry. kis-rest-client default is 3
  // attempts with 408/429/5xx retry — clamp to 1 so a transient 5xx still
  // counts as the single allowed attempt.
  const restClient = createKisRestClient({
    isPaper: credentials.isPaper,
    maxAttempts: 1,
  });

  let captured: SanitizedCapture | undefined;
  const wrappedTransport = {
    request: async <T,>(req: ApprovalRequest): Promise<T> => {
      const raw = await restClient.request<unknown>(req);
      captured = sanitizeResponse(raw);
      return raw as T;
    },
  };

  const issuer = createApprovalIssuer({
    appKey: credentials.appKey,
    appSecret: credentials.appSecret,
    transport: wrappedTransport,
  });

  const startedAtMs = Date.now();
  let outcome: 'ok' | 'fail' = 'fail';
  let errorReport: { code: string; message: string } | undefined;

  try {
    await issuer.issue();
    outcome = 'ok';
  } catch (err: unknown) {
    outcome = 'fail';
    if (err instanceof Error) {
      const code = (err as { code?: unknown }).code;
      errorReport = {
        code: typeof code === 'string' ? code : 'unknown',
        message: err.message,
      };
    } else {
      errorReport = { code: 'unknown', message: String(err) };
    }
  }
  const elapsedMs = Date.now() - startedAtMs;

  const issuerState = issuer.getState();
  const stateOut: ProbeReport['issuerState'] =
    issuerState.status === 'ready'
      ? { status: 'ready', issuedAt: issuerState.issuedAt }
      : issuerState.status === 'failed'
        ? {
            status: 'failed',
            code: issuerState.code,
            message: issuerState.message,
          }
        : { status: issuerState.status };

  const report: ProbeReport = {
    probeRunAt: new Date(startedAtMs).toISOString(),
    elapsedMs,
    environment: env,
    outcome,
    issuerState: stateOut,
    ...(captured ? { rawResponse: captured.result } : {}),
    ...(errorReport ? { error: errorReport } : {}),
  };

  const reportJson = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);

  const rawKey = captured?.rawApprovalKey ?? '';
  if (rawKey.length > 0) {
    if (reportJson.includes(rawKey)) {
      throw new Error(
        'LEAK GUARD: stdout JSON contains raw approval_key substring',
      );
    }
    if (markdown.includes(rawKey)) {
      throw new Error(
        'LEAK GUARD: markdown report contains raw approval_key substring',
      );
    }
  }

  const outputPath = resolve(process.cwd(), REPORT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  console.log(reportJson);
  console.error(`[probe] report written to ${REPORT_PATH}`);
  process.exit(outcome === 'ok' ? 0 : 1);
}

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[probe] fatal: ${msg}`);
  process.exit(3);
});
