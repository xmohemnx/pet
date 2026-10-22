import { MediaInfrastructureError } from './errors.js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetBucketAclCommand,
  GetBucketPolicyCommand,
} from '@aws-sdk/client-s3';
const magic = Buffer.from('PETRAMEDIA1');
export function sealMedia(key: Buffer, path: string, bytes: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(path));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
export function openMedia(key: Buffer, path: string, bytes: Buffer) {
  if (
    bytes.length < magic.length + 28 ||
    !bytes.subarray(0, magic.length).equals(magic)
  )
    throw new Error('Invalid encrypted media');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(magic.length, magic.length + 12),
  );
  decipher.setAAD(Buffer.from(path));
  decipher.setAuthTag(bytes.subarray(magic.length + 12, magic.length + 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(magic.length + 28)),
    decipher.final(),
  ]);
}
export function s3MediaEnabled() {
  return process.env.MEDIA_STORAGE_BACKEND === 's3';
}
export class PrivateStorage {
  readonly client: S3Client;
  readonly bucket: string;
  private readonly key: Buffer;
  private checked = 0;
  constructor() {
    let url: URL;
    try {
      url = new URL(process.env.PETRA_S3_ENDPOINT ?? 'invalid:');
    } catch {
      throw new Error('Invalid private storage endpoint');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(
          process.env.APP_ENV === 'local' &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname)
        ))
    )
      throw new Error(
        'Private storage requires verified HTTPS outside local loopback',
      );
    const bucket = process.env.PETRA_S3_BUCKET ?? '',
      access = process.env.PETRA_S3_ACCESS_KEY_ID ?? '',
      secret = process.env.PETRA_S3_SECRET_ACCESS_KEY ?? '',
      encoded = process.env.PETRA_MEDIA_ENCRYPTION_KEY ?? '';
    const key = Buffer.from(encoded, 'base64');
    if (
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
      access.length < 20 ||
      secret.length < 32 ||
      key.length !== 32 ||
      key.toString('base64') !== encoded ||
      new Set(key).size < 2
    )
      throw new Error(
        'Private storage credentials and independent encryption key required',
      );
    this.bucket = bucket;
    this.key = key;
    this.client = new S3Client({
      endpoint: url.origin,
      region: process.env.PETRA_S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      maxAttempts: 1,
      followRegionRedirects: false,
      credentials: { accessKeyId: access, secretAccessKey: secret },
      requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
    });
  }
  private path(path: string) {
    if (!/^[a-f0-9-]{36}\.(webp|mp4|ogg|upload|m3u8|ts)$/.test(path))
      throw new Error('Invalid object key');
    return path;
  }
  async privateBucket() {
    if (this.checked > Date.now() - 60000) return;
    const acl = await this.client.send(
      new GetBucketAclCommand({ Bucket: this.bucket }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (
      !acl.Owner?.ID ||
      !acl.Grants?.length ||
      acl.Grants.some(
        (g) =>
          g.Grantee?.Type !== 'CanonicalUser' ||
          g.Grantee.ID !== acl.Owner!.ID ||
          g.Grantee.URI,
      )
    )
      throw new Error('Private bucket ACL required');
    try {
      const p = await this.client.send(
        new GetBucketPolicyCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      const policy = JSON.parse(p.Policy ?? '{}'),
        statements = Array.isArray(policy.Statement)
          ? policy.Statement
          : [policy.Statement];
      if (
        statements.some(
          (s: unknown) =>
            s && typeof s === 'object' && 'Effect' in s && s.Effect === 'Allow',
        )
      )
        throw new Error(
          'Bucket allow policies are forbidden; use scoped identity permissions',
        );
    } catch (e) {
      if (!(e instanceof Error) || e.name !== 'NoSuchBucketPolicy') throw e;
    }
    this.checked = Date.now();
  }
  async put(path: string, bytes: Buffer) {
    try {
      return await this.write(path, bytes);
    } catch {
      throw new MediaInfrastructureError();
    }
  }
  private async write(path: string, bytes: Buffer) {
    this.path(path);
    if (!bytes.length || bytes.length > 64 * 1024 * 1024)
      throw new Error('Object size bound');
    await this.privateBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: sealMedia(this.key, path, bytes),
        ContentType: 'application/octet-stream',
        IfNoneMatch: '*',
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
  }
  async get(path: string, limit: number) {
    try {
      return await this.read(path, limit);
    } catch {
      throw new MediaInfrastructureError();
    }
  }
  private async read(path: string, limit: number) {
    const bytes = openMedia(this.key, path, await this.readCipher(path, limit));
    if (bytes.length > limit) throw new Error('Object size bound');
    return bytes;
  }
  async exportCiphertext(path: string, limit: number) {
    try {
      const cipher = await this.readCipher(path, limit);
      const plain = openMedia(this.key, path, cipher);
      if (plain.length > limit) throw new Error('Object size bound');
      plain.fill(0);
      return cipher;
    } catch {
      throw new MediaInfrastructureError();
    }
  }
  private async readCipher(path: string, limit: number) {
    this.path(path);
    await this.privateBucket();
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    const bound = limit + magic.length + 28;
    if ((result.ContentLength ?? bound + 1) > bound || !result.Body)
      throw new Error('Object size bound');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const part of result.Body as AsyncIterable<Uint8Array>) {
        const chunk = Buffer.from(part);
        size += chunk.length;
        if (size > bound) throw new Error('Object size bound');
        chunks.push(chunk);
      }
    } finally {
      const body = result.Body as { destroy?: () => void };
      body.destroy?.();
    }
    return Buffer.concat(chunks);
  }
  async delete(path: string) {
    this.path(path);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: path }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  close() {
    this.client.destroy();
  }
}
let storage: PrivateStorage | undefined;
export function privateStorage() {
  return (storage ??= new PrivateStorage());
}
