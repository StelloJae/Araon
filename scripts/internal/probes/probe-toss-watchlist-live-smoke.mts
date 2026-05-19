import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { configureDataDir } from '../../../src/server/runtime-paths.js';
import { createFileTossSessionStore } from '../../../src/server/toss/toss-session-store.js';
import { createTossWatchlistClient } from '../../../src/server/toss/toss-watchlist-client.js';
import { runTossWatchlistLiveSmoke } from '../../../src/server/toss/toss-watchlist-live-smoke.js';

const CONFIRM_TEXT = 'LIVE_TOSS_WATCHLIST_SMOKE';

const { values } = parseArgs({
  options: {
    approved: { type: 'boolean', default: false },
    confirm: { type: 'string' },
    'data-dir': { type: 'string' },
    out: { type: 'string' },
  },
});

if (typeof values['data-dir'] === 'string' && values['data-dir'].length > 0) {
  configureDataDir(values['data-dir']);
}

const mutationApproved = values.approved === true && values.confirm === CONFIRM_TEXT;
const sessionStore = createFileTossSessionStore();
const client = createTossWatchlistClient({ sessionStore });
const report = await runTossWatchlistLiveSmoke({
  client,
  mutationApproved,
});
const json = `${JSON.stringify(report, null, 2)}\n`;

if (typeof values.out === 'string' && values.out.length > 0) {
  await writeFile(values.out, json, 'utf8');
}

console.log(json);
if (!report.ok) process.exitCode = 1;
