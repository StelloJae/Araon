import { rm } from 'node:fs/promises';
import { join } from 'node:path';

export const RESET_DATA_CONFIRMATION = 'DELETE_LOCAL_ARAON_DATA';

export interface ResetSessionResult {
  removed: boolean;
}

export async function resetTossSession(dataDir: string): Promise<ResetSessionResult> {
  const path = join(dataDir, 'toss-session.enc');
  let removed = true;
  await rm(path, { force: true }).catch((err: unknown) => {
    removed = false;
    throw err;
  });
  return { removed };
}

export async function resetAraonData(dataDir: string, confirm: string | undefined): Promise<{ removed: true }> {
  if (confirm !== RESET_DATA_CONFIRMATION) {
    throw new Error(`reset --data requires --confirm ${RESET_DATA_CONFIRMATION}`);
  }
  await rm(dataDir, { recursive: true, force: true });
  return { removed: true };
}
