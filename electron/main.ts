import { app, BrowserWindow, dialog, shell, type BrowserWindowConstructorOptions } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AraonStartedServer } from '../src/server/app.js';

let mainWindow: BrowserWindow | null = null;
let server: AraonStartedServer | null = null;
let isQuitting = false;

function getLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'electron.log');
}

async function writeLog(message: string, err?: unknown): Promise<void> {
  const logPath = getLogPath();
  await mkdir(join(app.getPath('userData'), 'logs'), { recursive: true });
  const suffix = err instanceof Error ? ` ${err.stack ?? err.message}` : err === undefined ? '' : ` ${String(err)}`;
  await appendFile(logPath, `${new Date().toISOString()} ${message}${suffix}\n`, 'utf8');
}

function getStaticDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), 'dist', 'client');
  }
  return resolve(process.cwd(), 'dist', 'client');
}

function getMigrationsDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), 'src', 'server', 'db', 'migrations');
  }
  return resolve(process.cwd(), 'src', 'server', 'db', 'migrations');
}

function getIconPath(): string | undefined {
  const iconPath = app.isPackaged
    ? join(app.getAppPath(), 'public', 'favicon.png')
    : resolve(process.cwd(), 'public', 'favicon.png');
  return existsSync(iconPath) ? iconPath : undefined;
}

async function startServer(): Promise<AraonStartedServer> {
  process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'production';
  process.env['ARAON_DESKTOP'] = '1';
  process.env['ARAON_MIGRATIONS_DIR'] = getMigrationsDir();

  const { startAraonServer } = await import('../src/server/app.js');
  return startAraonServer({
    host: '127.0.0.1',
    port: 0,
    dataDir: join(app.getPath('userData'), 'data'),
    serveStaticClient: true,
    staticDir: getStaticDir(),
  });
}

async function createMainWindow(url: string): Promise<BrowserWindow> {
  const icon = getIconPath();
  const options: BrowserWindowConstructorOptions = {
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Araon',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (icon !== undefined) {
    options.icon = icon;
  }

  const win = new BrowserWindow(options);

  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  await win.loadURL(url);
  return win;
}

async function bootstrap(): Promise<void> {
  server = await startServer();
  mainWindow = await createMainWindow(server.url);
  await writeLog(`Araon desktop started at ${server.url}`);
}

async function shutdown(): Promise<void> {
  if (server !== null) {
    const current = server;
    server = null;
    await current.close();
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null && server !== null) {
    void createMainWindow(server.url).then((win) => {
      mainWindow = win;
    });
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', (event) => {
  if (isQuitting && server !== null) {
    event.preventDefault();
    void shutdown()
      .then(() => {
        app.exit(0);
      })
      .catch((err: unknown) => {
        void writeLog('Araon desktop shutdown failed', err).finally(() => {
          app.exit(1);
        });
      });
  }
});

process.on('uncaughtException', (err) => {
  void writeLog('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  void writeLog('unhandledRejection', reason);
});

void app.whenReady()
  .then(bootstrap)
  .catch((err: unknown) => {
    void writeLog('Araon desktop failed to start', err);
    void dialog.showErrorBox(
      'Araon failed to start',
      err instanceof Error ? err.message : String(err),
    );
    app.exit(1);
  });
