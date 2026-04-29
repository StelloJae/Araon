import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const cli = resolve(root, 'node_modules', 'electron-builder', 'cli.js');
const inputArgs = process.argv.slice(2);
const hasPublishArg = inputArgs.some((arg) => arg === '--publish' || arg.startsWith('--publish='));
const args = hasPublishArg ? inputArgs : [...inputArgs, '--publish=never'];

const child = spawn(process.execPath, [cli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
});

function restoreNodeNativeModules(originalCode) {
  if (process.env.CI === 'true') {
    process.exit(originalCode);
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const restore = spawn(npmCommand, ['rebuild', 'better-sqlite3'], {
    cwd: root,
    stdio: 'inherit',
  });

  restore.on('exit', (code, signal) => {
    if (signal !== null) {
      process.kill(process.pid, signal);
      return;
    }
    if (originalCode === 0 && code !== 0) {
      process.exit(code ?? 1);
      return;
    }
    process.exit(originalCode);
  });
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  restoreNodeNativeModules(code ?? 1);
});
