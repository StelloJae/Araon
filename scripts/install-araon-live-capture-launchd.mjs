#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'io.github.stellojae.araon.live-capture';
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scriptPath = resolve(repoRoot, 'scripts/capture-araon-live-assets.mjs');
const launchAgentsDir = resolve(homedir(), 'Library/LaunchAgents');
const logDir = resolve(homedir(), 'Library/Logs/Araon');
const outputDir = resolve(homedir(), 'Pictures/Araon Live Captures');
const plistPath = resolve(launchAgentsDir, `${LABEL}.plist`);
const guiTarget = `gui/${process.getuid()}`;

const schedule = [
  { hour: 8, minute: 2, purpose: 'preopen dashboard' },
  { hour: 9, minute: 3, purpose: 'open dashboard' },
  { hour: 9, minute: 10, purpose: 'surge watch' },
  { hour: 15, minute: 35, purpose: 'aftermarket dashboard' },
];

function run(cmd, args, allowFailure = false) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function calendarIntervals() {
  const entries = [];
  for (const day of [1, 2, 3, 4, 5]) {
    for (const item of schedule) {
      entries.push(`    <dict>
      <key>Weekday</key>
      <integer>${day}</integer>
      <key>Hour</key>
      <integer>${item.hour}</integer>
      <key>Minute</key>
      <integer>${item.minute}</integer>
    </dict>`);
    }
  }
  return entries.join('\n');
}

function plist() {
  const node = process.env.ARAON_CAPTURE_NODE || resolveNodePath();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(node)}</string>
    <string>${xmlEscape(scriptPath)}</string>
    <string>--phase</string>
    <string>auto</string>
    <string>--url</string>
    <string>http://127.0.0.1:5173/</string>
    <string>--out</string>
    <string>${xmlEscape(outputDir)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(repoRoot)}</string>
  <key>StartCalendarInterval</key>
  <array>
${calendarIntervals()}
  </array>
  <key>StandardOutPath</key>
  <string>${xmlEscape(resolve(logDir, 'live-capture.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(resolve(logDir, 'live-capture.err.log'))}</string>
</dict>
</plist>
`;
}

function resolveNodePath() {
  const which = spawnSync('which', ['node'], { encoding: 'utf8' });
  const candidate = which.status === 0 ? which.stdout.trim() : '';
  if (candidate !== '') return candidate;
  return process.execPath;
}

function uninstall() {
  run('launchctl', ['bootout', guiTarget, plistPath], true);
  rmSync(plistPath, { force: true });
  console.log(JSON.stringify({ ok: true, action: 'uninstalled', label: LABEL, plistPath }, null, 2));
}

function install() {
  if (!existsSync(scriptPath)) {
    throw new Error(`Capture script not found: ${scriptPath}`);
  }
  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(plistPath, plist());
  run('plutil', ['-lint', plistPath]);
  run('launchctl', ['bootout', guiTarget, plistPath], true);
  run('launchctl', ['bootstrap', guiTarget, plistPath]);
  run('launchctl', ['enable', `${guiTarget}/${LABEL}`], true);

  console.log(JSON.stringify({
    ok: true,
    action: 'installed',
    label: LABEL,
    plistPath,
    outputDir,
    logs: {
      stdout: resolve(logDir, 'live-capture.out.log'),
      stderr: resolve(logDir, 'live-capture.err.log'),
    },
    schedule: schedule.map((item) => ({
      kst: `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`,
      purpose: item.purpose,
      weekdays: 'Mon-Fri',
    })),
  }, null, 2));
}

if (process.argv.includes('--help')) {
  console.log(`Install Araon live capture launchd schedule.

Usage:
  node scripts/install-araon-live-capture-launchd.mjs
  node scripts/install-araon-live-capture-launchd.mjs --uninstall
`);
  process.exit(0);
}

try {
  if (process.argv.includes('--uninstall')) uninstall();
  else install();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
}
