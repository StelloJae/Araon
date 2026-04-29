import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

type SpawnFn = (command: string, args: string[], options: { detached: boolean; stdio: 'ignore' }) => Pick<ChildProcess, 'once' | 'unref'>;

export interface OpenBrowserDeps {
  platform?: NodeJS.Platform;
  spawn?: SpawnFn;
}

export interface OpenBrowserResult {
  opened: boolean;
  error?: string;
}

export async function openBrowser(url: string, deps: OpenBrowserDeps = {}): Promise<OpenBrowserResult> {
  const platform = deps.platform ?? process.platform;
  const spawn = deps.spawn ?? nodeSpawn;
  const [command, args] = commandForPlatform(platform, url);

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', (err: Error) => {
      if (settled) return;
      settled = true;
      resolve({ opened: false, error: err.message });
    });
    child.once('exit', (code: number | null) => {
      if (settled) return;
      settled = true;
      if (code === 0 || code === null) {
        resolve({ opened: true });
      } else {
        resolve({ opened: false, error: `${command} exited with code ${code}` });
      }
    });
    child.unref?.();
  });
}

function commandForPlatform(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}
