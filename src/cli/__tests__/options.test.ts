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

  it('prints command-specific help', () => {
    expect(parseAraonCliArgs(['doctor', '--help'], { version: '1.2.3' })).toMatchObject({
      kind: 'help',
      text: expect.stringContaining('araon doctor'),
    });
    expect(parseAraonCliArgs(['status', '--help'], { version: '1.2.3' })).toMatchObject({
      kind: 'help',
      text: expect.stringContaining('araon status'),
    });
    expect(parseAraonCliArgs(['open', '--help'], { version: '1.2.3' })).toMatchObject({
      kind: 'help',
      text: expect.stringContaining('araon open'),
    });
    expect(parseAraonCliArgs(['reset', '--help'], { version: '1.2.3' })).toMatchObject({
      kind: 'help',
      text: expect.stringContaining('araon reset'),
    });
  });

  it('parses no-live operational subcommands', () => {
    expect(parseAraonCliArgs(['doctor', '--no-live', '--json', '--data-dir', '/tmp/araon-data'], { version: '1.2.3' }))
      .toEqual({
        kind: 'doctor',
        dataDir: '/tmp/araon-data',
        json: true,
        noLive: true,
      });

    expect(parseAraonCliArgs(['status', '--json'], { version: '1.2.3' })).toEqual({
      kind: 'status',
      dataDir: undefined,
      json: true,
    });

    expect(parseAraonCliArgs(['open', '--data-dir', '/tmp/araon-data'], { version: '1.2.3' })).toEqual({
      kind: 'open',
      dataDir: '/tmp/araon-data',
    });

    expect(parseAraonCliArgs(['reset', '--session'], { version: '1.2.3' })).toEqual({
      kind: 'reset',
      dataDir: undefined,
      target: 'session',
      confirm: undefined,
    });

    expect(parseAraonCliArgs([
      'reset',
      '--data',
      '--confirm',
      'DELETE_LOCAL_ARAON_DATA',
    ], { version: '1.2.3' })).toEqual({
      kind: 'reset',
      dataDir: undefined,
      target: 'data',
      confirm: 'DELETE_LOCAL_ARAON_DATA',
    });
  });

  it('rejects invalid operational subcommand flags', () => {
    expect(() => parseAraonCliArgs(['doctor', '--live'], { version: '1.2.3' }))
      .toThrow(/Unknown option/);
    expect(() => parseAraonCliArgs(['status', '--port', '3910'], { version: '1.2.3' }))
      .toThrow(/Unknown option/);
    expect(() => parseAraonCliArgs(['reset'], { version: '1.2.3' }))
      .toThrow(/reset requires --session or --data/);
    expect(() => parseAraonCliArgs(['reset', '--session', '--data'], { version: '1.2.3' }))
      .toThrow(/Choose only one reset target/);
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
