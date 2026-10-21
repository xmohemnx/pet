import { it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('يكشف سرًا منسوخًا إلى public دون طباعته', () => {
  const file = `apps/web/public/security-canary-${randomUUID()}.txt`;
  const secret = randomBytes(48).toString('base64url');
  try {
    writeFileSync(file, secret);
    const result = spawnSync(process.execPath, ['scripts/security-check.mjs'], {
      env: { ...process.env, BETTER_AUTH_SECRET: secret },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Runtime credential');
    expect(result.stderr + result.stdout).not.toContain(secret);
  } finally {
    rmSync(file, { force: true });
  }
});

it('يكشف env مضافًا بالقوة إلى فهرس Git معزول', () => {
  const directory = mkdtempSync(join(tmpdir(), 'petra-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index') };
  try {
    // Use a private, unrelated index; the real staging area is untouched.
    const add = spawnSync('git', ['add', '--force', '.env.example'], { env });
    expect(add.status).toBe(0);
    const contents = 'APP_ENV=local\n';
    const hash = spawnSync('git', ['hash-object', '-w', '--stdin'], {
      env,
      input: contents,
      encoding: 'utf8',
    });
    expect(hash.status).toBe(0);
    const stage = spawnSync(
      'git',
      [
        'update-index',
        '--add',
        '--cacheinfo',
        `100644,${hash.stdout.trim()},.env.staging`,
      ],
      { env },
    );
    expect(stage.status).toBe(0);
    const result = spawnSync(process.execPath, ['scripts/security-check.mjs'], {
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Forbidden source file: .env.staging');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('يكشف سراً ثنائياً في فهرس Git مع نسخة عمل نظيفة دون طباعة السر', () => {
  const directory = mkdtempSync(join(tmpdir(), 'petra-staged-'));
  const file = `security-staged-${randomUUID()}.txt`;
  const secret = randomBytes(48).toString('base64url');
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(directory, 'index'),
    BETTER_AUTH_SECRET: secret,
  };
  try {
    const content = Buffer.concat([
      Buffer.from([0, 255, 10]),
      Buffer.from(secret),
      Buffer.from([0, 10]),
    ]);
    const hash = spawnSync('git', ['hash-object', '-w', '--stdin'], {
      env,
      input: content,
      encoding: 'utf8',
    });
    expect(hash.status).toBe(0);
    const stage = spawnSync(
      'git',
      [
        'update-index',
        '--add',
        '--cacheinfo',
        `100644,${hash.stdout.trim()},${file}`,
      ],
      { env },
    );
    expect(stage.status).toBe(0);
    writeFileSync(file, 'clean working tree content');
    const result = spawnSync(process.execPath, ['scripts/security-check.mjs'], {
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Runtime credential copied into staged source: ${file}`,
    );
    expect(result.stderr + result.stdout).not.toContain(secret);
  } finally {
    rmSync(file, { force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});
