import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpLeft, ArrowLeft, Plus } from 'lucide-react';
import { Brand } from '../components/brand';
import { ServiceFinder } from '../components/service-finder';
import { PublicExperience } from '../components/public-experience';

const questions = [
  [
    'ما الذي أستطيع فعله في Petra؟',
    'أنشئ ملفاً لحيوانك، واستكشف المواعيد والخدمات المنشورة، وتصفّح متاجر العيادات، وشارك في المجتمع. تحتاج بعض الخدمات إلى تسجيل الدخول وموافقات محددة.',
  ],
  [
    'من يستطيع رؤية الملف الطبي؟',
    'صاحب الحيوان والأشخاص المخوّلون ضمن نطاق الرعاية وموافقاتها. مشاركة منشور في المجتمع لا تجعل الملف الطبي أو مرفقاته عامة.',
  ],
  [
    'هل أستطيع الانضمام كطبيب أو عيادة؟',
    'نعم. أنشئ حساباً، ثم قدّم طلب اعتماد من مساحتك. تُراجع الطلبات قبل منح الصلاحيات المهنية. العضوية لا تعني تحققاً خارجياً من الترخيص.',
  ],
  [
    'هل الدفع متاح حالياً؟',
    'العمليات المالية الحالية اختبارية. لن تُفعّل المدفوعات الحقيقية قبل اعتماد مزود الدفع واستكمال متطلبات التشغيل.',
  ],
];

export default function Home() {
  return (
    <PublicExperience>
      <header className="petra-site-header petra-container">
        <Brand />
        <nav aria-label="التنقل الرئيسي">
          <a href="#services">عالم Petra</a>
          <a href="#journey">كيف نعتني بهم؟</a>
          <a href="#community">مجتمعنا</a>
        </nav>
        <Link href="/login" className="petra-login">
          تسجيل الدخول <ArrowUpLeft size={17} aria-hidden="true" />
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <section
          className="petra-intro petra-container petra-intro-rebuild"
          aria-labelledby="petra-title"
        >
          <div className="petra-hero-copy">
            <h1 id="petra-title">
              كلّ يوم،
              <br />
              <span>أقرب إليهم.</span>
            </h1>
            <div className="petra-intro-bottom">
              <p>
                من أول موعد إلى تفاصيل كل يوم. رعاية، مستلزمات، ورفقة تجمع كل ما
                يخص حيوانك في مكان واحد.
              </p>
              <div className="petra-hero-actions">
                <Link href="/care" className="button primary">
                  ابدأ رحلة الرعاية <ArrowUpLeft size={20} aria-hidden="true" />
                </Link>
                <Link href="/social" className="petra-hero-social">
                  اكتشف حكايات الرفاق{' '}
                  <ArrowUpLeft size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <p className="petra-hero-footnote">
              لهم مساحة في حياتك. ولهم عالم في Petra.
            </p>
          </div>
          <div className="petra-cover">
            <Image
              src="/images/companions.png"
              alt="قطة وكلب في صورة مُنشأة لهوية Petra"
              width={1536}
              height={1024}
              priority
              sizes="(max-width: 760px) 94vw, 52vw"
            />
            <div className="petra-cover-caption">
              <span>لأنهم جزء من العائلة.</span>
              <span lang="en" dir="ltr">
                A little closer. Every day.
              </span>
            </div>
          </div>
          <ServiceFinder />
        </section>

        <section
          id="services"
          tabIndex={-1}
          className="petra-world petra-container"
          aria-labelledby="petra-world-title"
        >
          <div className="petra-section-heading">
            <h2 id="petra-world-title">
              عالم كامل.
              <br />
              لرفيقك الصغير.
            </h2>
            <p>
              تختلف احتياجاتهم، ويبقى اهتمامك واحداً.
              <br />
              اختر من أين تبدأ، ودع التفاصيل تأخذ مكانها.
            </p>
          </div>
          <div className="petra-editorial-grid">
            <Link
              href="/care/directory"
              className="petra-story petra-story-care"
            >
              <div className="petra-story-image">
                <Image
                  src="/images/care.png"
                  alt="صورة توضيحية لفحص قطة برفق"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 760px) 94vw, 60vw"
                />
              </div>
              <div className="petra-story-copy">
                <div>
                  <h3>اطمئنان، في كل زيارة.</h3>
                  <p>أطباء وعيادات ومواعيد، وملف يحتفظ بتفاصيل الرعاية.</p>
                </div>
                <ArrowUpLeft size={26} aria-hidden="true" />
              </div>
            </Link>
            <Link href="/marketplace" className="petra-story petra-story-shop">
              <div className="petra-story-image">
                <Image
                  src="/images/essentials.png"
                  alt="تكوين توضيحي لمستلزمات الحيوانات الأليفة"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 760px) 94vw, 38vw"
                />
              </div>
              <div className="petra-story-copy">
                <div>
                  <h3>تفاصيل تصنع يومهم.</h3>
                  <p>مستلزمات ومنتجات من متاجر العيادات.</p>
                </div>
                <ArrowUpLeft size={26} aria-hidden="true" />
              </div>
            </Link>
          </div>
          <div className="petra-service-index">
            <Link href="/taxi">
              <span>نقل الحيوانات</span>
              <span>
                رحلتهم، بترتيب أوضح <ArrowUpLeft size={19} aria-hidden="true" />
              </span>
            </Link>
            <Link href="/services">
              <span>الباقات والإقامة</span>
              <span>
                لأيامهم معك، وأيام سفرك{' '}
                <ArrowUpLeft size={19} aria-hidden="true" />
              </span>
            </Link>
            <Link href="/grooming">
              <span>العناية والتجميل</span>
              <span>
                اهتمام بالتفاصيل الصغيرة{' '}
                <ArrowUpLeft size={19} aria-hidden="true" />
              </span>
            </Link>
            <Link href="/home-visits">
              <span>الزيارات المنزلية</span>
              <span>
                الرعاية في مكانهم المألوف{' '}
                <ArrowUpLeft size={19} aria-hidden="true" />
              </span>
            </Link>
          </div>
        </section>

        <section
          id="journey"
          tabIndex={-1}
          className="petra-journey"
          aria-labelledby="petra-journey-title"
        >
          <div className="petra-container">
            <div className="petra-section-heading">
              <h2 id="petra-journey-title">
                الرعاية تبدأ
                <br />
                بمعرفتهم أكثر.
              </h2>
              <p>
                حساب واحد يحفظ التفاصيل.
                <br />
                وأنت تختار متى تشاركها، ومع من.
              </p>
            </div>
            <ol className="petra-steps">
              <li>
                <h3>عرّفنا برفيقك</h3>
                <p>
                  أنشئ حسابك وأضف ملف حيوانك وبياناته الأساسية. لكل رفيق مساحة
                  تخصّه.
                </p>
                <Link href="/register">
                  أنشئ حسابك <ArrowLeft size={17} aria-hidden="true" />
                </Link>
              </li>
              <li>
                <h3>اختر ما يحتاجه</h3>
                <p>
                  استكشف الجهات والخدمات والأوقات المنشورة، وراجع التفاصيل قبل
                  تأكيد طلبك.
                </p>
                <Link href="/care/directory">
                  استكشف الرعاية <ArrowLeft size={17} aria-hidden="true" />
                </Link>
              </li>
              <li>
                <h3>ابقَ قريباً من التفاصيل</h3>
                <p>
                  تابع المواعيد والسجل من حسابك، وشارك المعلومات الطبية بموافقتك
                  وفي نطاقها.
                </p>
                <Link href="/care">
                  افتح مركز الرعاية <ArrowLeft size={17} aria-hidden="true" />
                </Link>
              </li>
            </ol>
          </div>
        </section>

        <section
          id="community"
          tabIndex={-1}
          className="petra-community petra-container"
          aria-labelledby="petra-community-title"
        >
          <div className="petra-community-photo">
            <Image
              src="/images/companion.png"
              alt="صورة توضيحية لقطة تستريح قرب نافذة"
              width={1536}
              height={1024}
              sizes="(max-width: 760px) 94vw, 48vw"
            />
          </div>
          <div className="petra-community-copy">
            <h2 id="petra-community-title">
              حكايات صغيرة.
              <br />
              روابط تبقى.
            </h2>
            <p>
              صورة من يومهم، سؤال يشغلك، أو فرصة لبيت جديد. مساحة يجمعنا فيها
              حبّهم، مع خيارات للخصوصية والتحكم بمن تتواصل معه.
            </p>
            <Link href="/social" className="button primary">
              تعرّف على المجتمع <ArrowUpLeft size={20} aria-hidden="true" />
            </Link>
            <Link href="/adoption" className="petra-inline-link">
              اكتشف التبني والإنقاذ <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section
          className="petra-faq petra-container"
          aria-labelledby="petra-faq-title"
        >
          <h2 id="petra-faq-title">قبل أن تبدأ.</h2>
          <div>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={21} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className="petra-closing petra-container"
          aria-labelledby="petra-closing-title"
        >
          <h2 id="petra-closing-title">
            مساحة لك.
            <br />
            وعالم لهم.
          </h2>
          <div>
            <p>
              خطوتك الأولى بسيطة.
              <br />
              أنشئ حساباً، وابدأ بملف رفيقك.
            </p>
            <Link href="/register" className="button primary">
              انضم إلى Petra <ArrowUpLeft size={20} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="petra-footer">
        <div className="petra-container">
          <div className="petra-footer-top">
            <Brand light />
            <p>نقرّب الرعاية، ونترك للحبّ مساحته.</p>
            <nav aria-label="روابط إضافية">
              <Link href="/care">الرعاية</Link>
              <Link href="/marketplace">المتجر</Link>
              <Link href="/social">المجتمع</Link>
              <Link href="/login">حسابك</Link>
            </nav>
          </div>
          <div className="petra-footer-bottom">
            <span>Petra · العراق</span>
            <span>المعاملات المالية حالياً اختبارية.</span>
            <Link href="/security">
              أمان الحساب والخصوصية <ArrowUpLeft size={16} aria-hidden="true" />
            </Link>
          </div>
          <span
            className="petra-footer-word"
            aria-hidden="true"
            lang="en"
            dir="ltr"
          >
            petra.
          </span>
        </div>
      </footer>
    </PublicExperience>
  );
}
