import { MediaInfrastructureError } from './errors.js';
import { createConnection } from 'node:net';
import { lstat } from 'node:fs/promises';
export class UnsafeMediaError extends Error {
  constructor() {
    super('Unsafe media rejected');
  }
}
export function scannerConfigured() {
  return !!process.env.PETRA_CLAMAV_SOCKET;
}
async function command(command: string, bytes?: Buffer) {
  const path = process.env.PETRA_CLAMAV_SOCKET;
  if (!path || !path.startsWith('/') || path.includes('\0'))
    throw new Error('Private scanner socket required');
  const info = await lstat(path);
  if (!info.isSocket() || info.isSymbolicLink() || (info.mode & 0o002) !== 0)
    throw new Error('Private scanner socket permissions required');
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ path }),
      chunks: Buffer[] = [];
    let size = 0,
      finished = false;
    const done = (error?: Error, value?: string) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value!);
    };
    socket.setTimeout(15000, () => done(new Error('Scanner deadline')));
    socket.on('error', () => done(new Error('Scanner unavailable')));
    socket.on('end', () => {
      if (!finished) done(new Error('Incomplete scanner response'));
    });
    socket.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4096) return done(new Error('Scanner response bound'));
      chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (body.includes(0))
        done(
          undefined,
          body.subarray(0, body.indexOf(0)).toString('utf8').trim(),
        );
    });
    socket.on('connect', () => {
      void (async () => {
        socket.write(`z${command}\0`);
        if (bytes) {
          for (let offset = 0; offset < bytes.length; offset += 65536) {
            if (finished) throw new Error('Scanner connection ended');
            const chunk = bytes.subarray(offset, offset + 65536),
              length = Buffer.alloc(4);
            length.writeUInt32BE(chunk.length);
            socket.write(length);
            if (!socket.write(chunk))
              await new Promise<void>((resolve, reject) => {
                const clear = () => {
                  socket.off('drain', drained);
                  socket.off('error', failed);
                  socket.off('close', closed);
                };
                const drained = () => {
                    clear();
                    resolve();
                  },
                  failed = () => {
                    clear();
                    reject(new Error('Scanner write failed'));
                  },
                  closed = () => {
                    clear();
                    reject(new Error('Scanner connection closed'));
                  };
                socket.once('drain', drained);
                socket.once('error', failed);
                socket.once('close', closed);
              });
          }
          socket.write(Buffer.alloc(4));
        }
      })().catch(() => done(new Error('Scanner write failed')));
    });
  });
}
let cached: { path: string; version: string; time: number } | undefined;
export async function scannerVersion() {
  const path = process.env.PETRA_CLAMAV_SOCKET ?? '';
  if (cached?.path === path && cached.time > Date.now() - 60000)
    return cached.version;
  const version = await command('VERSION'),
    match = /^ClamAV ([0-9.]+)\/(\d+)\/(.+)$/.exec(version);
  const timestamp = match ? Date.parse(match[3] + ' UTC') : NaN;
  if (
    !match ||
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > 7 * 86400000 ||
    timestamp > Date.now() + 86400000
  )
    throw new Error('Scanner definitions missing or stale');
  cached = { path, version, time: Date.now() };
  return version;
}
export async function scanMedia(bytes: Buffer, limit = 20 * 1024 * 1024) {
  try {
    return await scan(bytes, limit);
  } catch (error) {
    if (error instanceof UnsafeMediaError) throw error;
    throw new MediaInfrastructureError();
  }
}
async function scan(bytes: Buffer, limit: number) {
  if (!bytes.length || bytes.length > Math.min(limit, 64 * 1024 * 1024))
    throw new Error('Scanner input bound');
  const version = await scannerVersion(),
    result = await command('INSTREAM', bytes);
  if (/^stream: .+ FOUND$/.test(result)) throw new UnsafeMediaError();
  if (result !== 'stream: OK') throw new Error('Scanner did not approve media');
  return version;
}
