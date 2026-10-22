import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { configurationGates } from './production-readiness.mjs';
const read = (file) => {
  try {
    return file ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
};
const json = (file) => {
  try {
    return JSON.parse(read(file));
  } catch {
    return null;
  }
};
let commit = process.env.RELEASE_COMMIT;
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    commit = '';
  }
}
const result = configurationGates(process.env, commit, {
  report: json(process.env.SECURITY_REVIEW_REPORT),
  publicKey: read(process.env.SECURITY_REVIEW_PUBLIC_KEY_FILE),
  retention: json(process.env.RETENTION_POLICY_FILE),
});
console.log(
  JSON.stringify({
    status: result.configurationReady ? 'configuration-validated' : 'blocked',
    ...result,
    notice:
      'Configuration checks do not prove deployment, provider operation, or external approval identity.',
  }),
);
process.exitCode = result.configurationReady ? 0 : 1;
