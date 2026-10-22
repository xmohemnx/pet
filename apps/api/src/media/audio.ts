import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, chmod, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
const run = promisify(execFile);
export function audioFormat(bytes: Buffer) {
  if (bytes.subarray(0, 4).toString() === 'OggS') return 'ogg';
  if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WAVE'
  )
    return 'wav';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return 'matroska';
  return null;
}
export async function transcodeAudio(input: string, temp: string, out: string) {
  // Only worker-generated local paths enter the subprocess; no user options or URLs.
  const handle = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW);
  let inputBytes: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 5 * 1024 * 1024)
      throw new Error('Audio bound');
    inputBytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (inputBytes.length > 5 * 1024 * 1024) throw new Error('Audio bound');
  const format = audioFormat(inputBytes);
  if (!format) throw new Error('Audio signature');
  const safe = [
    '-v',
    'error',
    '-protocol_whitelist',
    'file,pipe',
    '-f',
    format,
    '-threads',
    '1',
  ];
  const probe = await run(
    'ffprobe',
    [...safe, '-show_entries', 'format=duration', '-of', 'json', input],
    { timeout: 10000, maxBuffer: 65536 },
  );
  const duration = Number(JSON.parse(probe.stdout).format.duration);
  if (
    (Number.isFinite(duration) && (duration <= 0 || duration > 120)) ||
    (!Number.isFinite(duration) && format !== 'matroska')
  )
    throw new Error('Audio duration');
  try {
    await run(
      'ffmpeg',
      [
        '-nostdin',
        ...safe,
        '-filter_threads',
        '1',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-map_metadata',
        '-1',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-t',
        '121',
        '-y',
        temp,
      ],
      { timeout: 30000, maxBuffer: 65536 },
    );
    const info = await stat(temp);
    if (!info.isFile() || info.size <= 0 || info.size > 1024 * 1024)
      throw new Error('Audio output');
    const measured = JSON.parse(
      (
        await run(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'json',
            temp,
          ],
          { timeout: 10000, maxBuffer: 65536 },
        )
      ).stdout,
    );
    const actual = Number(measured.format.duration);
    if (!Number.isFinite(actual) || actual <= 0 || actual > 120.1)
      throw new Error('Decoded audio duration');
    await chmod(temp, 0o600);
    await rename(temp, out);
    return info.size;
  } finally {
    await unlink(temp).catch(() => {});
  }
}
