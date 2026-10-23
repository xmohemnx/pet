import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const runtime = join(root, '.data/skill-runtime');
export const vercelVersion = '65.2.0';
export const launcher = join(
  root,
  '.agents/skills/impeccable/scripts/impeccable',
);
export const chromeLauncher = join(root, 'scripts/skill-chromium.sh');
export const engineVersion = readFileSync(
  join(launcher, '../VERSION'),
  'utf8',
).trim();
export const vercelPackage = join(
  runtime,
  'vercel/node_modules/vercel/package.json',
);
export const vercelEntry = join(
  runtime,
  'vercel/node_modules/vercel/dist/vc.js',
);
export const environment = {
  ...process.env,
  IMPECCABLE_HOME: join(runtime, 'impeccable'),
  PATH: [
    join(runtime, 'vercel/node_modules/.bin'),
    join(runtime, 'impeccable/bin', engineVersion),
    process.env.PATH || '',
  ].join(delimiter),
  VERCEL_TELEMETRY_DISABLED: '1',
  DO_NOT_TRACK: '1',
  NO_UPDATE_NOTIFIER: '1',
  PETRA_SKILLS_CHROME:
    (process.env.CHROME_PATH !== chromeLauncher && process.env.CHROME_PATH) ||
    process.env.PETRA_SKILLS_CHROME ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    '',
  CHROME_PATH: chromeLauncher,
};

export function installedVercelVersion() {
  try {
    return JSON.parse(readFileSync(vercelPackage, 'utf8')).version;
  } catch {
    return null;
  }
}

export function command(tool, args) {
  if (tool === 'run') {
    if (!args[0]) throw new Error('Provide an executable for skills:run');
    return [args[0], args.slice(1)];
  }
  if (tool === 'impeccable') return [launcher, args];
  if (tool === 'vercel')
    return [process.execPath, ['--use-env-proxy', vercelEntry, ...args]];
  throw new Error('Unknown skill tool');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tool = process.argv[2];
  if (!['vercel', 'impeccable', 'run'].includes(tool))
    throw new Error('Select vercel, impeccable or run');
  if (tool === 'vercel' && !existsSync(vercelEntry))
    throw new Error('Run pnpm skills:setup first');
  const [executable, args] = command(tool, process.argv.slice(3));
  const result = spawnSync(executable, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error)
    console.error('Skill tool could not start; run pnpm skills:setup');
  process.exitCode = result.status ?? 1;
}
