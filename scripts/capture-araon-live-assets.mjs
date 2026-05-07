#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'http://127.0.0.1:5173/';
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 1000;
const DEFAULT_PORT = 9222;
const DEFAULT_PROFILE = '/tmp/araon-chrome-live-capture-profile';
const DEFAULT_OUT = join(homedir(), 'Pictures', 'Araon Live Captures');
const LOCK_PATH = '/tmp/araon-live-capture.lock';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    phase: 'auto',
    url: DEFAULT_URL,
    out: DEFAULT_OUT,
    port: DEFAULT_PORT,
    profile: DEFAULT_PROFILE,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    monitorMs: 30 * 60_000,
    monitorIntervalMs: 15_000,
    noVideo: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const read = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };
    if (arg === '--phase') out.phase = read();
    else if (arg === '--url') out.url = read();
    else if (arg === '--out') out.out = read();
    else if (arg === '--port') out.port = Number(read());
    else if (arg === '--profile') out.profile = read();
    else if (arg === '--width') out.width = Number(read());
    else if (arg === '--height') out.height = Number(read());
    else if (arg === '--monitor-ms') out.monitorMs = Number(read());
    else if (arg === '--monitor-interval-ms') out.monitorIntervalMs = Number(read());
    else if (arg === '--no-video') out.noVideo = true;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Araon live marketing capture

Usage:
  node scripts/capture-araon-live-assets.mjs [options]

Options:
  --phase <auto|preopen|open|surge-watch|aftermarket|manual>
  --url <url>                         Default: ${DEFAULT_URL}
  --out <dir>                         Default: ${DEFAULT_OUT}
  --port <port>                       Chrome remote-debugging port
  --profile <dir>                     Temporary Chrome profile
  --monitor-ms <ms>                   surge-watch max wait
  --monitor-interval-ms <ms>          surge-watch polling interval
  --no-video                          Capture PNGs only
`);
}

function todayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function kstTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: value('hour'), minute: value('minute'), second: value('second') };
}

function resolvePhase(phase, date = new Date()) {
  if (phase !== 'auto') return phase;
  const { hour, minute } = kstTimeParts(date);
  const minutes = hour * 60 + minute;
  if (minutes >= 8 * 60 && minutes < 9 * 60) return 'preopen';
  if (minutes >= 9 * 60 + 10 && minutes < 10 * 60 + 45) return 'surge-watch';
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) return 'open';
  if (minutes >= 15 * 60 + 30 && minutes < 20 * 60 + 5) return 'aftermarket';
  return 'manual';
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return res.json();
}

async function waitForChrome(port, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (err) {
      lastError = err;
      await sleep(300);
    }
  }
  throw new Error(`Chrome remote debugging did not become ready: ${lastError?.message ?? 'unknown'}`);
}

async function getPageTarget(port, url) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const match = targets.find((t) => t.type === 'page' && t.url?.startsWith(url));
  if (match) return match;
  const created = await fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  return created;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.seq = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error('CDP websocket timeout')), 10_000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener('error', (event) => {
        clearTimeout(timer);
        rejectOpen(new Error(`CDP websocket error: ${event.message ?? 'unknown'}`));
      }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
      else entry.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = this.seq;
    this.seq += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, method });
    });
  }

  close() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.close();
  }
}

function spawnChrome(args) {
  const child = spawn('open', ['-na', 'Google Chrome', '--args', ...args], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

function killCaptureChrome(profile) {
  spawn('pkill', ['-f', profile], { stdio: 'ignore' });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  return result.result.value;
}

async function waitForApp(cdp, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await evaluate(cdp, `Boolean(document.body && document.body.innerText.length > 20)`);
    if (ready) return;
    await sleep(500);
  }
  throw new Error('Araon UI did not render in time');
}

async function capture(cdp, path) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  writeFileSync(path, Buffer.from(result.data, 'base64'));
}

async function clickFirstStockRow(cdp) {
  return evaluate(cdp, `
    (() => {
      const rows = Array.from(document.querySelectorAll('[data-stock-row]'));
      const visible = rows.find((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 20 && box.height > 10 && box.top >= 0 && box.top < window.innerHeight;
      });
      if (!visible) return null;
      visible.scrollIntoView({ block: 'center', inline: 'nearest' });
      visible.click();
      return visible.getAttribute('data-stock-row') || visible.textContent?.slice(0, 80) || null;
    })()
  `);
}

async function clickButtonByText(cdp, text) {
  return evaluate(cdp, `
    (() => {
      const text = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, [role="tab"], select, a'));
      const match = nodes.find((el) => (el.innerText || el.textContent || '').trim() === text);
      if (!match) return false;
      match.click();
      return true;
    })()
  `);
}

async function scrollModal(cdp, ratio) {
  await evaluate(cdp, `
    (() => {
      const candidates = Array.from(document.querySelectorAll('div')).filter((el) => {
        const style = getComputedStyle(el);
        return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 100;
      });
      const el = candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement;
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) * ${ratio});
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    })()
  `);
}

async function readDashboardSummary(cdp) {
  return evaluate(cdp, `
    (() => {
      const body = document.body.innerText;
      const recent = body.match(/최근 급상승\\s*10~30초\\s*(대기|\\d+종목)/);
      const status = body.match(/(장전|장중|장후|LIVE|SNAPSHOT|프리마켓|애프터마켓)/);
      return {
        textSample: body.slice(0, 500),
        recentSurge: recent ? recent[1] : null,
        marketHint: status ? status[1] : null,
        secretsVisible: /appKey|appSecret|accessToken|approvalKey|계좌|토큰|앱시크릿/i.test(body),
      };
    })()
  `);
}

async function detectSurgeCount(cdp) {
  const value = await evaluate(cdp, `
    (() => {
      const body = document.body.innerText;
      const match = body.match(/최근 급상승\\s*10~30초\\s*(\\d+)종목/);
      return match ? Number(match[1]) : 0;
    })()
  `);
  return typeof value === 'number' ? value : 0;
}

async function runFfmpeg(dir, phase, files) {
  const listPath = join(dir, 'frames.txt');
  const list = files.map((file) => `file '${file.replaceAll("'", "'\\''")}'\nduration 1.6`).join('\n');
  writeFileSync(listPath, `${list}\nfile '${files.at(-1).replaceAll("'", "'\\''")}'\n`);
  const mp4 = join(dir, `araon-${phase}-flow.mp4`);
  const gif = join(dir, `araon-${phase}-flow.gif`);

  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-vf', 'scale=1200:-2,fps=2',
    '-pix_fmt', 'yuv420p',
    mp4,
  ]);
  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-vf', 'scale=900:-2,fps=2',
    gif,
  ]);
  return { mp4, gif };
}

function runCommand(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} failed with ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function ensureLock() {
  if (existsSync(LOCK_PATH)) {
    const ageMs = Date.now() - Number(readFileSyncNumber(LOCK_PATH));
    if (Number.isFinite(ageMs) && ageMs < 90 * 60_000) {
      throw new Error(`Another Araon capture appears to be running: ${LOCK_PATH}`);
    }
  }
  writeFileSync(LOCK_PATH, String(Date.now()));
}

function readFileSyncNumber(path) {
  try {
    return Number(readFileSync(path, 'utf8'));
  } catch {
    return 0;
  }
}

function removeLock() {
  try {
    rmSync(LOCK_PATH, { force: true });
  } catch {
    // best effort
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const phase = resolvePhase(args.phase);
  const dateKey = todayKey();
  const outDir = resolve(args.out, dateKey, phase);
  mkdirSync(outDir, { recursive: true });

  ensureLock();
  const chromeArgs = [
    `--remote-debugging-port=${args.port}`,
    `--user-data-dir=${args.profile}`,
    `--window-size=${args.width},${args.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    args.url,
  ];

  const frames = [];
  const manifest = {
    phase,
    dateKey,
    startedAt: new Date().toISOString(),
    kst: kstTimeParts(),
    url: args.url,
    outDir,
    selectedTicker: null,
    surgeDetected: false,
    screenshots: [],
    video: null,
    gif: null,
    notes: [],
  };

  let cdp = null;
  try {
    spawnChrome(chromeArgs);
    await waitForChrome(args.port);
    const target = await getPageTarget(args.port, args.url);
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.bringToFront');
    await waitForApp(cdp);
    await sleep(1500);

    if (phase === 'surge-watch') {
      const deadline = Date.now() + args.monitorMs;
      while (Date.now() < deadline) {
        const count = await detectSurgeCount(cdp);
        if (count > 0) {
          manifest.surgeDetected = true;
          manifest.notes.push(`recent surge detected: ${count}`);
          break;
        }
        await sleep(args.monitorIntervalMs);
      }
      if (!manifest.surgeDetected) {
        manifest.notes.push('recent surge was not observed during monitor window; captured dashboard fallback');
      }
    }

    const dashboardPath = join(outDir, `01-${phase}-dashboard.png`);
    await capture(cdp, dashboardPath);
    frames.push(dashboardPath);
    manifest.screenshots.push(dashboardPath);
    manifest.dashboard = await readDashboardSummary(cdp);

    manifest.selectedTicker = await clickFirstStockRow(cdp);
    if (manifest.selectedTicker === null) {
      manifest.notes.push('No stock row was visible; detail modal captures skipped.');
    } else {
      await sleep(1200);
      const realtimePath = join(outDir, `02-${phase}-stock-realtime.png`);
      await capture(cdp, realtimePath);
      frames.push(realtimePath);
      manifest.screenshots.push(realtimePath);

      await clickButtonByText(cdp, '차트');
      await sleep(1800);
      const chartPath = join(outDir, `03-${phase}-stock-chart.png`);
      await capture(cdp, chartPath);
      frames.push(chartPath);
      manifest.screenshots.push(chartPath);

      await scrollModal(cdp, 0.75);
      await sleep(1200);
      const newsPath = join(outDir, `04-${phase}-news-disclosures.png`);
      await capture(cdp, newsPath);
      frames.push(newsPath);
      manifest.screenshots.push(newsPath);
    }

    if (!args.noVideo && frames.length >= 2) {
      try {
        const video = await runFfmpeg(outDir, phase, frames);
        manifest.video = video.mp4;
        manifest.gif = video.gif;
      } catch (err) {
        manifest.notes.push(`video generation failed: ${err.message}`);
      }
    }

    manifest.finishedAt = new Date().toISOString();
    writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: true,
      phase,
      outDir,
      screenshots: manifest.screenshots.map((p) => basename(p)),
      video: manifest.video ? basename(manifest.video) : null,
      gif: manifest.gif ? basename(manifest.gif) : null,
      surgeDetected: manifest.surgeDetected,
      selectedTicker: manifest.selectedTicker,
    }, null, 2));
  } finally {
    cdp?.close();
    killCaptureChrome(args.profile);
    removeLock();
  }
}

main().catch((err) => {
  removeLock();
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
