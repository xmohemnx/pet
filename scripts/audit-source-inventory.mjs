import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const source = process.argv[2] ?? 'HEAD';
const commit = execFileSync(
  'git',
  ['rev-parse', '--verify', `${source}^{commit}`],
  { encoding: 'utf8' },
).trim();
const files = execFileSync(
  'git',
  [
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    '--',
    'apps/web/app',
    'apps/api/src',
    'infra/database/migrations',
    'tests',
  ],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n');
const result = {
  source_commit: commit,
  web: [],
  api: [],
  tables: [],
  tests: [],
};
for (const file of files) {
  if (!/\.(tsx?|sql)$/.test(file)) continue;
  const sourceText = execFileSync('git', ['show', `${commit}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const line = (index) => sourceText.slice(0, index).split('\n').length;
  if (file.startsWith('apps/web/app/') && file.endsWith('/page.tsx'))
    result.web.push({
      route: '/' + file.slice('apps/web/app/'.length, -'/page.tsx'.length),
      file,
      line: 1,
    });
  if (file.startsWith('apps/api/src/')) {
    const controllers = [
      ...sourceText.matchAll(/@Controller\(\s*(?:['"]([^'"]*)['"])?\s*\)/g),
    ];
    for (const match of sourceText.matchAll(
      /@(Get|Post|Patch|Delete|Put)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g,
    )) {
      const controller =
        controllers.filter((c) => c.index < match.index).at(-1)?.[1] ?? '';
      result.api.push({
        method: match[1].toUpperCase(),
        path: '/' + [controller, match[2] ?? ''].filter(Boolean).join('/'),
        file,
        line: line(match.index),
      });
    }
  }
  if (file.endsWith('.sql'))
    for (const match of sourceText.matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)?\s+"?(\w+)"?/gi,
    ))
      result.tables.push({ table: match[1], file, line: line(match.index) });
  if (file.startsWith('tests/'))
    for (const match of sourceText.matchAll(
      /(?:test|it)\([\s\n]*['"]([^'"]+)/g,
    ))
      result.tests.push({ title: match[1], file, line: line(match.index) });
}
// The App Router root has no directory name before page.tsx.
if (
  files.includes('apps/web/app/page.tsx') &&
  !result.web.some((p) => p.file === 'apps/web/app/page.tsx')
)
  result.web.unshift({ route: '/', file: 'apps/web/app/page.tsx', line: 1 });
const directory = 'docs/audits';
mkdirSync(directory, { recursive: true });
writeFileSync(
  `${directory}/SOURCE_INVENTORY.json`,
  JSON.stringify(result, null, 2) + '\n',
);
const markdown = [
  '# جرد المسارات والعقود ومخطط البيانات',
  '',
  `المصدر: \`${commit}\`. جرد تعاريف مصدرية؛ لا يثبت تشغيلها. يشمل decorators الفارغة والجداول ذات الأسماء المقتبسة. مسارات Better Auth المسجلة في middleware ليست decorators مستقلة. المسارات الديناميكية تحتاج صلاحية المورد عند التشغيل. الروابط مثبتة على commit التدقيق.`,
  '',
];
for (const [key, columns] of [
  ['web', ['route', 'file']],
  ['api', ['method', 'path', 'file']],
  ['tables', ['table', 'file']],
  ['tests', ['title', 'file']],
]) {
  markdown.push(
    `## ${key}`,
    '',
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
  );
  for (const entry of result[key]) {
    const values = columns.map((c) => String(entry[c]).replaceAll('|', '/'));
    values[values.length - 1] =
      `[${entry.file}](https://github.com/xmohemnx/pet/blob/${commit}/${entry.file}#L${entry.line})`;
    markdown.push(`| ${values.join(' | ')} |`);
  }
  markdown.push('');
}
writeFileSync(`${directory}/SOURCE_INVENTORY.md`, markdown.join('\n'));
console.log(
  Object.fromEntries(
    ['web', 'api', 'tables', 'tests'].map((key) => [key, result[key].length]),
  ),
);
