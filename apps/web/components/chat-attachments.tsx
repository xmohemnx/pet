'use client';
import { useEffect, useRef, useState } from 'react';
import type { MediaAsset } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm, CareAction } from './care-shared';
import { Status } from './platform-shared';
export function ChatAttachments({
  peer,
  onReady,
  selectedId,
}: {
  peer: string;
  selectedId?: string;
  onReady: (asset: MediaAsset | null) => void;
}) {
  const requesting = useRef(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null),
    [recording, setRecording] = useState(false),
    [recorded, setRecorded] = useState<File | null>(null),
    [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearTimeout(timer.current);
    setRecording(false);
  }
  async function start() {
    if (requesting.current) return;
    requesting.current = true;
    setError('');
    setRecorded(null);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      )
        throw new Error('التسجيل غير مدعوم هنا؛ يمكنك رفع ملف صوتي');
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      if (!mime) throw new Error('صيغة التسجيل غير مدعومة؛ ارفع Ogg أو WAV');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const r = new MediaRecorder(media, {
        mimeType: mime,
        audioBitsPerSecond: 32000,
      });
      recorder.current = r;
      const chunks: Blob[] = [];
      let bytes = 0,
        oversize = false;
      r.ondataavailable = (e) => {
        bytes += e.data.size;
        if (bytes > 5 * 1024 * 1024) {
          oversize = true;
          stop();
          if (mounted.current) setError('التسجيل أكبر من الحد');
        } else chunks.push(e.data);
      };
      r.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (mounted.current) {
          setRecording(false);
          if (!oversize)
            setRecorded(
              new File(
                chunks,
                mime.includes('ogg') ? 'voice.ogg' : 'voice.webm',
                { type: mime },
              ),
            );
        }
      };
      r.onerror = () => {
        stop();
        if (mounted.current) setError('تعذر التسجيل؛ جرب ملفاً صوتياً');
      };
      r.start(1000);
      setRecording(true);
      timer.current = setTimeout(stop, 120000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'تعذر الوصول إلى الميكروفون');
    } finally {
      requesting.current = false;
    }
  }
  async function upload(file: File) {
    if (!file?.size) throw new Error('اختر ملفاً أو سجل مقطعاً أولاً');
    const audio =
      file.type.startsWith('audio/') ||
      /\.(ogg|wav|weba|webm)$/i.test(file.name);
    if (file.size > (audio ? 5 : 20) * 1024 * 1024)
      throw new Error('الملف أكبر من الحد');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]!);
      reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
      reader.readAsDataURL(file);
    });
    const result = await api<MediaAsset>('media', {
      method: 'POST',
      body: JSON.stringify({
        dataBase64: data,
        chatPeerId: peer,
        ...(audio ? { kind: 'audio' } : {}),
      }),
    });
    setAsset(result);
    onReady(result.status === 'ready' ? result : null);
  }
  return (
    <details>
      <summary>صوت أو مرفق خاص للمحادثة</summary>
      <p>
        صور حتى 5 ميغابايت، وMP4 حتى دقيقة و20 ميغابايت، وصوت Ogg/WAV/WebM حتى
        دقيقتين و5 ميغابايت. المرفق خاص بهذا القرين ولا يمكن نشره في المجتمع أو
        المتجر. لا تستخدم المحادثة الاجتماعية لإرسال مستندات طبية.
      </p>
      <CareForm
        label="رفع مرفق المحادثة"
        submit={(f) => upload(f.get('file') as File)}
      >
        <label>
          ملف المحادثة الخاص
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,audio/ogg,audio/wav,audio/webm"
            required
          />
        </label>
      </CareForm>
      <p>
        التسجيل لا يبدأ إلا بالزر وموافقة المتصفح. يتوقف تلقائياً بعد دقيقتين؛
        لا يرسل قبل رفعه ثم إرسال الرسالة.
      </p>
      {!recording ? (
        <button
          className="button outline"
          type="button"
          onClick={() => void start()}
        >
          تسجيل مقطع صوتي
        </button>
      ) : (
        <button className="button outline" type="button" onClick={stop}>
          إيقاف التسجيل
        </button>
      )}
      {recorded && (
        <CareAction action={() => upload(recorded)}>
          رفع التسجيل الخاص
        </CareAction>
      )}
      {error && <p role="alert">{error}</p>}
      {asset && (
        <>
          <p role="status">
            المرفق: <Status value={asset.status} />
            {asset.status === 'ready' && asset.id === selectedId
              ? ' · محدد للرسالة التالية.'
              : ''}
            {asset.failure ? ` · ${asset.failure}` : ''}
          </p>
          {asset.status === 'ready' && asset.id !== selectedId && (
            <CareAction action={async () => onReady(asset)}>
              اختيار المرفق للرسالة التالية
            </CareAction>
          )}
          <CareAction
            action={async () => {
              const list = await api<MediaAsset[]>(`media?chatPeerId=${peer}`),
                current = list.find((a) => a.id === asset.id);
              if (!current) throw new Error('المرفق غير متاح');
              setAsset(current);
              onReady(current.status === 'ready' ? current : null);
            }}
          >
            تحديث حالة مرفق المحادثة
          </CareAction>
          <CareAction
            action={async () => {
              setAsset(null);
              onReady(null);
            }}
          >
            إلغاء اختيار المرفق
          </CareAction>
        </>
      )}
    </details>
  );
}
