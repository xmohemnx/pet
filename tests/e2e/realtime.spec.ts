import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
} from '@playwright/test';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';

const api = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100',
  url = 'ws://127.0.0.1:4100/api/v1/social/realtime/socket';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let fixture: { accounts: Record<string, { id: string; cookie: string }> };
const clients: Record<string, APIRequestContext> = {};
type Packet = { type: string; online?: boolean | null; typing?: boolean };
class Probe {
  ws: WebSocket;
  packets: Packet[] = [];
  code: number | undefined;
  constructor(role: string) {
    this.ws = new WebSocket(url, 'petra-chat-v1', {
      origin,
      headers: { Cookie: fixture.accounts[role]!.cookie },
    });
    this.ws.on('error', () => {});
    this.ws.on('message', (data) =>
      this.packets.push(JSON.parse(data.toString()) as Packet),
    );
    this.ws.on('close', (code) => {
      this.code = code;
    });
  }
  async wait(check: (p: Packet) => boolean) {
    await expect.poll(() => this.packets.some(check)).toBe(true);
    return this.packets.find(check)!;
  }
  async subscribe(peer: string) {
    await this.wait((p) => p.type === 'ready');
    this.ws.send(JSON.stringify({ type: 'subscribe', peerId: peer }));
    await this.wait((p) => p.type === 'subscribed');
  }
  clear() {
    this.packets = [];
  }
  async close() {
    this.ws.close();
    await expect.poll(() => this.ws.readyState).toBe(WebSocket.CLOSED);
  }
}
async function profile(
  role: string,
  privacy = 'public',
  presenceEnabled = false,
) {
  const r = await clients[role]!.post(api + 'social/profile', {
    data: {
      displayName: `حساب فوري ${role}`,
      bio: 'بيانات اختبار اصطناعية',
      privacy,
      presenceEnabled,
    },
  });
  expect(r.status()).toBe(201);
}
async function rejected(options: {
  origin?: string;
  cookie?: string;
  protocol?: string;
}) {
  return new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(url, options.protocol ?? 'petra-chat-v1', {
      origin: options.origin ?? origin,
      headers: { Cookie: options.cookie ?? '' },
    });
    ws.on('unexpected-response', (req, res) => {
      resolve(res.statusCode!);
      res.resume();
      req.destroy();
    });
    ws.on('error', () => {});
    ws.on('open', () => {
      ws.close();
      reject(new Error('Unexpected authorized upgrade'));
    });
  });
}
test.describe.serial('WebSocket فعلي وحضور اختياري وصلاحيات حية', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-rt-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      fixture = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    for (const role of ['owner', 'other', 'manager', 'stranger', 'doctor']) {
      clients[role] = await factory.newContext({
        extraHTTPHeaders: {
          Origin: origin,
          Cookie: fixture.accounts[role]!.cookie,
        },
      });
      await profile(role);
    }
  });
  test.afterAll(async () => {
    await Promise.all(Object.values(clients).map((c) => c.dispose()));
    await db.end();
  });
  test('المصافحة ترفض المصدر الغريب والضيف والبروتوكول الآخر دون قبول cookies كافية وحدها', async () => {
    expect(
      await rejected({
        origin: 'https://untrusted.invalid',
        cookie: fixture.accounts.owner!.cookie,
      }),
    ).toBe(403);
    expect(await rejected({})).toBe(401);
    expect(
      await rejected({
        cookie: fixture.accounts.owner!.cookie,
        protocol: 'unknown',
      }),
    ).toBe(403);
    expect(
      (await (await clients.owner!.get(api + 'social/realtime')).json()).url,
    ).toBe(url);
  });
  test('الرسائل الثنائية وJSON غير الموافق والحجم الزائد تغلق الاتصال', async () => {
    for (const [payload, binary] of [
      [Buffer.from([1, 2]), true],
      [
        JSON.stringify({
          type: 'subscribe',
          peerId: fixture.accounts.other!.id,
          role: 'admin',
        }),
        false,
      ],
      ['x'.repeat(1100), false],
    ] as const) {
      const p = new Probe('owner');
      await p.wait((x) => x.type === 'ready');
      p.ws.send(payload, { binary });
      await expect.poll(() => p.code).toBeDefined();
      expect([1003, 1008, 1009, 1006]).toContain(p.code);
    }
  });
  test('الاشتراك يتبع خصوصية المراسلة ولا يكشف رسائل حساب خاص بلا متابعة', async () => {
    await profile('doctor', 'private');
    const p = new Probe('owner');
    try {
      await p.wait((x) => x.type === 'ready');
      p.ws.send(
        JSON.stringify({
          type: 'subscribe',
          peerId: fixture.accounts.doctor!.id,
        }),
      );
      await p.wait((x) => x.type === 'revoked');
      await expect.poll(() => p.code).toBe(4403);
    } finally {
      if (p.ws.readyState !== WebSocket.CLOSED) await p.close();
    }
  });
  test('الإشعار يصل بعد commit فقط وبلا نص الرسالة وإعادة الاتصال تعيد التاريخ من DB', async () => {
    const a = new Probe('owner'),
      b = new Probe('other');
    try {
      await a.subscribe(fixture.accounts.other!.id);
      await b.subscribe(fixture.accounts.owner!.id);
      a.clear();
      b.clear();
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          'INSERT INTO direct_messages(sender_id,recipient_id,body,idempotency_key) VALUES($1,$2,$3,$4)',
          [
            fixture.accounts.owner!.id,
            fixture.accounts.other!.id,
            'رسالة rollback لا تنشر',
            randomUUID(),
          ],
        );
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(b.packets.some((x) => x.type === 'changed')).toBe(false);
      const input = {
        body: 'رسالة فورية محفوظة ذات خصوصية',
        idempotencyKey: randomUUID(),
      };
      const r = await clients.owner!.post(
        api + `social/messages/${fixture.accounts.other!.id}`,
        { data: input },
      );
      expect(r.status()).toBe(201);
      await b.wait((x) => x.type === 'changed');
      expect(JSON.stringify(b.packets)).not.toContain(input.body);
      const id = (await r.json()).id;
      expect(
        (
          await (
            await clients.owner!.post(
              api + `social/messages/${fixture.accounts.other!.id}`,
              { data: input },
            )
          ).json()
        ).id,
      ).toBe(id);
      await b.close();
      const restored = new Probe('other');
      try {
        await restored.subscribe(fixture.accounts.owner!.id);
        const history = await (
          await clients.other!.get(
            api + `social/messages/${fixture.accounts.owner!.id}`,
          )
        ).json();
        expect(history.filter((m: { id: string }) => m.id === id)).toHaveLength(
          1,
        );
      } finally {
        await restored.close();
      }
    } finally {
      await a.close();
      if (b.ws.readyState !== WebSocket.CLOSED) await b.close();
    }
  });
  test('الحضور والكتابة مخفيان افتراضياً ويظهران بموافقة ويسحبان عند إلغائها', async () => {
    const a = new Probe('owner'),
      b = new Probe('other');
    try {
      await a.subscribe(fixture.accounts.other!.id);
      await b.subscribe(fixture.accounts.owner!.id);
      await b.wait((x) => x.type === 'status' && x.online === null);
      await profile('owner', 'public', true);
      await b.wait((x) => x.type === 'status' && x.online === true);
      b.clear();
      a.ws.send(JSON.stringify({ type: 'typing', active: true }));
      await b.wait((x) => x.type === 'status' && x.typing === true);
      b.clear();
      await profile('owner', 'public', false);
      await b.wait(
        (x) => x.type === 'status' && x.online === null && x.typing === false,
      );
    } finally {
      await a.close();
      await b.close();
    }
  });
  test('حد ثلاث جلسات للمستخدم لا يسمح باتصال رابع', async () => {
    const probes = [
      new Probe('stranger'),
      new Probe('stranger'),
      new Probe('stranger'),
    ];
    try {
      await Promise.all(probes.map((p) => p.wait((x) => x.type === 'ready')));
      expect(
        await rejected({ cookie: fixture.accounts.stranger!.cookie }),
      ).toBe(429);
    } finally {
      await Promise.all(probes.map((p) => p.close()));
    }
  });
  test('واجهة الهاتف تستقبل عبر WS وتعرض الكتابة وتحفظ الرسالة بمفتاح وتستوفي الوصول', async ({
    page,
    context,
  }) => {
    await profile('owner', 'public', true);
    await profile('other', 'public', true);
    await context.addCookies(
      fixture.accounts.owner!.cookie.split('; ').map((c) => {
        const i = c.indexOf('=');
        return {
          name: c.slice(0, i),
          value: c.slice(i + 1),
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax' as const,
        };
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/social');
    const row = page.locator('.care-list-row').filter({
      has: page.getByRole('heading', {
        name: 'حساب فوري other',
        exact: true,
      }),
    });
    await row.getByRole('button', { name: 'مراسلة', exact: true }).click();
    await expect(page.getByText(/المحادثة متصلة فورياً/)).toBeVisible();
    const b = new Probe('other');
    try {
      await b.subscribe(fixture.accounts.owner!.id);
      const text = 'رسالة تصل فوراً من الطرف الثاني';
      await clients.other!.post(
        api + `social/messages/${fixture.accounts.owner!.id}`,
        { data: { body: text, idempotencyKey: randomUUID() } },
      );
      await expect(page.getByText(text, { exact: false })).toBeVisible({
        timeout: 2000,
      });
      await page
        .getByLabel('نص الرسالة', { exact: true })
        .fill('رد من الهاتف محفوظ');
      await b.wait((x) => x.type === 'status' && x.typing === true);
      await page
        .getByRole('button', { name: 'إرسال الرسالة', exact: true })
        .click();
      await expect(
        page
          .locator('.chat-bubble')
          .filter({
            has: page.getByText('رد من الهاتف محفوظ', { exact: true }),
          })
          .filter({ has: page.locator('small') }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: 'docs/evidence/social-realtime-390.png',
        fullPage: true,
      });
    } finally {
      await b.close();
    }
  });
  test('سحب الجلسة والحظر يوقفان اتصالاً مفتوحاً ولا يكتفيان بإخفاء واجهة', async () => {
    const p = new Probe('manager');
    await p.subscribe(fixture.accounts.owner!.id);
    await db.query('DELETE FROM auth_sessions WHERE "userId"=$1', [
      fixture.accounts.manager!.id,
    ]);
    await p.wait((x) => x.type === 'revoked');
    await expect.poll(() => p.code).toBe(4403);
    const a = new Probe('owner'),
      b = new Probe('other');
    try {
      await a.subscribe(fixture.accounts.other!.id);
      await b.subscribe(fixture.accounts.owner!.id);
      expect(
        (
          await clients.owner!.post(
            api + `social/users/${fixture.accounts.other!.id}/block`,
            { data: {} },
          )
        ).status(),
      ).toBe(201);
      await b.wait((x) => x.type === 'revoked');
      await expect.poll(() => b.code).toBe(4403);
    } finally {
      if (a.ws.readyState !== WebSocket.CLOSED) await a.close();
      if (b.ws.readyState !== WebSocket.CLOSED) await b.close();
    }
  });
});
