import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalEnvFile } from '../env.js';

const touchedKeys = ['ARAON_ENV_TEST_A', 'ARAON_ENV_TEST_B', 'ARAON_ENV_TEST_C'];

afterEach(() => {
  for (const key of touchedKeys) {
    delete process.env[key];
  }
});

describe('loadLocalEnvFile', () => {
  it('loads local env values without overriding existing process env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'araon-env-test-'));
    const envPath = join(dir, '.env');
    process.env['ARAON_ENV_TEST_B'] = 'already-set';
    writeFileSync(
      envPath,
      [
        '# ignored',
        'ARAON_ENV_TEST_A=alpha',
        'ARAON_ENV_TEST_B=should-not-override',
        'ARAON_ENV_TEST_C="quoted value"',
        'not valid',
      ].join('\n'),
    );

    loadLocalEnvFile(envPath);

    expect(process.env['ARAON_ENV_TEST_A']).toBe('alpha');
    expect(process.env['ARAON_ENV_TEST_B']).toBe('already-set');
    expect(process.env['ARAON_ENV_TEST_C']).toBe('quoted value');
  });

  it('ignores missing env files', () => {
    expect(() => loadLocalEnvFile(join(tmpdir(), 'does-not-exist.env'))).not.toThrow();
  });
});
