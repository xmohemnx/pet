import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Export only the approved interface screens, reusing their original source.
// The normal Next/Nest application and its production build stay unchanged.
const repository = resolve('.');
const stage = resolve('work/render-static');
const web = join(stage, 'apps/web');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(web, 'app'), { recursive: true });
symlinkSync(resolve('packages'), join(stage, 'packages'), 'dir');
symlinkSync(resolve('apps/web/node_modules'), join(web, 'node_modules'), 'dir');
for (const path of [
  'components',
  'lib',
  'public',
  'package.json',
  'tsconfig.json',
])
  cpSync(resolve('apps/web', path), join(web, path), { recursive: true });
for (const path of ['page.tsx', 'globals.css', 'redesign.css'])
  cpSync(resolve('apps/web/app', path), join(web, 'app', path));
for (const path of ['login', 'register', 'recover', 'preview'])
  cpSync(resolve('apps/web/app', path), join(web, 'app', path), {
    recursive: true,
  });
let layout = readFileSync('apps/web/app/layout.tsx', 'utf8');
layout = layout
  .replace("import { headers } from 'next/headers';\n", '')
  .replace('  await headers();\n', '')
  .replace('enabled={isWebPreview()}', 'enabled={true}')
  .replace("import { isWebPreview } from '../lib/web-preview';\n", '');
writeFileSync(join(web, 'app/layout.tsx'), layout);
mkdirSync(join(web, 'app/reset-password'));
writeFileSync(
  join(web, 'app/reset-password/page.tsx'),
  'import {AuthForm} from \'../../components/auth-forms\'; export default function Page(){return <AuthForm mode="reset"/>;}\n',
);
for (const path of [
  'care',
  'care/directory',
  'marketplace',
  'taxi',
  'services',
  'grooming',
  'home-visits',
  'social',
  'adoption',
  'security',
]) {
  const target = join(web, 'app', path, 'page.tsx');
  mkdirSync(dirname(target), { recursive: true });
  let source = relative(dirname(target), join(web, 'app/preview/page'));
  if (!source.startsWith('.')) source = './' + source;
  writeFileSync(target, `export {default} from ${JSON.stringify(source)};\n`);
}
writeFileSync(
  join(web, 'next.config.mjs'),
  `export default {output:'export', trailingSlash:true, agentRules:false, images:{unoptimized:true}, transpilePackages:['@petra/contracts','@petra/ui'], turbopack:{root:${JSON.stringify(repository)}}};\n`,
);
const result = spawnSync(
  process.execPath,
  [resolve('apps/web/node_modules/next/dist/bin/next'), 'build', web],
  {
    cwd: web,
    env: {
      ...process.env,
      PETRA_WEB_PREVIEW: 'true',
      PETRA_DEMO_MODE: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  },
);
if (result.status !== 0) process.exit(result.status || 1);

const output = join(web, 'out');
function harden(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isDirectory()) harden(file);
    else if (item.name.endsWith('.html')) {
      let html = readFileSync(file, 'utf8');
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter((match) => match[1])
        .map(
          (match) =>
            "'sha256-" +
            createHash('sha256').update(match[1]).digest('base64') +
            "'",
        );
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${[...new Set(hashes)].join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      html = html.replace(
        '<head>',
        `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="robots" content="noindex,nofollow,noarchive">`,
      );
      writeFileSync(file, html);
    }
  }
}
harden(output);
writeFileSync(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(
  'Static interface preview exported without API or database runtime.',
);
