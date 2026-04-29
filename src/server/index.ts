import { createChildLogger } from '@shared/logger.js';
import { SERVER_PORT } from '@shared/constants.js';
import { startAraonServer } from './app.js';

async function main(): Promise<void> {
  await startAraonServer({
    host: '127.0.0.1',
    port: SERVER_PORT,
    registerProcessShutdown: true,
  });
}

const log = createChildLogger('server');

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.message : String(err) }, 'server bootstrap failed');
  process.exit(1);
});
