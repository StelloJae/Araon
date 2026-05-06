import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { CredentialStore } from '../credential-store.js';
import type { SettingsStore } from '../settings-store.js';
import type { KisRuntimeRef } from '../bootstrap-kis.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('routes/credentials');

export interface CredentialSetupMutex {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createCredentialSetupMutex(): CredentialSetupMutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = tail.then(fn, fn);
      tail = next.catch(() => undefined);
      return next;
    },
  };
}

export interface CredentialsRoutesOptions extends FastifyPluginOptions {
  credentialStore: CredentialStore;
  settingsStore: SettingsStore;
  runtimeRef: KisRuntimeRef;
  setupMutex: CredentialSetupMutex;
  onCredentialsConfigured?: () => void | Promise<void>;
}

const postBodySchema = z.object({
  appKey: z.string().min(10),
  appSecret: z.string().min(10),
  isPaper: z.boolean(),
});

export async function credentialsRoutes(app: FastifyInstance, opts: CredentialsRoutesOptions): Promise<void> {
  const { credentialStore, settingsStore, runtimeRef, setupMutex, onCredentialsConfigured } = opts;

  app.get('/credentials/status', async (_req, reply) => {
    const stored = await credentialStore.load();
    const rs = runtimeRef.get();
    if (stored === null) {
      return reply.send({ success: true, data: { configured: false, isPaper: null, runtime: 'unconfigured' } });
    }
    const base = { configured: true, isPaper: stored.credentials.isPaper, runtime: rs.status };
    if (rs.status === 'failed') {
      return reply.send({ success: true, data: { ...base, error: rs.error } });
    }
    return reply.send({ success: true, data: base });
  });

  app.post('/credentials', async (request, reply) => {
    const parsed = postBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_BODY', issues: parsed.error.issues } });
    }
    const creds = { ...parsed.data, isPaper: false };

    return setupMutex.run(async () => {
      const existing = await credentialStore.load();
      const rs = runtimeRef.get();

      if (existing !== null && (rs.status === 'started' || rs.status === 'starting')) {
        return reply.code(409).send({ success: false, error: { code: 'CREDENTIAL_ALREADY_CONFIGURED', message: 'Credentials are already configured and the runtime is active' } });
      }

      if (existing !== null && rs.status === 'failed') {
        await runtimeRef.stop().catch(() => undefined);
        await credentialStore.clearCredentials().catch(() => undefined);
        runtimeRef.reset();
      }

      const previousSettings = settingsStore.snapshot();
      try {
        await credentialStore.saveCredentials(creds);
        await settingsStore.save({
          ...previousSettings,
          rateLimiterMode: creds.isPaper ? 'paper' : 'live',
        });
        await runtimeRef.start(creds);
        try {
          const callback = onCredentialsConfigured?.();
          if (callback !== undefined) {
            void Promise.resolve(callback).catch((callbackErr: unknown) => {
              log.warn(
                { err: callbackErr instanceof Error ? callbackErr.message : String(callbackErr) },
                'post-credentials background hook failed',
              );
            });
          }
        } catch (callbackErr: unknown) {
          log.warn(
            { err: callbackErr instanceof Error ? callbackErr.message : String(callbackErr) },
            'post-credentials background hook failed',
          );
        }
        return reply.send({ success: true, data: { configured: true, isPaper: creds.isPaper, runtime: 'started' } });
      } catch (err: unknown) {
        await runtimeRef.stop().catch(() => undefined);
        await credentialStore.clearCredentials().catch(() => undefined);
        await settingsStore.save(previousSettings).catch(() => undefined);
        try { runtimeRef.reset(); } catch { /* ignore */ }
        const code = classifyError(err);
        log.error({ err: err instanceof Error ? err.message : String(err) }, 'POST /credentials failed');
        return reply.code(code).send({ success: false, error: { code: mapCode(code), message: err instanceof Error ? err.message : String(err) } });
      }
    });
  });
}

function classifyError(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  if (/throttle/i.test(msg) || /throttled/i.test(msg)) return 429;
  if (/401/.test(msg) || /invalid credentials/i.test(msg) || /unauthorized/i.test(msg)) return 401;
  if (/timeout|network|fetch failed|ECONN|ENOTFOUND/i.test(msg)) return 502;
  if (/EACCES|EPERM|ENOSPC|auth tag|decrypt/i.test(msg)) return 500;
  return 502;
}

function mapCode(http: number): string {
  return (
    {
      401: 'KIS_INVALID_CREDENTIALS',
      429: 'KIS_TOKEN_THROTTLED',
      500: 'CREDENTIAL_WRITE_FAILED',
      502: 'KIS_UPSTREAM_FAILURE',
    } as Record<number, string>
  )[http] ?? 'UNKNOWN';
}
