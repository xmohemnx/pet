'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Brand } from '../../../components/brand';
import {
  Camera,
  Heart,
  MessageCircle,
  Play,
  ArrowUpLeft,
  PawPrint,
} from 'lucide-react';
const directions = [
  {
    id: 'journal',
    name: 'يوميات الرفاق',
    lead: 'صور المجتمع أولاً',
    description:
      'موجز واضح، قصص في الأعلى، واكتشاف جانبي على الحاسوب. هذا هو النموذج العامل المرجح لاختيارك.',
  },
  {
    id: 'magazine',
    name: 'حكاية اليوم',
    lead: 'الاكتشاف يقوده السرد',
    description:
      'مجلة صور ذات حكاية بارزة ومحتوى متفاوت الأحجام، مع شرح بجانب مشاهد الريلز.',
  },
  {
    id: 'circles',
    name: 'دوائر الرفقة',
    lead: 'الاهتمامات تقود التصفح',
    description:
      'الموضوعات أولاً؛ يتغير الموجز حسب الدائرة، مع محادثات قريبة وقائمة ريلز بحسب الموضوع.',
  },
];
function Picture({
  source = 'companion',
  title = 'مكانها المفضل في البيت.',
}: {
  source?: string;
  title?: string;
}) {
  return (
    <figure>
      <img src={`/images/${source}.png`} alt="صورة مفهومية لمخطط تصميم فقط" />
      <figcaption>
        <strong>{title}</strong>
        <div>
          <Heart size={16} />
          <MessageCircle size={16} />
          <span>تفاعل مع الحكاية</span>
        </div>
      </figcaption>
    </figure>
  );
}
export default function Page() {
  const [selected, setSelected] = useState(0),
    [mobile, setMobile] = useState(false),
    direction = directions[selected]!;
  return (
    <div className="social-app social-concepts">
      <header>
        <Brand />
        <Link href="/social">
          فتح النموذج العامل <ArrowUpLeft size={17} />
        </Link>
      </header>
      <main id="main">
        <h1>ثلاث طرق لحكاية واحدة.</h1>
        <p>
          مخططات توضيحية لمقارنة تنظيم الشاشة؛ الصور والمحتوى هنا مفهومان
          للتصميم، وليسا منشورات مستخدمين أو وظائف مكتملة.
        </p>
        <div
          className="social-concept-tabs"
          role="group"
          aria-label="اختيار بديل التصميم"
        >
          {directions.map((option, i) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              {option.name}
            </button>
          ))}
        </div>
        <div className="social-concept-description">
          <div>
            <h2>{direction.lead}</h2>
            <p>{direction.description}</p>
          </div>
          <button
            type="button"
            className="social-button secondary"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? 'مقارنة الحاسوب' : 'مقارنة الهاتف'}
          </button>
        </div>
        <div
          className={`social-concept-sketch ${direction.id} ${mobile ? 'phone' : ''}`}
        >
          <div className="social-concept-bar">
            <Brand />
            <span>{direction.name}</span>
            <Camera size={23} />
          </div>
          {selected === 0 ? (
            <div className="concept-journal">
              <nav>
                <span>المجتمع</span>
                <span>الريلز</span>
                <span>الرسائل</span>
                <span>ملفي</span>
              </nav>
              <section>
                <div className="concept-stories">
                  {['لولو', 'رفاق', 'يوميات', 'قصتك'].map((name) => (
                    <span key={name}>
                      <PawPrint size={24} />
                      {name}
                    </span>
                  ))}
                </div>
                <Picture />
              </section>
              <aside>
                <h3>رفقة تستحق المعرفة</h3>
                <p>تكتشف الأشخاص من هنا دون أن يزاحموا الصورة.</p>
              </aside>
            </div>
          ) : selected === 1 ? (
            <div className="concept-magazine">
              <div className="concept-magazine-title">
                <h3>حكايات نعود إليها.</h3>
                <p>من يوم عادي، لذكرى تبقى.</p>
              </div>
              <div className="concept-magazine-pictures">
                <Picture />
                <Picture source="care" title="الرعاية فعل محبة." />
                <Picture source="companions" title="رفقة جديدة كل يوم." />
              </div>
              <div className="concept-topics">
                <span>حكايات البيوت</span>
                <span>نصائح الرعاية</span>
                <span>لحظات مصورة</span>
              </div>
            </div>
          ) : (
            <div className="concept-circles">
              <nav>
                <h3>اختر دائرتك</h3>
                {['عالم القطط', 'رفقة الكلاب', 'رعاية يومية', 'بيت جديد'].map(
                  (name) => (
                    <span key={name}>{name}</span>
                  ),
                )}
              </nav>
              <section>
                <h3>من دائرة عالم القطط</h3>
                <div className="concept-circle-posts">
                  <Picture />
                  <Picture source="companions" title="أصدقاء من أول يوم." />
                </div>
              </section>
              <aside>
                <h3>حديث قريب</h3>
                <p>محادثاتك الحديثة في مكان منفصل عن المنشورات.</p>
              </aside>
            </div>
          )}
          <section className="concept-reel">
            <div>
              <Play size={32} />
              <span>مخطط مشاهد ريلز</span>
            </div>
            <p>
              {selected === 0
                ? 'فيديو رأسي واحد، مع تفاعل قريب وتنقل واضح.'
                : selected === 1
                  ? 'الفيديو والسرد جنباً إلى جنب، ثم ملء الشاشة على الهاتف.'
                  : 'فيديو من الدائرة المختارة، مع قائمة تشغيل يدوية.'}
            </p>
          </section>
        </div>
        <p className="social-concept-truth">
          مخطط للمقارنة فقط. الشريحة العاملة في{' '}
          <Link href="/social">مجتمع Petra</Link> متصلة بالبيانات والصلاحيات،
          ولا تعتمد على بيانات هذه الصفحة.
        </p>
      </main>
    </div>
  );
}
