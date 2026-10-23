import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import {
  root,
  launcher,
  chromeLauncher,
  environment,
  engineVersion,
  vercelVersion,
  installedVercelVersion,
  command,
} from './skill-tools.mjs';

const base = join(root, '.agents/skills');
const manifest = JSON.parse(
  readFileSync(join(base, 'INSTALLATION.json'), 'utf8'),
);
const expected = manifest.flatMap((group) => group.skills);
const failures = [];
const actual = readdirSync(base, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(base, entry.name, 'SKILL.md')),
  )
  .map((entry) => entry.name);
for (const name of expected) {
  const file = join(base, name, 'SKILL.md');
  if (!existsSync(file)) {
    failures.push(`MISSING_SKILL:${name}`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const header = text.startsWith('---\n') ? text.split('---')[1] : '';
  if (
    !/^name:\s*\S+/m.test(header) ||
    !/^description:\s*\S|^description:\s*\n\s+\S/m.test(header)
  )
    failures.push(`INVALID_HEADER:${name}`);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].trim().split(' ')[0];
    if (!target || /^[a-z]+:|^\/|^</i.test(target) || /[*{$]/.test(target))
      continue;
    if (!existsSync(resolve(dirname(file), target)))
      failures.push(`MISSING_REFERENCE:${name}:${target}`);
  }
}
for (const name of actual)
  if (!expected.includes(name)) failures.push(`UNLISTED_SKILL:${name}`);
let files = 0,
  syntaxChecks = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push('SKILL_SYMLINK');
      continue;
    }
    if (entry.isDirectory()) {
      inspect(file);
      continue;
    }
    if (!entry.isFile()) continue;
    files++;
    let executable, args;
    if (['.mjs', '.cjs'].includes(extname(file))) {
      executable = process.execPath;
      args = ['--check', file];
    } else if (extname(file) === '.sh' || file === launcher) {
      executable = file === launcher ? 'sh' : 'bash';
      args = ['-n', file];
    }
    if (executable) {
      syntaxChecks++;
      const result = spawnSync(executable, args, {
        cwd: root,
        stdio: 'ignore',
        timeout: 10_000,
      });
      if (result.status !== 0)
        failures.push(`INVALID_SCRIPT:${file.slice(base.length + 1)}`);
    }
  }
}
inspect(base);
try {
  accessSync(launcher, constants.X_OK);
} catch {
  failures.push('IMPECCABLE_EXECUTABLE_PERMISSION');
}
const engine = spawnSync(launcher, ['engine-probe'], {
  cwd: root,
  env: { ...environment, IMPECCABLE_LAUNCHER_PROBE: '1' },
  encoding: 'utf8',
  timeout: 15_000,
});
if (
  engine.status !== 0 ||
  engine.stdout?.trim() !== `impeccable-engine ${engineVersion}`
)
  failures.push('IMPECCABLE_ENGINE_NOT_READY');
const [vercel, versionArgs] = command('vercel', ['--version']);
const cli = spawnSync(vercel, versionArgs, {
  cwd: root,
  env: environment,
  encoding: 'utf8',
  timeout: 15_000,
});
if (
  cli.status !== 0 ||
  installedVercelVersion() !== vercelVersion ||
  !cli.stdout?.includes(vercelVersion)
)
  failures.push('VERCEL_CLI_NOT_READY');
let auth = 'not_checked';
const chrome = spawnSync(chromeLauncher, ['--version'], {
  cwd: root,
  env: environment,
  encoding: 'utf8',
  timeout: 15_000,
});
if (chrome.status !== 0) failures.push('CHROMIUM_NOT_READY');
if (process.argv.includes('--with-auth')) {
  const [executable, args] = command('vercel', ['whoami']);
  const result = spawnSync(executable, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 20_000,
  });
  auth =
    result.status === 0
      ? 'authenticated'
      : 'authentication_or_network_required';
  if (result.status !== 0) failures.push('VERCEL_ACCOUNT_ACCESS_REQUIRED');
}
console.log(
  JSON.stringify(
    {
      status: failures.length ? 'blocked' : 'passed',
      skills: actual.length,
      files,
      syntaxChecks,
      impeccable: engineVersion,
      vercel: vercelVersion,
      vercelAccount: auth,
      failures,
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
