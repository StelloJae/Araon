import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(command, options = {}) {
  const envPath = options.envPath ?? process.env.PATH ?? '';
  const candidates = options.candidates ?? [];
  const paths = envPath
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, command));

  for (const candidate of [command, ...paths, ...candidates].filter(Boolean)) {
    if ((isAbsolute(candidate) || candidate.includes('/')) && canExecute(candidate)) {
      return candidate;
    }
  }

  return command;
}

export function resolveFfmpegPath() {
  return resolveExecutable('ffmpeg', {
    candidates: [
      process.env.FFMPEG_PATH,
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
    ],
  });
}
