import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['scripts/test-e2e.mjs', 'social-proof.spec.ts', '--workers=1'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PETRA_CAPTURE_SOCIAL_PROOF: 'true',
      ...(!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH &&
      existsSync('/usr/bin/chromium')
        ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/usr/bin/chromium' }
        : {}),
    },
  },
);
process.exitCode = result.status ?? 1;
