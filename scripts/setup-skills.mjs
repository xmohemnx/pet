import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  root,
  runtime,
  launcher,
  chromeLauncher,
  environment,
  engineVersion,
  vercelEntry,
  vercelVersion,
  installedVercelVersion,
} from './skill-tools.mjs';

if (process.platform === 'win32')
  throw new Error('Use a Linux/WSL or macOS terminal for this setup command');
mkdirSync(runtime, { recursive: true, mode: 0o700 });
if (realpathSync(runtime) !== runtime)
  throw new Error('Skill runtime directory must not use symlinks');
chmodSync(runtime, 0o700);
chmodSync(launcher, statSync(launcher).mode | 0o100);
chmodSync(chromeLauncher, statSync(chromeLauncher).mode | 0o100);
// The vendored launcher downloads its VERSION and verifies the SHA-256 sidecar.
// Binaries and npm dependencies stay in ignored private storage, outside source.
const engine = spawnSync(launcher, ['engine-probe'], {
  cwd: root,
  env: environment,
  encoding: 'utf8',
  timeout: 180_000,
});
if (
  engine.status !== 0 ||
  engine.stdout?.trim() !== `impeccable-engine ${engineVersion}`
)
  throw new Error(
    'Impeccable setup failed; check approved network access to its GitHub release',
  );
console.log(`Impeccable ${engineVersion} verified.`);
if (installedVercelVersion() !== vercelVersion || !existsSync(vercelEntry)) {
  const install = spawnSync(
    'npm',
    [
      'install',
      '--prefix',
      join(runtime, 'vercel'),
      '--no-audit',
      '--no-fund',
      '--save-exact',
      `vercel@${vercelVersion}`,
    ],
    { cwd: root, env: environment, stdio: 'inherit', timeout: 240_000 },
  );
  if (install.status !== 0) throw new Error('Vercel CLI installation failed');
}
console.log(
  `Vercel CLI ${vercelVersion} installed. Account authentication is a separate step.`,
);
