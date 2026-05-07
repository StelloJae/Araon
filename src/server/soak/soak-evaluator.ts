export interface SoakHttpSample {
  endpoint: string;
  status: number;
  bodyText: string;
}

export interface SoakSampleIssue {
  endpoint: string;
  code: 'HTTP_ERROR' | 'NON_JSON' | 'RAW_SECRET_VALUE';
  message: string;
}

export interface SoakEvaluation {
  ok: boolean;
  issues: SoakSampleIssue[];
}

const TOKEN_LIKE_VALUE = /^[A-Za-z0-9+/=_-]{48,}$/;
const SENSITIVE_KEY = /appsecret|accessToken|approvalKey|approval_key|secretkey|account/i;

export function evaluateSoakSamples(samples: readonly SoakHttpSample[]): SoakEvaluation {
  const issues: SoakSampleIssue[] = [];
  for (const sample of samples) {
    if (sample.status < 200 || sample.status >= 300) {
      issues.push({
        endpoint: sample.endpoint,
        code: 'HTTP_ERROR',
        message: `HTTP ${sample.status}`,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(sample.bodyText);
    } catch {
      issues.push({
        endpoint: sample.endpoint,
        code: 'NON_JSON',
        message: 'Response body is not JSON',
      });
      continue;
    }

    if (containsSensitiveValue(parsed)) {
      issues.push({
        endpoint: sample.endpoint,
        code: 'RAW_SECRET_VALUE',
        message: 'Response contains a sensitive-looking value',
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

function containsSensitiveValue(value: unknown, keyHint = ''): boolean {
  if (typeof value === 'string') {
    if (SENSITIVE_KEY.test(keyHint) && value.length > 8) return true;
    return TOKEN_LIKE_VALUE.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveValue(item, keyHint));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([key, child]) => containsSensitiveValue(child, key));
  }
  return false;
}
