import { loadEnvFile } from 'node:process';
loadEnvFile(new URL('../.env', import.meta.url));
const { runWorker } =
  await import('../apps/api/dist/apps/api/src/operations/worker.js');
await runWorker();
