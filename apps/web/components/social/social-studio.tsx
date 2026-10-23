'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, ArrowRight, X, Check, LockKeyhole } from 'lucide-react';
import type { IdentityMe, SocialProfile, MediaAsset } from '@petra/contracts';
import { api } from '../../lib/auth-client';
import { SocialShell } from './social-shell';

function upload(
  file: File,
  progress: (percent: number) => void,
): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذرت قراءة الملف؛ اختره مجدداً'));
    reader.onload = () => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/v1/media');
      request.setRequestHeader('Content-Type', 'application/json');
      request.timeout = 90000;
      request.upload.onprogress = (e) => {
        if (e.lengthComputable)
          progress(Math.round((e.loaded / e.total) * 100));
      };
      request.onerror = () =>
        reject(new Error('انقطع الرفع؛ يمكنك إعادة المحاولة'));
      request.ontimeout = () =>
        reject(new Error('استغرق الرفع وقتاً طويلاً؛ حاول مجدداً'));
      request.onload = () => {
        if (request.status === 429) {
          reject(
            new Error(
              'وصلت إلى حد الرفع؛ انتظر دقيقة ثم اختر الملفات المتبقية.',
            ),
          );
          return;
        }
        try {
          const result = JSON.parse(request.responseText);
          if (request.status >= 200 && request.status < 300) resolve(result);
          else reject(new Error(result.message ?? 'لم يقبل الملف'));
        } catch {
          reject(new Error('تعذر قراءة نتيجة الرفع'));
        }
      };
      request.send(
        JSON.stringify({ dataBase64: String(reader.result).split(',')[1] }),
      );
    };
    reader.readAsDataURL(file);
  });
}
export function SocialStudio({
  me,
  profile,
  initialAssets,
  initialKind = 'post',
}: {
  me: IdentityMe;
  profile: SocialProfile | null;
  initialAssets: MediaAsset[];
  initialKind?: string;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  const [kind, setKind] = useState(initialKind),
    [body, setBody] = useState(''),
    [visibility, setVisibility] = useState('public'),
    [assets, setAssets] = useState(initialAssets),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [stage, setStage] = useState(1),
    [draftNotice, setDraftNotice] = useState('');
  const key = useRef<{ signature: string; value: string } | null>(null);
  const draftKey = `petra-social-draft-v1:${me.user.id}`;
  useEffect(() => {
    setInteractive(true);
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        setBody(draft.slice(0, 3000));
        setDraftNotice('استعدنا مسودة النص من هذا الجهاز.');
      }
    } catch {
      /* Storage may be disabled. */
    }
  }, [draftKey]);
  useEffect(() => {
    if (!assets.some((a) => ['pending', 'processing'].includes(a.status)))
      return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void api<MediaAsset[]>('media', { signal: controller.signal })
        .then(setAssets)
        .catch(() => undefined);
    }, 2500);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [assets]);
  const ready = selected.every((id) =>
    assets.some((a) => a.id === id && a.status === 'ready'),
  );
  async function choose(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const max = kind === 'post' ? 10 : 1;
      if (files.length + selected.length > max)
        throw new Error(
          `يمكن اختيار ${max} ${max === 1 ? 'وسيط' : 'صور'} لهذا النوع`,
        );
      for (const file of Array.from(files)) {
        const video = file.type === 'video/mp4';
        if (
          !['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(
            file.type,
          )
        )
          throw new Error('اختر صورة JPEG/PNG/WebP أو فيديو MP4');
        if (file.size > (video ? 20 : 5) * 1024 * 1024)
          throw new Error(
            video
              ? 'حجم الفيديو الأقصى20ميغابايت'
              : 'حجم الصورة الأقصى5ميغابايت',
          );
        if (video && kind === 'post' && (files.length > 1 || selected.length))
          throw new Error('الفيديو يُنشر منفرداً؛ الألبوم للصور فقط');
        if (kind === 'reel' && !video) throw new Error('الريل يحتاج فيديو MP4');
        setProgress(0);
        const asset = await upload(file, setProgress);
        setAssets((previous) => [asset, ...previous]);
        setSelected((previous) => [...previous, asset.id]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع الوسيط');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  function changeKind(value: string) {
    setKind(value);
    setSelected([]);
    setStage(1);
  }
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const signature = JSON.stringify({
        body: body.trim(),
        visibility,
        kind,
        assetIds: selected,
      });
      if (key.current?.signature !== signature)
        key.current = { signature, value: crypto.randomUUID() };
      const post = await api<{ id: string }>('social/posts', {
        method: 'POST',
        body: JSON.stringify({
          ...JSON.parse(signature),
          idempotencyKey: key.current.value,
        }),
      });
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* optional */
      }
      router.push(`/social/posts/${post.id}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'تعذر النشر؛ أعد المحاولة بنفس المحتوى',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SocialShell me={me} profile={profile} wide>
      <div className="social-page-heading">
        <Link href="/social" className="social-back">
          <ArrowRight size={19} /> المجتمع
        </Link>
        <h1>لحظة تستحق المشاركة.</h1>
        <p>صورتك، حكايتك، وبالجمهور الذي تختاره.</p>
      </div>
      {!profile ? (
        <section className="social-empty">
          <h2>لنبدأ باسم يعرفك به الرفاق</h2>
          <p>أنشئ ملفك الاجتماعي قبل نشر أول حكاية.</p>
          <Link className="social-button" href="/social/settings">
            إنشاء الملف الاجتماعي
          </Link>
        </section>
      ) : (
        <div className="social-studio">
          <div className="social-studio-preview">
            {error && stage === 1 && (
              <p role="alert" className="social-error">
                {error}
              </p>
            )}
            <div className="social-studio-preview-top">
              <span>معاينة الوسائط</span>
              <bdi dir="ltr">
                {selected.length} / {kind === 'post' ? 10 : 1}
              </bdi>
            </div>
            {selected.length ? (
              <div className="social-studio-images">
                {selected.map((id) => {
                  const asset = assets.find((a) => a.id === id);
                  return (
                    <div key={id} className="social-studio-image">
                      {asset?.status === 'ready' ? (
                        asset.kind === 'video' ? (
                          <video
                            controls
                            playsInline
                            preload="none"
                            src={`/api/v1/media/${id}/file`}
                            aria-label="معاينة فيديو النشر"
                          />
                        ) : (
                          <img
                            src={`/api/v1/media/${id}/file`}
                            alt="صورة مختارة للنشر"
                          />
                        )
                      ) : (
                        <p role="status">
                          {asset?.status === 'rejected'
                            ? 'رُفض الملف؛ احذفه واختر غيره'
                            : 'يجري تجهيز الوسيط…'}
                        </p>
                      )}
                      <button
                        type="button"
                        aria-label="إزالة الوسيط من المنشور"
                        onClick={() =>
                          setSelected((previous) =>
                            previous.filter((value) => value !== id),
                          )
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="social-upload-empty">
                <ImagePlus size={48} aria-hidden="true" />
                <h2>حكاية تبدأ بصورة.</h2>
                <p>
                  صور حتى5ميغابايت، أو فيديو MP4 حتى20ميغابايت. تعالج الملفات
                  قبل النشر.
                </p>
              </div>
            )}
            <label className="social-button social-upload-label">
              {busy ? 'يجري الرفع…' : 'اختر صوراً أو فيديو'}
              <input
                type="file"
                accept={
                  kind === 'reel'
                    ? 'video/mp4'
                    : 'image/jpeg,image/png,image/webp,video/mp4'
                }
                multiple={kind === 'post'}
                disabled={busy || !interactive}
                onChange={(e) => {
                  void choose(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {progress !== null && (
              <label>
                تقدم الرفع
                <progress max={100} value={progress}>
                  {progress}%
                </progress>
              </label>
            )}
            <p className="social-private-note">
              <LockKeyhole size={15} /> وسائط المجتمع منفصلة عن السجل الطبي
              ومرفقات الرسائل.
            </p>
          </div>
          <form className="social-studio-form" onSubmit={publish}>
            <ol className="social-steps">
              <li className={stage === 1 ? 'current' : ''}>
                <span>{stage === 2 ? <Check size={13} /> : '1'}</span> اختر
                اللحظة
              </li>
              <li className={stage === 2 ? 'current' : ''}>
                <span>2</span> احكِ وانشر
              </li>
            </ol>
            <div
              className="social-kind-tabs"
              role="group"
              aria-label="نوع المنشور"
            >
              {[
                ['post', 'منشور'],
                ['story', 'قصة'],
                ['reel', 'ريل'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  aria-pressed={kind === value}
                  onClick={() => changeKind(value!)}
                >
                  {label}
                </button>
              ))}
            </div>
            {stage === 1 ? (
              <>
                <h2>ما الذي ستشاركه اليوم؟</h2>
                <p>اختر وسائط جديدة، أو استخدم ملفاً سبق رفعه وتجهيزه.</p>
                <label>
                  وسيط جاهز من حسابك
                  <select
                    aria-label="إضافة وسيط جاهز"
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        setSelected((previous) => [
                          ...previous,
                          e.target.value,
                        ]);
                    }}
                    disabled={
                      selected.length >= (kind === 'post' ? 10 : 1) || busy
                    }
                  >
                    <option value="">اختر من وسائطك</option>
                    {assets
                      .filter(
                        (a) =>
                          a.status === 'ready' &&
                          !selected.includes(a.id) &&
                          (kind !== 'reel' || a.kind === 'video'),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kind === 'video' ? 'فيديو' : 'صورة'} ·{' '}
                          {a.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="social-button"
                  disabled={busy || !ready}
                  onClick={() => setStage(2)}
                >
                  التالي: كتابة الحكاية
                </button>
              </>
            ) : (
              <>
                <label>
                  حكاية المنشور
                  <textarea
                    name="body"
                    required
                    maxLength={3000}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      try {
                        localStorage.setItem(draftKey, e.target.value);
                      } catch {
                        /* optional */
                      }
                    }}
                    placeholder="أخبرنا عن هذه اللحظة…"
                  />
                </label>
                <label>
                  من يرى حكايتك؟
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="public">عام، وفق خصوصية حسابي</option>
                    <option value="followers">المتابعون المقبولون</option>
                    <option value="private">أنا فقط</option>
                  </select>
                </label>
                {kind === 'story' && (
                  <p>
                    القصة تظهر24ساعة. إضافتها إلى المميزة تحتاج موافقة منفصلة من
                    الإعدادات.
                  </p>
                )}
                {draftNotice && <p role="status">{draftNotice}</p>}
                <button
                  type="submit"
                  className="social-button"
                  disabled={
                    busy ||
                    !ready ||
                    !body.trim() ||
                    (kind === 'reel' && !selected.length)
                  }
                >
                  {busy
                    ? 'نحفظ حكايتك…'
                    : !ready
                      ? 'بانتظار جاهزية الوسائط'
                      : 'نشر الحكاية'}
                </button>
                <button
                  type="button"
                  className="social-text-button"
                  onClick={() => setStage(1)}
                >
                  العودة للوسائط
                </button>
              </>
            )}
            {error && stage === 2 && (
              <p role="alert" className="social-error">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </SocialShell>
  );
}
