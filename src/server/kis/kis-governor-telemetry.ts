import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

import { createChildLogger } from '@shared/logger.js';
import { resolveDataPath } from '../runtime-paths.js';
import type {
  KisEndpointClass,
  KisGovernorState,
  KisGovernorTelemetryEvent,
  KisGovernorTelemetryEventType,
  KisGovernorTelemetrySnapshot,
  KisPriorityClass,
} from './kis-outbound-limiter.js';

const log = createChildLogger('kis-governor-telemetry');
const DEFAULT_TELEMETRY_FILE = 'kis-governor-telemetry.json';
const DEFAULT_TELEMETRY_CAPACITY = 200;

const endpointClasses = [
  'auth',
  'token',
  'approval',
  'foreground',
  'polling',
  'ranking',
  'daily-backfill',
  'selected-minute',
  'background_backfill',
  'selected_backfill',
  'master_refresh',
  'maintenance',
] as const satisfies readonly KisEndpointClass[];

const priorityClasses = [
  'auth',
  'foreground',
  'selected_backfill',
  'polling',
  'ranking',
  'background_backfill',
  'master_refresh',
  'maintenance',
] as const satisfies readonly KisPriorityClass[];

const governorStates = [
  'normal',
  'throttled',
  'half_open',
  'recovering',
  'circuit_breaker',
] as const satisfies readonly KisGovernorState[];

const telemetryEvents = [
  'throttle',
  'half_open',
  'recovered',
  'normal',
  'circuit_breaker',
] as const satisfies readonly KisGovernorTelemetryEventType[];

const telemetryEventSchema = z.object({
  atMs: z.number().int().min(0),
  event: z.enum(telemetryEvents),
  profileId: z.string().max(80),
  endpointClass: z.enum(endpointClasses).nullable(),
  priorityClass: z.enum(priorityClasses),
  state: z.enum(governorStates),
  throttleCode: z.string().max(64).nullable(),
  recoveryAttemptCount: z.number().int().min(0),
  observedRecoveryMs: z.number().int().min(0).nullable(),
  currentAllowedRps: z.number().min(0),
  minStartGapMs: z.number().int().min(0),
  maxInFlight: z.number().int().min(1),
});

const fileSchema = z.object({
  version: z.literal(1),
  events: z.array(telemetryEventSchema),
});

const snapshotSchema = z.object({
  capacity: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  recent: z.array(telemetryEventSchema),
});

export interface KisGovernorTelemetryStore {
  load(): Promise<KisGovernorTelemetrySnapshot>;
  save(snapshot: KisGovernorTelemetrySnapshot): Promise<void>;
  snapshot(): KisGovernorTelemetrySnapshot;
}

export interface FileKisGovernorTelemetryStoreOptions {
  path?: string;
  capacity?: number;
}

export function createFileKisGovernorTelemetryStore(
  options: FileKisGovernorTelemetryStoreOptions = {},
): KisGovernorTelemetryStore {
  const path = options.path ?? resolveDataPath(DEFAULT_TELEMETRY_FILE);
  const capacity = Math.max(0, Math.trunc(options.capacity ?? DEFAULT_TELEMETRY_CAPACITY));
  let current: KisGovernorTelemetrySnapshot = emptySnapshot(capacity);

  async function load(): Promise<KisGovernorTelemetrySnapshot> {
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err: unknown) {
      if (isMissingFile(err)) {
        current = emptySnapshot(capacity);
        return snapshot();
      }
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'KIS governor telemetry file unreadable — using empty telemetry',
      );
      current = emptySnapshot(capacity);
      return snapshot();
    }

    try {
      const parsed = fileSchema.parse(JSON.parse(raw));
      current = normalizeSnapshot({
        capacity,
        eventCount: parsed.events.length,
        recent: parsed.events,
      });
      return snapshot();
    } catch (err: unknown) {
      log.warn(
        { path, err: err instanceof Error ? err.message : String(err) },
        'KIS governor telemetry file malformed — using empty telemetry',
      );
      current = emptySnapshot(capacity);
      return snapshot();
    }
  }

  async function save(snapshotInput: KisGovernorTelemetrySnapshot): Promise<void> {
    current = normalizeSnapshot(snapshotSchema.parse(snapshotInput));
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(
      path,
      `${JSON.stringify({ version: 1, events: current.recent }, null, 2)}\n`,
      'utf8',
    );
  }

  function snapshot(): KisGovernorTelemetrySnapshot {
    return {
      capacity: current.capacity,
      eventCount: current.eventCount,
      recent: current.recent.map((event) => ({ ...event })),
    };
  }

  function normalizeSnapshot(input: KisGovernorTelemetrySnapshot): KisGovernorTelemetrySnapshot {
    const recent = input.recent.slice(-capacity).map(sanitizeEvent);
    return {
      capacity,
      eventCount: recent.length,
      recent,
    };
  }

  return { load, save, snapshot };
}

function emptySnapshot(capacity: number): KisGovernorTelemetrySnapshot {
  return { capacity, eventCount: 0, recent: [] };
}

function sanitizeEvent(event: KisGovernorTelemetryEvent): KisGovernorTelemetryEvent {
  return {
    atMs: event.atMs,
    event: event.event,
    profileId: event.profileId,
    endpointClass: event.endpointClass,
    priorityClass: event.priorityClass,
    state: event.state,
    throttleCode: event.throttleCode,
    recoveryAttemptCount: event.recoveryAttemptCount,
    observedRecoveryMs: event.observedRecoveryMs,
    currentAllowedRps: event.currentAllowedRps,
    minStartGapMs: event.minStartGapMs,
    maxInFlight: event.maxInFlight,
  };
}

function isMissingFile(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
