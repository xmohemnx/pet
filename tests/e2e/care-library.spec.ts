import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
const root = 'http://127.0.0.1:4100/api/v1/',
  origin = 'http://127.0.0.1:3100',
  db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let f: {
    clinicId: string;
    clinicB: string;
    accounts: Record<string, { id: string; cookie: string }>;
  },
  owner: APIRequestContext,
  other: APIRequestContext,
  manager: APIRequestContext,
  doctor: APIRequestContext,
  stranger: APIRequestContext,
  article: string;
const draft = {
  title: 'مقال رعاية اصطناعي للاختبار',
  body: 'هذا نص اختبار فقط لمكتبة الرعاية، لا يقدم نصيحة طبية ولا يصف علاجاً. '.repeat(
    3,
  ),
  species: 'cat',
  ageGroup: 'adult',
  sources: ['https://example.org/reference'],
};
async function post(c: APIRequestContext, path: string, data: unknown = {}) {
  const r = await c.post(root + path, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
  return r.json();
}
async function cookies(context: BrowserContext, role: string) {
  await context.addCookies(
    f.accounts[role]!.cookie.split('; ').map((c) => {
      const n = c.indexOf('=');
      return {
        name: c.slice(0, n),
        value: c.slice(n + 1),
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax' as const,
      };
    }),
  );
}
test.describe.serial('مكتبة بمراجعة بيطرية مستقلة وتصحيح خاص', () => {
  test.beforeAll(async () => {
    const file = `/tmp/petra-library-${randomUUID()}.json`;
    try {
      execFileSync(process.execPath, ['scripts/seed-platform-test.mjs', file], {
        env: process.env,
        stdio: 'pipe',
      });
      f = JSON.parse(readFileSync(file, 'utf8'));
    } finally {
      rmSync(file, { force: true });
    }
    [owner, other, manager, doctor, stranger] = await Promise.all(
      ['owner', 'other', 'manager', 'doctor', 'stranger'].map((role) =>
        factory.newContext({
          extraHTTPHeaders: {
            Origin: origin,
            Cookie: f.accounts[role]!.cookie,
          },
        }),
      ),
    );
  });
  test.afterAll(async () => {
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      manager?.dispose(),
      doctor?.dispose(),
      stranger?.dispose(),
    ]);
    await db.end();
  });
  test('لا قراءة للمسودة أو نشر بلا مراجعة ولا مراجعة ذاتية أو لعيادة أخرى', async () => {
    const base = `clinics/${f.clinicId}/library`;
    for (const source of [
      'not a URL',
      'javascript:alert(1)',
      'http://example.org',
      'https://user:password@example.org',
    ])
      expect(
        (
          await manager.post(root + base, {
            data: { ...draft, sources: [source] },
          })
        ).status(),
      ).toBe(400);
    expect((await owner.post(root + base, { data: draft })).status()).toBe(403);
    expect((await other.get(root + base)).status()).toBe(403);
    article = (await post(manager, base, draft)).id;
    expect((await owner.get(root + `care/library/${article}`)).status()).toBe(
      404,
    );
    expect(
      (
        await manager.post(root + `${base}/${article}/publication`, {
          data: { published: true, version: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await manager.post(root + `${base}/${article}/review`, {
          data: {
            approved: true,
            note: 'مدير غير مخول بمراجعة بيطرية',
            version: 1,
          },
        })
      ).status(),
    ).toBe(403);
    await post(doctor, `${base}/${article}/review`, {
      approved: true,
      note: 'مراجعة fixture ولا اعتماد طبي حقيقي',
      version: 1,
    });
    await post(manager, `${base}/${article}/publication`, {
      published: true,
      version: 2,
    });
    const published = await (
      await owner.get(root + `care/library/${article}`)
    ).json();
    expect(published).toMatchObject({ title: draft.title, revision: 1 });
    expect(published.author_id).toBeUndefined();
    expect(published.review_note).toBeUndefined();
    // A doctor cannot acquire clinic administration by changing a workspace.
    expect((await doctor.post(root + base, { data: draft })).status()).toBe(
      403,
    );
    // Historical authorship fixture exercises self-review independently of current role grants.
    const fixtureDb = await db.connect();
    let self: string;
    try {
      await fixtureDb.query('BEGIN');
      self = (
        await fixtureDb.query(
          'INSERT INTO care_articles(clinic_id) VALUES($1) RETURNING id',
          [f.clinicId],
        )
      ).rows[0].id;
      await fixtureDb.query(
        'INSERT INTO care_article_revisions(article_id,revision,author_id,title,body,species,age_group,sources) VALUES($1,1,$2,$3,$4,$5,$6,$7)',
        [
          self,
          f.accounts.doctor!.id,
          'مسودة تاريخية للطبيب · اختبار',
          draft.body,
          draft.species,
          draft.ageGroup,
          draft.sources,
        ],
      );
      await fixtureDb.query('COMMIT');
    } catch (error) {
      await fixtureDb.query('ROLLBACK');
      throw error;
    } finally {
      fixtureDb.release();
    }
    expect(
      (
        await doctor.post(root + `${base}/${self}/review`, {
          data: { approved: true, note: 'يجب رفض الاعتماد الذاتي', version: 1 },
        })
      ).status(),
    ).toBe(403);
    await post(stranger, `${base}/${self}/review`, {
      approved: false,
      note: 'إعادة هذه النسخة للتصحيح قبل نشرها',
      version: 1,
    });
    expect(
      (
        await manager.post(root + `${base}/${self}/publication`, {
          data: { published: true, version: 2 },
        })
      ).status(),
    ).toBe(409);
  });
  test('كل تعديل يلغي النشر والمراجعة، وسحب الاعتماد أو قدم المراجعة يحجب المقال', async () => {
    const base = `clinics/${f.clinicId}/library`;
    await expect(
      db.query(
        "UPDATE care_article_revisions SET body='tampered' WHERE article_id=$1",
        [article],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await db.query(
      "UPDATE professional_profiles SET status='suspended' WHERE user_id=$1 AND kind='doctor'",
      [f.accounts.doctor!.id],
    );
    expect((await owner.get(root + `care/library/${article}`)).status()).toBe(
      404,
    );
    await db.query(
      "UPDATE professional_profiles SET status='verified' WHERE user_id=$1 AND kind='doctor'",
      [f.accounts.doctor!.id],
    );
    expect((await owner.get(root + `care/library/${article}`)).status()).toBe(
      200,
    );
    const edit = await manager.patch(root + `${base}/${article}`, {
      data: { ...draft, body: draft.body + 'نسخة معدلة', version: 3 },
    });
    expect(edit.status()).toBe(200);
    expect((await owner.get(root + `care/library/${article}`)).status()).toBe(
      404,
    );
    expect(
      (
        await manager.post(root + `${base}/${article}/publication`, {
          data: { published: true, version: 4 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await doctor.post(root + `${base}/${article}/review`, {
          data: {
            approved: true,
            note: 'مراجعة قديمة لا تعتمد النسخة الجديدة',
            version: 1,
          },
        })
      ).status(),
    ).toBe(409);
    await post(doctor, `${base}/${article}/review`, {
      approved: true,
      note: 'مراجعة جديدة للنسخة الثانية الاختبارية',
      version: 4,
    });
    await post(manager, `${base}/${article}/publication`, {
      published: true,
      version: 5,
    });
    expect(
      (
        await db.query(
          'SELECT count(*)::int n FROM care_article_revisions WHERE article_id=$1',
          [article],
        )
      ).rows[0].n,
    ).toBe(2);
    const expired = (
      await post(manager, base, {
        ...draft,
        title: 'مراجعة قديمة لا ينبغي عرضها',
      })
    ).id;
    await db.query(
      "INSERT INTO care_article_reviews(article_id,revision,author_id,reviewer_id,approved,note,reviewed_at) VALUES($1,1,$2,$3,true,'fixture old review',now()-interval '366 days')",
      [expired, f.accounts.manager!.id, f.accounts.doctor!.id],
    );
    await db.query("UPDATE care_articles SET state='approved' WHERE id=$1", [
      expired,
    ]);
    expect(
      (
        await manager.post(root + `${base}/${expired}/publication`, {
          data: { published: true, version: 1 },
        })
      ).status(),
    ).toBe(409);
  });
  test('التصحيح للنسخة التي قرأها العميل ورد الفريق خاص ولا يغير المقال', async () => {
    const r = await post(owner, `care/library/${article}/corrections`, {
      reason: 'تصحيح اصطناعي لا يحتوي بيانات طبية خاصة',
    });
    expect(
      (
        await owner.post(root + `care/library/${article}/corrections`, {
          data: { reason: 'تكرار التصحيح يجب رفضه' },
        })
      ).status(),
    ).toBe(409);
    expect(
      await (await other.get(root + 'me/content-corrections')).json(),
    ).toEqual([]);
    expect(
      (
        await other.post(
          root + `clinics/${f.clinicId}/content-corrections/${r.id}/resolve`,
          { data: { response: 'رد عيادة أخرى غير مسموح' } },
        )
      ).status(),
    ).toBe(403);
    await post(
      manager,
      `clinics/${f.clinicId}/content-corrections/${r.id}/resolve`,
      { response: 'فحصنا الملاحظة، ونحتفظ بهذه النسخة للاختبار فقط.' },
    );
    const own = await (await owner.get(root + 'me/content-corrections')).json();
    expect(own[0]).toMatchObject({
      revision: 2,
      status: 'resolved',
      response: 'فحصنا الملاحظة، ونحتفظ بهذه النسخة للاختبار فقط.',
    });
    await expect(
      db.query(
        "UPDATE care_article_corrections SET response='tampered' WHERE id=$1",
        [r.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await (await owner.get(root + `care/library/${article}`)).json())
        .revision,
    ).toBe(2);
    const search = await (
      await owner.get(
        root +
          'care/library?q=' +
          encodeURIComponent('اصطناعي') +
          '&species=cat&ageGroup=adult',
      )
    ).json();
    expect(search.some((a: { id: string }) => a.id === article)).toBe(true);
    const unrelated = await (
      await owner.get(root + 'care/library?species=dog')
    ).json();
    expect(unrelated.some((a: { id: string }) => a.id === article)).toBe(false);
  });
  test('واجهة تحرير ومراجعة ونشر وقراءة وتصحيح على الهاتف دون تنفيذ HTML', async ({
    page,
    context,
  }) => {
    const title = 'مقال المكتبة من المتصفح',
      body = draft.body + '<script>window.CONTENT_TEST=1</script>';
    await cookies(context, 'manager');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clinic/${f.clinicId}/library`);
    const form = page
      .getByRole('heading', { name: 'مسودة تعليمية جديدة', exact: true })
      .locator('..');
    await form
      .getByRole('textbox', { name: 'عنوان المقال', exact: true })
      .fill(title);
    await form
      .getByRole('textbox', { name: 'نص المقال التعليمي', exact: true })
      .fill(body);
    await form
      .getByRole('textbox', {
        name: 'مراجع HTTPS (مرجع في كل سطر، حتى خمسة)',
        exact: true,
      })
      .fill('https://example.org/vet-reference');
    await form
      .getByRole('button', { name: 'حفظ مسودة المقال', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    const id = (
      await db.query(
        'SELECT article_id FROM care_article_revisions WHERE title=$1',
        [title],
      )
    ).rows[0].article_id;
    await context.clearCookies();
    await cookies(context, 'doctor');
    await page.goto(`/clinic/${f.clinicId}/library`);
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await card
      .getByRole('textbox', { name: 'ملاحظة المراجعة البيطرية', exact: true })
      .fill('مراجعة اختبار لا اعتماد مهني حقيقي');
    await card
      .getByRole('button', { name: 'حفظ المراجعة البيطرية', exact: true })
      .click();
    await expect(card).toContainText('مراجعة مقبولة');
    await context.clearCookies();
    await cookies(context, 'manager');
    await page.goto(`/clinic/${f.clinicId}/library`);
    await page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'نشر المقال المراجع', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT published FROM care_articles WHERE id=$1', [
              id,
            ])
          ).rows[0].published,
      )
      .toBe(true);
    await context.clearCookies();
    await cookies(context, 'owner');
    await page.goto('/care/library');
    await page
      .getByRole('textbox', { name: 'نص البحث بالمقالات', exact: true })
      .fill(title);
    await page
      .getByRole('button', { name: 'بحث في المكتبة', exact: true })
      .click();
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.locator('.social-body')).toContainText(
      '<script>window.CONTENT_TEST=1</script>',
    );
    expect(
      await page.evaluate(() => Reflect.get(window, 'CONTENT_TEST')),
    ).toBeUndefined();
    await page.getByText('طلب تصحيح محتوى المقال', { exact: true }).click();
    await page
      .getByRole('textbox', { name: 'سبب طلب التصحيح', exact: true })
      .fill('تصحيح أرسل من واجهة الهاتف للتأكد من الحفظ');
    await page
      .getByRole('button', { name: 'إرسال طلب التصحيح', exact: true })
      .click();
    await expect(
      page.getByText('بانتظار المراجعة', { exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync('docs/evidence', { recursive: true });
    await page.screenshot({
      path: 'docs/evidence/reviewed-care-library-390.png',
      fullPage: true,
    });
  });
});
