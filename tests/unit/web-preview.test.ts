import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewResponse } from '../../apps/web/lib/web-preview';

afterEach(() => vi.unstubAllEnvs());
const request = (path: string, method = 'GET') => ({
  method,
  url: 'https://preview.example.invalid' + path,
  nextUrl: new URL('https://preview.example.invalid' + path),
});

describe('Public interface preview isolation', () => {
  it('requires an explicit true flag and does not alter normal routes', () => {
    for (const flag of ['', 'false', 'TRUE']) {
      vi.stubEnv('PETRA_WEB_PREVIEW', flag);
      expect(previewResponse(request('/api/v1/me', 'POST'))).toBeNull();
    }
  });
  it('blocks all API methods independently of session or origin', () => {
    vi.stubEnv('PETRA_WEB_PREVIEW', 'true');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
      expect(previewResponse(request('/api/v1/anything', method))?.status).toBe(
        503,
      );
  });
  it('hides demo and safety tokens and rejects page writes', () => {
    vi.stubEnv('PETRA_WEB_PREVIEW', 'true');
    for (const path of ['/demo', '/demo/customer', '/safety/private-token'])
      expect(previewResponse(request(path))?.status).toBe(404);
    expect(previewResponse(request('/login', 'POST'))?.status).toBe(405);
  });
  it('redirects unavailable routes without copying secrets from the URL', () => {
    vi.stubEnv('PETRA_WEB_PREVIEW', 'true');
    const response = previewResponse(request('/app?token=do-not-copy'))!;
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://preview.example.invalid/preview',
    );
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(previewResponse(request('/safety/private.png'))?.status).toBe(404);
  });
  it('allows identity designs and known assets without opening dynamic paths', () => {
    vi.stubEnv('PETRA_WEB_PREVIEW', 'true');
    for (const path of ['/', '/login', '/register', '/images/companions.png'])
      expect(previewResponse(request(path))).toBeNull();
    expect(previewResponse(request('/care/private.png'))?.status).toBe(307);
  });
});
