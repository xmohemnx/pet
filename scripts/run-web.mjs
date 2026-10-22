import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// Read local settings only in the server process, never a browser bundle.
const settings = new URL('../.env', import.meta.url);
if (existsSync(settings)) loadEnvFile(settings);
const args = process.argv.slice(2);
let command = ['node_modules/next/dist/bin/next', ...args];
let runtime = process.env;
if (args[0] === 'start') {
  const root = resolve('.next/standalone/apps/web');
  if (!existsSync(resolve(root, 'server.js')))
    throw new Error(
      'Build the web application before starting its standalone server',
    );
  // Next's standalone output intentionally omits these two asset directories.
  mkdirSync(resolve(root, '.next'), { recursive: true });
  cpSync(resolve('.next/static'), resolve(root, '.next/static'), {
    recursive: true,
  });
  cpSync(resolve('public'), resolve(root, 'public'), { recursive: true });
  const port = args.indexOf('--port'),
    hostname = args.indexOf('--hostname');
  runtime = {
    ...process.env,
    PORT: port >= 0 ? args[port + 1] : process.env.PORT || '3000',
    HOSTNAME: hostname >= 0 ? args[hostname + 1] : '0.0.0.0',
  };
  command = [resolve(root, 'server.js')];
}
const child = spawn(process.execPath, command, {
  stdio: 'inherit',
  env: runtime,
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Unable to start the web process');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
