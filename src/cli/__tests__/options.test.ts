import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildHelpText,
  getDefaultCliDataDir,
  parseAraonCliArgs,
  resolveCliDataDir,
} from '../options.js';

describe('parseAraonCliArgs', () => {
  it('defaults to localhost, an auto-selected port, browser open, and heartbeat off', () => {
    const parsed = parseAraonCliArgs([], { version: '1.2.3' });

    expect(parsed).toEqual({
      kind: 'run',
      host: '127.0.0.1',
      port: 0,
      openBrowser: true,
      exitWhenBrowserCloses: false,
      logLevel: undefined,
      dataDir: undefined,
    });
  });

  it('parses supported run flags', () => {
    const parsed = parseAraonCliArgs([
      '--no-open',
      '--port',
      '3910',
      '--host',
      '127.0.0.1',
      '--data-dir',
      '/tmp/araon-data',
      '--log-level',
      'debug',
    ], { version: '1.2.3' });

    expect(parsed).toEqual({
      kind: 'run',
      host: '127.0.0.1',
      port: 3910,
      openBrowser: false,
      exitWhenBrowserCloses: false,
      logLevel: 'debug',
      dataDir: '/tmp/araon-data',
    });
  });

  it('rejects invalid host, port, and browser-close combinations', () => {
    expect(() => parseAraonCliArgs(['--host', '0.0.0.0'], { version: '1.2.3' }))
      .toThrow(/Only 127\.0\.0\.1/);
    expect(() => parseAraonCliArgs(['--port', '0'], { version: '1.2.3' }))
      .toThrow(/between 1 and 65535/);
    expect(() => parseAraonCliArgs(['--no-open', '--exit-when-browser-closes'], { version: '1.2.3' }))
      .toThrow(/cannot be combined/);
  });

  it('returns help and version commands without starting the server', () => {
    expect(parseAraonCliArgs(['--help'], { version: '1.2.3' })).toEqual({
      kind: 'help',
      text: buildHelpText('1.2.3'),
    });
    expect(parseAraonCliArgs(['--version'], { version: '1.2.3' })).toEqual({
      kind: 'version',
      version: '1.2.3',
    });
  });
});

describe('resolveCliDataDir', () => {
  it('prefers flag, then environment, then OS default', () => {
    expect(resolveCliDataDir('/tmp/from-flag', { ARAON_DATA_DIR: '/tmp/from-env' })).toBe('/tmp/from-flag');
    expect(resolveCliDataDir(undefined, { ARAON_DATA_DIR: '/tmp/from-env' })).toBe('/tmp/from-env');
    expect(resolveCliDataDir(undefined, {}, { platform: 'linux', homeDir: '/home/araon' }))
      .toBe(join('/home/araon', '.local', 'share', 'araon'));
  });

  it('uses platform-specific default user data directories', () => {
    expect(getDefaultCliDataDir({ platform: 'darwin', homeDir: '/Users/me' }))
      .toBe(join('/Users/me', 'Library', 'Application Support', 'Araon'));
    expect(getDefaultCliDataDir({ platform: 'win32', homeDir: 'C:\\Users\\me', appData: 'C:\\Users\\me\\AppData\\Roaming' }))
      .toBe(join('C:\\Users\\me\\AppData\\Roaming', 'Araon'));
    expect(getDefaultCliDataDir({ platform: 'linux', homeDir: '/home/me' }))
      .toBe(join('/home/me', '.local', 'share', 'araon'));
  });
});
