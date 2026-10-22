'use client';
import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { api } from '../lib/auth-client';
export function PrivateVideo({
  assetId,
  label,
}: {
  assetId: string;
  label: string;
}) {
  const element = useRef<HTMLVideoElement>(null),
    player = useRef<Hls | null>(null),
    mounted = useRef(true);
  const [adaptive, setAdaptive] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [levels, setLevels] = useState<{ index: number; height: number }[]>([]),
    [quality, setQuality] = useState(-1);
  const file = `/api/v1/media/${assetId}/file`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      player.current?.destroy();
    };
  }, []);
  function fallback() {
    player.current?.destroy();
    player.current = null;
    if (element.current) {
      element.current.pause();
      element.current.src = file;
    }
    setAdaptive(false);
    setLevels([]);
    setQuality(-1);
  }
  async function enable() {
    setLoading(true);
    setError('');
    try {
      const settings = await api<{
        available: boolean;
        manifest: string | null;
      }>(`media/${assetId}/hls`);
      if (!mounted.current) return;
      if (
        !settings.available ||
        !settings.manifest ||
        !new RegExp(`^/api/v1/media/${assetId}/streams/[a-f0-9-]{36}$`).test(
          settings.manifest,
        )
      )
        throw new Error(
          'لم تجهز نسخة البث المتكيف لهذا الفيديو؛ يمكنك تشغيل MP4',
        );
      const video = element.current;
      if (!video) return;
      if (video.canPlayType('application/vnd.apple.mpegurl'))
        video.src = settings.manifest;
      else {
        const { default: Engine } = await import('hls.js');
        if (!mounted.current) return;
        if (!Engine.isSupported())
          throw new Error('متصفحك لا يدعم HLS؛ استعمل MP4');
        const engine = new Engine({
          enableWorker: true,
          maxBufferLength: 12,
          backBufferLength: 10,
          maxMaxBufferLength: 24,
          manifestLoadingTimeOut: 8000,
          fragLoadingTimeOut: 10000,
        });
        player.current = engine;
        engine.on(Engine.Events.MANIFEST_PARSED, () => {
          if (mounted.current)
            setLevels(
              engine.levels.map((l, index) => ({ index, height: l.height })),
            );
        });
        engine.on(Engine.Events.ERROR, (_, data) => {
          if (data.fatal && mounted.current) {
            fallback();
            setError(
              'توقف البث المتكيف؛ يمكن إعادة المحاولة أو تشغيل MP4 بعد التحقق من الصلاحية والاتصال',
            );
          }
        });
        engine.attachMedia(video);
        engine.loadSource(settings.manifest);
      }
      setAdaptive(true);
    } catch (e) {
      if (mounted.current) {
        fallback();
        setError(e instanceof Error ? e.message : 'تعذر تحميل البث');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  return (
    <div className="private-video care-stack">
      <video
        ref={element}
        controls
        playsInline
        preload="none"
        src={file}
        aria-label={label}
      />
      {!adaptive ? (
        <button
          type="button"
          className="button outline"
          disabled={loading}
          onClick={() => void enable()}
        >
          {loading ? 'يجري تجهيز المشغل…' : 'اختيار تشغيل الفيديو المتكيف'}
        </button>
      ) : (
        <>
          <p role="status">
            البث المتكيف جاهز؛ اضغط تشغيل الفيديو. يتغير الوضوح وفق جودة اتصالك.
          </p>
          {levels.length > 0 && (
            <label>
              جودة الفيديو
              <select
                aria-label={`جودة ${label}`}
                value={quality}
                onChange={(e) => {
                  const selected = Number(e.target.value);
                  setQuality(selected);
                  if (player.current) player.current.currentLevel = selected;
                }}
              >
                <option value={-1}>تلقائية حسب الاتصال</option>
                {levels.map((l) => (
                  <option key={l.index} value={l.index}>
                    {l.height
                      ? `${l.height}p`
                      : l.index === 0
                        ? 'اقتصادية'
                        : 'قياسية'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="button outline" onClick={fallback}>
            العودة إلى MP4
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
