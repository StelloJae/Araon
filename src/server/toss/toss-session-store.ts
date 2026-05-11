import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { z } from 'zod';

import { resolveDataPath } from '../runtime-paths.js';

export type TossSessionState =
  | 'logged_out'
  | 'session_scoped'
  | 'persistent'
  | 'expiring'
  | 'expired';

export interface TossSession {
  provider: 'toss';
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  retrievedAt: string;
  expiresAt: string | null;
  serverExpiresAt: string | null;
  persistent: boolean;
}

export interface TossSessionSummary {
  configured: boolean;
  state: TossSessionState;
  provider: 'toss' | null;
  persistent: boolean;
  cookieCount: number;
  localStorageKeyCount: number;
  sessionStorageKeyCount: number;
  retrievedAt: string | null;
  expiresAt: string | null;
  serverExpiresAt: string | null;
  expiresInMs: number | null;
}

export interface TossSessionStore {
  load(): Promise<TossSession | null>;
  save(session: TossSession): Promise<void>;
  clear(): Promise<void>;
  status(now?: Date): Promise<TossSessionSummary>;
}

export interface TossSessionStoreOptions {
  path?: string;
}

const sessionSchema = z.object({
  provider: z.literal('toss'),
  cookies: z.record(z.string(), z.string()),
  localStorage: z.record(z.string(), z.string()),
  sessionStorage: z.record(z.string(), z.string()),
  retrievedAt: z.string().min(1),
  expiresAt: z.string().nullable(),
  serverExpiresAt: z.string().nullable(),
  persistent: z.boolean(),
});

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const AUTH_TAG_BYTES = 16;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const FILE_MAGIC = Buffer.from('ATSS', 'ascii');
const FILE_VERSION = 0x01;
const HEADER_BYTES = FILE_MAGIC.length + 1;
const EXPIRING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function createFileTossSessionStore(
  options: TossSessionStoreOptions = {},
): TossSessionStore {
  const path = options.path ?? resolveDataPath('toss-session.enc');

  async function load(): Promise<TossSession | null> {
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
    const parsed = sessionSchema.safeParse(JSON.parse(decryptPayload(blob).toString('utf8')));
    if (!parsed.success) {
      throw new Error('Toss session store payload failed validation');
    }
    return parsed.data;
  }

  async function save(session: TossSession): Promise<void> {
    const parsed = sessionSchema.safeParse(session);
    if (!parsed.success) {
      throw new Error('Toss session store payload failed validation');
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const encrypted = encryptPayload(Buffer.from(JSON.stringify(parsed.data), 'utf8'));
    const tmpPath = `${path}.tmp`;
    await writeFile(tmpPath, encrypted, { mode: 0o600 });
    await rename(tmpPath, path);
  }

  async function clear(): Promise<void> {
    await unlink(path).catch((err: unknown) => {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) {
        return;
      }
      throw err;
    });
  }

  async function status(now: Date = new Date()): Promise<TossSessionSummary> {
    const session = await load();
    return summarizeTossSession(session, now);
  }

  return { load, save, clear, status };
}

export function summarizeTossSession(
  session: TossSession | null,
  now: Date = new Date(),
): TossSessionSummary {
  if (session === null) {
    return {
      configured: false,
      state: 'logged_out',
      provider: null,
      persistent: false,
      cookieCount: 0,
      localStorageKeyCount: 0,
      sessionStorageKeyCount: 0,
      retrievedAt: null,
      expiresAt: null,
      serverExpiresAt: null,
      expiresInMs: null,
    };
  }
  const expiresAtMs = earliestExpiryMs(session);
  const expiresInMs = expiresAtMs === null ? null : expiresAtMs - now.getTime();
  const state = classifySessionState(session, expiresInMs);
  return {
    configured: true,
    state,
    provider: 'toss',
    persistent: session.persistent,
    cookieCount: Object.keys(session.cookies).length,
    localStorageKeyCount: Object.keys(session.localStorage).length,
    sessionStorageKeyCount: Object.keys(session.sessionStorage).length,
    retrievedAt: session.retrievedAt,
    expiresAt: session.expiresAt,
    serverExpiresAt: session.serverExpiresAt,
    expiresInMs,
  };
}

function earliestExpiryMs(session: TossSession): number | null {
  const values = [session.expiresAt, session.serverExpiresAt]
    .map((value) => value === null ? null : Date.parse(value))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.min(...values);
}

function classifySessionState(
  session: TossSession,
  expiresInMs: number | null,
): TossSessionState {
  if (expiresInMs !== null && expiresInMs <= 0) return 'expired';
  if (expiresInMs !== null && expiresInMs <= EXPIRING_WINDOW_MS) return 'expiring';
  return session.persistent ? 'persistent' : 'session_scoped';
}

function deriveKey(salt: Buffer): Buffer {
  const seed =
    process.env['ARAON_TOSS_SESSION_KEY'] ??
    `${hostname()}::${userInfo().username}::araon-toss-session`;
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
  const minLength = HEADER_BYTES + SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES;
  if (blob.length < minLength) {
    throw new Error('Toss session store file is too short');
  }
  const magic = blob.subarray(0, FILE_MAGIC.length);
  if (!magic.equals(FILE_MAGIC)) {
    throw new Error('Toss session store file has invalid magic bytes');
  }
  const version = blob[FILE_MAGIC.length];
  if (version !== FILE_VERSION) {
    throw new Error('Toss session store version mismatch');
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
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
