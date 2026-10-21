import { describe, it, expect, vi } from 'vitest';
import { sensitivePath } from '../../packages/contracts/src/http-security';
import { readLimitedBody } from '../../apps/web/lib/http-body';

describe('حدود HTTP قبل تحليل المدخلات', () => {
  it('يحظر الأسرار والملفات المخفية والترميز المتكرر والفواصل البديلة', () => {
    for (const path of [
      '/.env',
      '/.env.local',
      '/%252eenv',
      '/%2egit/config',
      '/x%5c.env',
      '/backup.sql.gz.bak',
      '/node_modules/x',
      '/bad%zz',
    ])
      expect(sensitivePath(path), path).toBe(true);
    for (const path of [
      '/login',
      '/api/v1/pets',
      '/_next/static/chunks/app.js',
    ])
      expect(sensitivePath(path)).toBe(false);
  });
  it('يرفض الحجم المعلن قبل قراءة الجسم والضغط قبل فكّه', async () => {
    const read = vi.fn();
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-length': '100' },
    });
    Object.defineProperty(request, 'body', { get: read });
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({
      status: 413,
    });
    expect(read).not.toHaveBeenCalled();
    await expect(
      readLimitedBody(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'content-encoding': 'gzip' },
        }),
        10,
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it('يحصر الطلب المتدفق بلا Content-Length ويلغي المصدر عند التجاوز', async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(7));
        controller.enqueue(new Uint8Array(7));
      },
      cancel: cancelled,
    });
    const request = new Request('http://localhost', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    await expect(readLimitedBody(request, 10)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(
      await readLimitedBody(
        new Request('http://localhost', { method: 'POST', body: 'valid' }),
        5,
      ),
    ).toEqual(new TextEncoder().encode('valid'));
  });
});
