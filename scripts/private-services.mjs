import { setTimeout as delay } from 'node:timers/promises';
// Local free services only. No production resources, public ports, or secret output.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  realpathSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
const root = resolve('.data/provider-check');
mkdirSync(root, { recursive: true, mode: 0o700 });
if (realpathSync(root) !== root)
  throw new Error('Private service directory cannot be a symlink');
chmodSync(root, 0o700);
const clam =
    'clamav/clamav@sha256:e19130cdebaeacc71fa46eab3ed6f69941f2f22aa5e08d55e9197f8edf43ce5e',
  weed =
    'chrislusf/seaweedfs@sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d';
function docker(args, optional = false) {
  const r = spawnSync('docker', args, { stdio: 'pipe', timeout: 180000 });
  if (r.status !== 0 && !optional)
    throw new Error('Local Docker service command failed');
  return r;
}
const credentialsFile = join(root, 'credentials.json');
if (!existsSync(credentialsFile))
  writeFileSync(
    credentialsFile,
    JSON.stringify({
      access: randomBytes(16).toString('hex'),
      secret: randomBytes(24).toString('hex'),
      encryption: randomBytes(32).toString('hex'),
    }),
    { mode: 0o600 },
  );
chmodSync(credentialsFile, 0o600);
const credentials = JSON.parse(readFileSync(credentialsFile, 'utf8'));
writeFileSync(
  join(root, 's3.json'),
  JSON.stringify({
    identities: [
      {
        name: 'petra-local-isolated',
        credentials: [
          { accessKey: credentials.access, secretKey: credentials.secret },
        ],
        actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
      },
    ],
  }),
  { mode: 0o600 },
);
for (const name of ['scan', 'weed']) {
  mkdirSync(join(root, name), { recursive: true, mode: 0o700 });
  if (realpathSync(join(root, name)) !== join(root, name))
    throw new Error('Private data path cannot use symlinks');
  chmodSync(join(root, name), 0o700);
}
writeFileSync(
  join(root, 'clamd.conf'),
  'Foreground yes\nDatabaseDirectory /var/lib/clamav\nLocalSocket /run/scan/clamd.sock\nLocalSocketMode 660\nFixStaleSocket yes\nMaxThreads 2\nMaxQueue 4\nReadTimeout 10\nCommandReadTimeout 5\nStreamMaxLength 65M\nMaxScanSize 128M\nMaxFileSize 65M\nMaxRecursion 8\nMaxFiles 500\nAlertExceedsMax yes\nSelfCheck 3600\nLogFile /tmp/clamd.log\nLogFileMaxSize 1M\nLogTime yes\n',
  { mode: 0o600 },
);
for (const image of [clam, weed])
  if (docker(['image', 'inspect', image], true).status !== 0)
    docker(['pull', image]);
if (docker(['network', 'inspect', 'petra-provider-check'], true).status !== 0)
  docker(['network', 'create', 'petra-provider-check']);
const shared = [
  '--user',
  '1000:1000',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--label',
  'petra.private-test-service=true',
];
for (const name of ['petra-019-clamav-check', 'petra-019-s3-check']) {
  const found = docker(
    ['container', 'inspect', '--format', '{{.State.Running}}', name],
    true,
  );
  if (found.status === 0 && found.stdout.toString().trim() === 'true') continue;
  if (found.status === 0) docker(['rm', name]);
  if (name.includes('clamav'))
    docker([
      'run',
      '-d',
      '--name',
      name,
      ...shared,
      '--network',
      'none',
      '--read-only',
      '--pids-limit',
      '64',
      '--memory',
      '2g',
      '--cpus',
      '1',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=128m,uid=1000,gid=1000',
      '--mount',
      `type=bind,src=${join(root, 'scan')},dst=/run/scan`,
      '--mount',
      `type=bind,src=${join(root, 'clamd.conf')},dst=/etc/petra-clamd.conf,readonly`,
      '--health-cmd',
      'clamdscan --ping=1 --config-file=/etc/petra-clamd.conf',
      '--health-interval',
      '10s',
      '--health-timeout',
      '5s',
      '--health-retries',
      '6',
      '--health-start-period',
      '30s',
      '--entrypoint',
      'clamd',
      clam,
      '--config-file=/etc/petra-clamd.conf',
    ]);
  else
    docker([
      'run',
      '-d',
      '--name',
      name,
      ...shared,
      '--network',
      'petra-provider-check',
      '--pids-limit',
      '128',
      '--memory',
      '1g',
      '--cpus',
      '1',
      '-p',
      '127.0.0.1:4933:8333',
      '--mount',
      `type=bind,src=${join(root, 'weed')},dst=/data`,
      '--mount',
      `type=bind,src=${join(root, 's3.json')},dst=/etc/petra-s3.json,readonly`,
      weed,
      'server',
      '-dir=/data',
      '-ip=127.0.0.1',
      '-ip.bind=0.0.0.0',
      '-s3',
      '-s3.port=8333',
      '-s3.config=/etc/petra-s3.json',
      '-volume.max=12',
      '-master.volumeSizeLimitMB=64',
    ]);
}
const deadline = Date.now() + 60000;
while (true) {
  try {
    const response = await globalThis.fetch('http://127.0.0.1:4933/', {
      signal: globalThis.AbortSignal.timeout(1500),
    });
    if (![401, 403].includes(response.status))
      throw new Error('S3 auth gate unavailable');
    process.env.PETRA_CLAMAV_SOCKET = join(root, 'scan/clamd.sock');
    const { scannerVersion } =
      await import('../apps/api/dist/apps/api/src/media/antivirus.js');
    await scannerVersion();
    break;
  } catch {
    if (Date.now() > deadline)
      throw new Error(
        'Private services not ready or scanner definitions stale; refresh pinned images after review',
      );
    await delay(500);
  }
}
console.log(
  'Local S3 and private scanner ready; credentials preserved in ignored private storage.',
);
