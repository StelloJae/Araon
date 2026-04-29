/**
 * AES-256-GCM encrypted credential store for KIS OpenAPI credentials and
 * the active access token.
 *
 * The encrypted file lives at `data/credentials.enc`. The encryption key is
 * derived either from the `KIS_CRED_KEY` environment variable (preferred) or
 * from a deterministic machine-bound fallback seed. A GCM auth tag guards the
 * payload against tampering and key mismatch; on verification failure the
 * store raises a loud error instead of silently returning `null`.
 *
 * Token persistence is bundled here (rather than in `kis-auth`) so the server
 * reuses an already-valid token across restarts. KIS caps token issuance at
 * one per minute — cold-issuing on every boot would trip the throttle.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { z } from 'zod';

import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('credential-store');

/**
 * Raw KIS credentials as issued in the KIS Developers portal.
 * `isPaper` distinguishes the 모의투자 credential pair from 실전.
 */
export interface KisCredentials {
  appKey: string;
  appSecret: string;
  isPaper: boolean;
}

/**
 * Persisted access token issued by the KIS OAuth endpoint
 * (see `TOKEN_ENDPOINT_PATH` in kis-constraints).
 * `expiresAtMs` is an absolute epoch millisecond timestamp (derived from
 * `expires_in` at issuance time). `issuedAtMs` gates against the KIS
 * 1-token-per-minute re-issuance rule after a process restart.
 */
export interface PersistedToken {
  accessToken: string;
  tokenType: string;
  expiresAtMs: number;
  issuedAtMs: number;
}

/**
 * Full decrypted payload stored on disk. `token` is optional — credentials
 * are written first and the token is attached on successful issuance.
 */
export interface StoredPayload {
  credentials: KisCredentials;
  token?: PersistedToken;
}

const credentialsSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  isPaper: z.boolean(),
});

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  expiresAtMs: z.number().int().positive(),
  issuedAtMs: z.number().int().positive(),
});

const payloadSchema = z.object({
  credentials: credentialsSchema,
  token: tokenSchema.optional(),
});

const STORE_PATH = resolve(process.cwd(), 'data', 'credentials.enc');

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const AUTH_TAG_BYTES = 16;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const FILE_MAGIC = Buffer.from('KSFW', 'ascii');
const FILE_VERSION = 0x01;
const HEADER_BYTES = FILE_MAGIC.length + 1;

/**
 * Derive the symmetric encryption key from either `KIS_CRED_KEY` or a
 * machine-bound fallback seed. The salt is stored alongside the ciphertext so
 * the same seed can be re-derived on read.
 */
function deriveKey(salt: Buffer): Buffer {
  const seed =
    process.env['KIS_CRED_KEY'] ??
    `${hostname()}::${userInfo().username}::korean-stock-follower`;
  return scryptSync(seed, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

function encryptPayload(plaintext: Buffer): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    FILE_MAGIC,
    Buffer.from([FILE_VERSION]),
    salt,
    iv,
    authTag,
    ciphertext,
  ]);
}

function decryptPayload(blob: Buffer): Buffer {
  const minLength =
    HEADER_BYTES + SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES;
  if (blob.length < minLength) {
    throw new Error(
      `credential store file too short: ${blob.length} bytes (expected >= ${minLength})`,
    );
  }
  const magic = blob.subarray(0, FILE_MAGIC.length);
  if (!magic.equals(FILE_MAGIC)) {
    throw new Error('credential store file has invalid magic bytes');
  }
  const version = blob[FILE_MAGIC.length];
  if (version !== FILE_VERSION) {
    throw new Error(
      `credential store version mismatch: got ${version ?? 'undefined'}, expected ${FILE_VERSION}`,
    );
  }

  let offset = HEADER_BYTES;
  const salt = blob.subarray(offset, offset + SALT_BYTES);
  offset += SALT_BYTES;
  const iv = blob.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const authTag = blob.subarray(offset, offset + AUTH_TAG_BYTES);
  offset += AUTH_TAG_BYTES;
  const ciphertext = blob.subarray(offset);

  const key = deriveKey(salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err: unknown) {
    // The GCM auth-tag mismatch is what Node raises here on tamper or wrong
    // key. Surface as an explicit, actionable error rather than swallowing.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `credential store decryption failed — tampered file or wrong KIS_CRED_KEY (${reason})`,
    );
  }
}

/**
 * Contract for the credential store. Exposed as an interface so tests and
 * higher layers can swap in an in-memory implementation without disk I/O.
 */
export interface CredentialStore {
  load(): Promise<StoredPayload | null>;
  saveCredentials(credentials: KisCredentials): Promise<void>;
  saveToken(token: PersistedToken): Promise<void>;
  clearToken(): Promise<void>;
  clearCredentials(): Promise<void>;
}

export interface FileCredentialStoreOptions {
  path?: string;
}

/**
 * Create a file-backed credential store. The path defaults to
 * `<cwd>/data/credentials.enc` but can be overridden for tests.
 */
export function createFileCredentialStore(
  options: FileCredentialStoreOptions = {},
): CredentialStore {
  const path = options.path ?? STORE_PATH;

  async function readPayload(): Promise<StoredPayload | null> {
    let blob: Buffer;
    try {
      blob = await readFile(path);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) {
        return null;
      }
      throw err;
    }
    const plaintext = decryptPayload(blob);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    const validated = payloadSchema.parse(parsed);
    // Re-shape to satisfy `exactOptionalPropertyTypes` — omit `token` when
    // absent rather than carrying an explicit `undefined`.
    return validated.token !== undefined
      ? { credentials: validated.credentials, token: validated.token }
      : { credentials: validated.credentials };
  }

  async function writePayload(payload: StoredPayload): Promise<void> {
    // Validate on the way out so callers can't write garbage.
    const validated = payloadSchema.parse(payload);
    const plaintext = Buffer.from(JSON.stringify(validated), 'utf8');
    const blob = encryptPayload(plaintext);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, blob, { mode: 0o600 });
  }

  return {
    async load(): Promise<StoredPayload | null> {
      const payload = await readPayload();
      if (payload === null) {
        log.debug({ path }, 'credential store file absent');
      } else {
        log.debug(
          {
            path,
            isPaper: payload.credentials.isPaper,
            hasToken: payload.token !== undefined,
          },
          'credential store loaded',
        );
      }
      return payload;
    },

    async saveCredentials(credentials: KisCredentials): Promise<void> {
      const existing = await readPayload();
      const next: StoredPayload =
        existing === null
          ? { credentials }
          : existing.token !== undefined
            ? { credentials, token: existing.token }
            : { credentials };
      await writePayload(next);
      log.info({ isPaper: credentials.isPaper }, 'credentials persisted');
    },

    async saveToken(token: PersistedToken): Promise<void> {
      const existing = await readPayload();
      if (existing === null) {
        throw new Error(
          'cannot persist token before credentials are stored',
        );
      }
      await writePayload({ credentials: existing.credentials, token });
      log.debug(
        { expiresAtMs: token.expiresAtMs },
        'access token persisted',
      );
    },

    async clearToken(): Promise<void> {
      const existing = await readPayload();
      if (existing === null) {
        return;
      }
      await writePayload({ credentials: existing.credentials });
      log.debug('access token cleared');
    },

    async clearCredentials(): Promise<void> {
      try {
        await unlink(path);
        log.info({ path }, 'credentials file deleted');
      } catch (err: unknown) {
        const isMissing =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code?: string }).code === 'ENOENT';
        if (!isMissing) {
          log.warn({ path, err: err instanceof Error ? err.message : String(err) }, 'clearCredentials failed');
          throw err;
        }
      }
    },
  };
}
