import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];
const forbidden = (path) =>
  path
    .split('/')
    .some(
      (part) =>
        (/^\.env/i.test(part) && part !== '.env.example') ||
        ['.git', '.data', '.aws', '.ssh'].includes(part) ||
        /\.(pem|key|sql\.gz|dump|bak|sqlite)$/i.test(part),
    );
const envPath = join(root, '.env');
let settings = {};
if (existsSync(envPath)) {
  const stat = lstatSync(envPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    failures.push('Local .env must be a regular file with mode 0600');
  else settings = parseEnv(readFileSync(envPath, 'utf8'));
}
const secrets = [
  ...new Set(
    Object.entries({ ...settings, ...process.env })
      .filter(
        ([key, value]) =>
          /SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|REDIS_URL|SMTP_USER/.test(
            key,
          ) &&
          value &&
          value.length >= 12 &&
          value !==
            'postgresql://petra:petra_local_only@127.0.0.1:5432/petra_dev' &&
          value !== 'redis://127.0.0.1:6379',
      )
      .map(([, value]) => value),
  ),
];
const candidates = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root },
    )
      .toString()
      .split('\0')
      .filter(Boolean),
  ),
];
const indexed = new Set(
  execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean),
);
for (const path of candidates) {
  if (forbidden(path)) failures.push(`Forbidden source file: ${path}`);
  if (indexed.has(path)) {
    const staged = execFileSync('git', ['show', `:${path}`], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (secrets.some((secret) => staged.includes(Buffer.from(secret))))
      failures.push(`Runtime credential copied into staged source: ${path}`);
  }
  const file = join(root, path);
  if (!existsSync(file)) continue;
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) {
    failures.push(`Source symlink requires removal: ${path}`);
    continue;
  }
  if (!stat.isFile()) continue;
  const content = readFileSync(file);
  // The example contains explicitly public local DSNs; signing secrets are still forbidden.
  if (
    secrets.some(
      (secret) =>
        content.includes(Buffer.from(secret)) &&
        !(
          path === '.env.example' &&
          secret.includes('petra_local_only@127.0.0.1')
        ),
    )
  )
    failures.push(`Runtime credential copied into source: ${path}`);
}
function scan(directory, built = false) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name),
      path = relative(root, file);
    if (entry.isSymbolicLink()) {
      failures.push(`Public symlink: ${path}`);
      continue;
    }
    if (forbidden(path)) failures.push(`Sensitive public/build path: ${path}`);
    if (entry.isDirectory()) scan(file, built);
    else {
      if (built && entry.name.endsWith('.map'))
        failures.push(`Browser source map: ${path}`);
      const bytes = readFileSync(file);
      if (secrets.some((secret) => bytes.includes(Buffer.from(secret))))
        failures.push(`Runtime credential exposed in browser asset: ${path}`);
    }
  }
}
scan(join(root, 'apps/web/public'));
if (process.argv.includes('--built')) {
  const directory = resolve(root, 'apps/web/.next/static');
  if (!existsSync(directory))
    failures.push('Build the web application before checking browser assets');
  else scan(directory, true);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Security file checks passed: private env, source, public assets' +
      (process.argv.includes('--built') ? ', and built browser assets.' : '.'),
  );
