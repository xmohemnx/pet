import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpLeft,
  ArrowLeft,
  Heart,
  Stethoscope,
  ShoppingBag,
  CarFront,
  House,
  Sparkles,
  PawPrint,
  ShieldCheck,
  CalendarDays,
  Check,
  MoveUpLeft,
} from 'lucide-react';
import { Brand } from '../components/brand';
const services = [
  {
    icon: Stethoscope,
    title: 'رعاية تشبه حبّك لهم',
    text: 'عيادات وأطباء، ومكان واحد لكل تفاصيل صحتهم.',
    tag: 'الصحة والرعاية',
    tone: 'mint',
  },
  {
    icon: ShoppingBag,
    title: 'كل ما يجعل يومهم أجمل',
    text: 'منتجات وخدمات من متاجر العيادات، في تجربة واحدة.',
    tag: 'متجر العيادات',
    tone: 'peach',
  },
  {
    icon: Heart,
    title: 'فرصة جديدة، لحكاية جديدة',
    text: 'مساحة للتبني والإنقاذ، ومجتمع يهتم فعلًا.',
    tag: 'المجتمع والتبني',
    tone: 'lavender',
  },
];
export default function Home() {
  return (
    <>
      <div className="announcement">
        نبني Petra معًا <span>✦</span> حسابات ورعاية وخدمات متصلة — المعاملات
        المالية اختبارية
      </div>
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="التنقل الرئيسي">
          <a href="#services">عالم Petra</a>
          <a href="#journey">كيف نعتني بهم؟</a>
          <a href="#community">مجتمعنا</a>
        </nav>
        <Link href="/login" className="button small outline">
          تسجيل الدخول <ArrowUpLeft size={17} />
        </Link>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy reveal">
            <span className="eyebrow">
              <span className="tiny-paw">
                <PawPrint size={15} />
              </span>{' '}
              لهم في قلبك مكان. ولهم عندنا عالم.
            </span>
            <h1>
              كل حكاية جميلة
              <br />
              تبدأ{' '}
              <span className="serif-accent">
                برعاية<span className="title-dot">.</span>
              </span>
            </h1>
            <p>
              لأنهم أكثر من حيوانات أليفة، جمعنا لك عالمًا من الرعاية والخدمات
              والرفقة. أنت تهتم بالحب، ونحن نسهّل الباقي.
            </p>
            <div className="hero-actions">
              <Link href="/care" className="button primary">
                ابدأ رحلة الرعاية <ArrowUpLeft size={20} />
              </Link>
              <a href="#services" className="text-link">
                تعرّف على عالمهم <ArrowLeft size={18} />
              </a>
            </div>
            <div className="hero-note">
              <span className="mini-paws">
                <PawPrint />
                <Heart />
                <ShieldCheck />
              </span>
              <span>صُمّمت بحبّ للحيوان، وراحة للإنسان.</span>
            </div>
          </div>
          <div className="hero-art reveal">
            <div className="orbit-label" lang="en" dir="ltr">
              A LITTLE LOVE. A WHOLE WORLD.
            </div>
            <div className="garden-frame">
              <Image
                src="/pet-garden.svg"
                alt="قطة وكلب في حديقة؛ رسم أصلي لهوية Petra"
                width={700}
                height={720}
                priority
              />
            </div>
            <div className="floating-note care-note">
              <span className="note-icon">
                <Heart size={21} />
              </span>
              <div>
                <strong>عائلة واحدة، رعاية متكاملة</strong>
                <small>من أول يوم، وفي كل خطوة.</small>
              </div>
              <span className="spark">✦</span>
            </div>
            <div className="floating-note pet-note">
              <span className="pet-note-paw">
                <PawPrint size={22} />
              </span>
              <span>
                تفاصيل صغيرة.
                <br />
                <strong>حبّ بلا حدود.</strong>
              </span>
            </div>
            <span className="art-spark spark-one">✳</span>
            <span className="art-spark spark-two">✦</span>
            <span className="art-number" dir="ltr">
              01 / THE PETRA WAY
            </span>
          </div>
        </section>
        <div className="values-strip">
          <div className="wrap values">
            <span>
              <PawPrint />
              لأنهم جزء من العائلة
            </span>
            <span>
              <ShieldCheck />
              رعاية بخصوصية واهتمام
            </span>
            <span>
              <Heart />
              مجتمع يجمعنا حبّهم
            </span>
            <span>
              <Sparkles />
              تفاصيل تصنع الفرق
            </span>
          </div>
        </div>
        <section id="services" className="section wrap">
          <div className="section-heading">
            <div>
              <span className="eyebrow">عالم كامل، لأجلهم</span>
              <h2>
                احتياجات كثيرة.
                <br />
                ومكان واحد يهتم.
              </h2>
            </div>
            <p>
              من الاطمئنان على صحتهم إلى تفاصيل يومهم،
              <br />
              كل رحلة تبدأ بخطوة بسيطة.
            </p>
          </div>
          <div className="service-grid">
            {services.map((s, i) => (
              <Link
                key={s.title}
                href={
                  i === 1 ? '/marketplace' : i === 2 ? '/adoption' : '/care'
                }
                className={`service-card ${s.tone}`}
              >
                <div className="service-top">
                  <s.icon size={30} strokeWidth={1.5} />
                  <span className="round-arrow">
                    <ArrowUpLeft size={20} />
                  </span>
                </div>
                <span className="service-tag">{s.tag}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <span className="service-foot">
                  استكشف القسم <ArrowLeft size={17} />
                </span>
              </Link>
            ))}
          </div>
          <div className="service-extras">
            <Link href="/taxi">
              <CarFront size={20} /> Pet Taxi
            </Link>
            <Link href="/services">
              <House size={20} /> إقامة مريحة
            </Link>
            <Link href="/care">
              <Sparkles size={20} /> عناية وتجميل
            </Link>
            <small>الأوقات والخدمات تظهر عندما تنشرها الجهات المعتمدة</small>
          </div>
        </section>
        <section id="journey" className="journey-section">
          <div className="wrap journey-layout">
            <div className="journey-preview">
              <div className="preview-top">
                <span className="preview-icon">
                  <PawPrint />
                </span>
                <span>رفيقك، في قلب التجربة</span>
                <span className="small-chip">نموذج تصميم</span>
              </div>
              <div className="preview-pet">
                <div className="cat-avatar">ل</div>
                <div>
                  <h3>أهلًا، لونا</h3>
                  <p>كل تفاصيلك الجميلة، في مكان واحد.</p>
                </div>
                <Heart className="preview-heart" />
              </div>
              <div className="preview-reminder">
                <CalendarDays />
                <div>
                  <strong>موعد للاطمئنان</strong>
                  <p>سجل مرتب، ورحلة رعاية أوضح.</p>
                </div>
                <Check size={20} />
              </div>
              <div className="preview-line">
                <span>ملف الحيوان</span>
                <span>التقويم</span>
                <span>المتابعة</span>
              </div>
            </div>
            <div className="journey-copy">
              <span className="eyebrow">أقرب لهم. أسهل لك.</span>
              <h2>
                من أول «أهلًا»،
                <br />
                إلى كل يوم معًا.
              </h2>
              <div className="steps">
                {[
                  [
                    '01',
                    'عرّفنا على رفيقك',
                    'ملف يجمع التفاصيل التي تحتاجها رعايته.',
                  ],
                  [
                    '02',
                    'اختر الرعاية المناسبة',
                    'اكتشف العيادات والخدمات التي تناسب رحلتكم.',
                  ],
                  ['03', 'ابقَ مطمئنًا', 'مواعيد وسجل ومتابعة، بصورة أوضح.'],
                ].map(([n, t, d]) => (
                  <div className="step" key={n}>
                    <span dir="ltr">{n}</span>
                    <div>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/care" className="text-link">
                جرّب مساحة العميل <ArrowLeft size={18} />
              </Link>
            </div>
          </div>
        </section>
        <section id="community" className="community wrap section">
          <div>
            <span className="eyebrow">حبّهم يجمعنا</span>
            <h2>
              كل رفيق يستحق
              <br />
              حكاية فيها دفء.
            </h2>
            <p>
              نبني مساحة لأصحاب الحيوانات والأطباء والعيادات؛ للرعاية، وللمعرفة،
              ولفرص البدايات الجديدة.
            </p>
            <Link href="/care" className="button primary">
              شاهد ملامح التجربة <ArrowUpLeft size={19} />
            </Link>
          </div>
          <div className="community-art" aria-hidden="true">
            <span className="community-word">
              معًا<span>لأجلهم.</span>
            </span>
            <PawPrint className="big-paw" />
            <span className="community-bubble">
              <Heart size={38} strokeWidth={1.3} />
            </span>
            <span className="community-caption">
              SMALL PAWS, BIG CONNECTIONS
            </span>
          </div>
        </section>
        <section className="final-cta wrap">
          <span className="eyebrow">هذه البداية فقط</span>
          <h2>عالمهم أجمل، وأنت معهم.</h2>
          <p>أنشئ ملف رفيقك وتابع رعايته وخدماته من حسابك.</p>
          <Link href="/care" className="button cream">
            ادخل التجربة <MoveUpLeft size={20} />
          </Link>
        </section>
      </main>
      <footer className="footer wrap">
        <Brand />
        <p>Petra · رعاية بحبّ، في كل خطوة.</p>
        <span>قيد البناء · نسخة تجريبية ٢٠٢٦</span>
      </footer>
    </>
  );
}
