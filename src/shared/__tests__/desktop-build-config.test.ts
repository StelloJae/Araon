import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
);

describe('desktop build configuration', () => {
  it('builds Windows desktop artifacts for x64 users by default', () => {
    expect(packageJson.scripts['dist:win']).toContain('--x64');
    expect(packageJson.build.win.target).toEqual([
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ]);
  });

  it('uses unambiguous Windows artifact names for GitHub release assets', () => {
    expect(packageJson.build.nsis.artifactName).toBe('${productName}-Setup-${version}-${arch}.${ext}');
    expect(packageJson.build.portable.artifactName).toBe('${productName}-${version}-${arch}-portable.${ext}');
  });
});
