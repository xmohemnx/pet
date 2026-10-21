import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  lstatSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
if (process.env.APP_ENV === 'production')
  throw new Error('جهّز أسرار الإنتاج في مدير الأسرار، لا عبر مولد التطوير');
const file = new URL('../.env', import.meta.url);
if (
  existsSync(file) &&
  (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
)
  throw new Error('Refusing to read or modify a non-regular .env file');
if (!existsSync(file))
  writeFileSync(
    file,
    readFileSync(new URL('../.env.example', import.meta.url)),
    { mode: 0o600, flag: 'wx' },
  );
let contents = readFileSync(file, 'utf8');
if (!/^BETTER_AUTH_SECRET=.+/m.test(contents)) {
  contents = contents.replace(/^BETTER_AUTH_SECRET=.*\n?/m, '');
  contents += `\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`;
  writeFileSync(file, contents, { mode: 0o600 });
}
for (const [key, value] of Object.entries({
  APP_ORIGIN: 'http://127.0.0.1:3000',
  APP_ENV: 'local',
  MAIL_MODE: 'local',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'Petra <hello@petra.test>',
})) {
  if (!new RegExp(`^${key}=`, 'm').test(contents)) {
    contents += `${key}=${value}\n`;
    writeFileSync(file, contents, { mode: 0o600 });
  }
}
chmodSync(file, 0o600);
console.log(
  'Local identity settings prepared; secret preserved and never printed.',
);
