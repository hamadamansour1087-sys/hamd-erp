'use client'

/**
 * H.A.M.D — Marketing landing page.
 *
 * Company-first structure: who we are (about), the three programs we build
 * (dental clinics / dental labs / inventory & POS), the services around them,
 * then proof (videos, pricing, testimonials, FAQ).
 *
 * Content is Arabic-first by design (the target market is Arabic-speaking
 * clinics, labs and shops); the product itself is bilingual. CTAs open the
 * auth screen via onAuth — registration submits an APPROVAL REQUEST, it does
 * not grant instant access (see views/auth + api/auth/register).
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  Code2,
  FlaskConical,
  Globe,
  Headphones,
  Menu,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  TrendingUp,
  Users,
  Warehouse,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { triggerInstall, useInstaller } from '@/views/settings/settings-parts'

type LandingPageProps = {
  onAuth: () => void
}

/* ---------------------------------- data ---------------------------------- */

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '#about', label: 'من نحن' },
  { href: '#programs', label: 'برامجنا' },
  { href: '#services', label: 'خدماتنا' },
  { href: '#videos', label: 'الفيديوهات' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
]

interface Program {
  icon: LucideIcon
  name: string
  tagline: string
  desc: string
  features: ReadonlyArray<string>
  gradient: string
  /** 'live' → registration opens the real program; 'soon' → waiting-list only */
  status: 'live' | 'soon'
  soonNote?: string
}

const PROGRAMS: ReadonlyArray<Program> = [
  {
    icon: Stethoscope,
    name: 'برنامج إدارة عيادات الأسنان',
    tagline: 'عيادتك منظمة… ومريضك مطمئن',
    status: 'soon',
    soonNote: 'قيد التطوير — سنسلّمه قريباً بإذن الله',
    desc: 'نظام متكامل يدير عيادة الأسنان من أول حجز موعد حتى تسليم الفاتورة — ملف طبي كامل لكل مريض ومتابعة دقيقة للخطط العلاجية.',
    features: [
      'ملف طبي كامل لكل مريض بتاريخه وأشعته',
      'جدولة مواعيد الأطباء والكراسي البشتية',
      'خطط علاجية بالجلسات وتكلفة كل جلسة',
      'فواتير ومتابعة مدفوعات وأقساط المرضى',
      'تقارير إنتاجية الأطباء وأكثر الخدمات طلبًا',
      'تنبيهات متابعة المرضى والمواعيد القادمة',
    ],
    gradient: 'from-teal-500 to-emerald-700',
  },
  {
    icon: FlaskConical,
    name: 'برنامج إدارة معامل الأسنان',
    tagline: 'من أمر الشغل… حتى التسليم',
    status: 'soon',
    soonNote: 'قيد التطوير — سنسلّمه قريباً بإذن الله',
    desc: 'مصمم خصيصًا لمعامل التركيبات: تتبّع كل حالة شغل مرحلة بمرحلة، ومتابعة الفنيين، وحسابات دقيقة مع العيادات.',
    features: [
      'استقبال أوامر الشغل من العيادات إلكترونيًا',
      'تتبع مراحل التصنيع (طبع، قوالب، خزف، تركيب)',
      'متابعة إنتاج الفنيين ومواعيد التسليم',
      'فواتير وحسابات جارية مع كل عيادة',
      'سجل كامل لكل حالة وأسنان العملية',
      'تقارير إنتاج المعمل والعملاء الأكثر تعاملًا',
    ],
    gradient: 'from-cyan-600 to-teal-700',
  },
  {
    icon: Warehouse,
    name: 'برنامج المخزون ونقاط البيع',
    tagline: 'محلك كله… من شاشتك',
    status: 'live',
    desc: 'نظام نقاط بيع ومخازن وفواتير يعمل أونلاين وأوفلاين — للبقالات والمحلات والصيدليات وأي نشاط يبيع ويشتري.',
    features: [
      'نقطة بيع فائقة السرعة بالباركود والاختصارات',
      'مخازن متعددة وتحويلات وجرد دقيق',
      'فواتير حرارية 58/80mm وفواتير A4 رسمية',
      'عملاء وموردون وكشوف حسابات وحدود ائتمان',
      'تقارير مبيعات وأرباح ومصروفات لحظية',
      'يعمل بدون إنترنت والمزامنة تلقائية عند العودة',
    ],
    gradient: 'from-emerald-500 to-emerald-800',
  },
]

interface Service {
  icon: LucideIcon
  title: string
  desc: string
}

const SERVICES: ReadonlyArray<Service> = [
  {
    icon: Code2,
    title: 'تطوير برامج مخصصة',
    desc: 'نبني لك برنامجًا على مقاس نشاطك بالضبط — من فهم احتياجك حتى التسليم والتشغيل.',
  },
  {
    icon: Smartphone,
    title: 'تطبيقات موبايل',
    desc: 'تطبيقات Android و iOS تربط عملاءك وموظفيك بنظامك في أي وقت ومن أي مكان.',
  },
  {
    icon: Globe,
    title: 'مواقع وتطبيقات ويب',
    desc: 'مواقع تعريفية ومتاجر إلكترونية عصرية سريعة ومتوافقة مع الجوال ومحركات البحث.',
  },
  {
    icon: Store,
    title: 'أنظمة نقاط البيع والمخازن',
    desc: 'حلول متكاملة للبيع والمخزون والفواتير — تشغيل سريع وربط بالطابعات الحرارية والباركود.',
  },
  {
    icon: Headphones,
    title: 'دعم فني وتدريب',
    desc: 'فريق دعم يرد عليك بسرعة، وتدريب عملي لفريقك حتى يتقن النظام من أول يوم.',
  },
  {
    icon: Wrench,
    title: 'صيانة وتطوير مستمر',
    desc: 'تحديثات دورية وأمان محدّث ونسخ احتياطية — نظامك يعمل دائمًا بأحدث إصدار.',
  },
]

const ABOUT_STATS: ReadonlyArray<{ icon: LucideIcon; value: string; label: string }> = [
  { icon: Sparkles, value: '٣ برامج متخصصة', label: 'عيادات ومعامل أسنان ومخازن ونقاط بيع' },
  { icon: Users, value: 'عربي / إنجليزي', label: 'واجهة مزدوجة بقلب كامل RTL/LTR' },
  { icon: WifiOff, value: 'أونلاين وأوفلاين', label: 'تشتغل حتى بدون إنترنت وتتزامن تلقائيًا' },
  { icon: ShieldCheck, value: 'بياناتك ملكك', label: 'صلاحيات دقيقة ونسخ احتياطي بضغطة' },
]

const STEPS: ReadonlyArray<{ n: string; title: string; desc: string }> = [
  { n: '١', title: 'أرسل طلبك', desc: 'سجّل بيانات نشاطك في دقيقة — وسيصلك تأكيد استلام الطلب فورًا.' },
  { n: '٢', title: 'نراجع ونفعّل', desc: 'يتواصل معك فريق H.A.M.D ويفعّل حسابك وتبدأ فترتك التجريبية المجانية.' },
  { n: '٣', title: 'ابدأ العمل', desc: 'إعداد كامل في أقل من عشر دقائق — أول فاتورة لك في نفس اليوم.' },
]

const VIDEOS: ReadonlyArray<{
  id: string
  title: string
  desc: string
  duration: string
  gradient: string
}> = [
  {
    id: 'v-intro',
    title: 'جولة تعريفية بالنظام',
    desc: 'كل ما تحتاج معرفته في أقل من دقيقة.',
    duration: '٤٤ ثانية',
    gradient: 'from-emerald-500 to-teal-700',
  },
  {
    id: 'v-pos',
    title: 'نقطة البيع خطوة بخطوة',
    desc: 'من الباركود لإصدار الفاتورة وسند القبض.',
    duration: '٥٨ ثانية',
    gradient: 'from-emerald-600 to-emerald-900',
  },
  {
    id: 'v-stock',
    title: 'إدارة المخازن والمخزون',
    desc: 'أرصدة، تحويلات، جرد، وتنبيهات النقص.',
    duration: '٥١ ثانية',
    gradient: 'from-teal-600 to-emerald-800',
  },
  {
    id: 'v-reports',
    title: 'الفواتير والتقارير والإعدادات',
    desc: 'صمّم فاتورتك وتابع أرباحك.',
    duration: '٦٣ ثانية',
    gradient: 'from-emerald-400 to-teal-800',
  },
]

const PLANS: ReadonlyArray<{
  name: string
  price: string
  period: string
  desc: string
  features: ReadonlyArray<string>
  highlighted?: boolean
  cta: string
}> = [
  {
    name: 'تجريبي',
    price: 'مجاناً',
    period: '١٤ يوماً',
    desc: 'جرّب النظام كاملاً بعد الموافقة على طلبك — بدون أي التزام.',
    features: [
      '١٤ يوماً تجربة كاملة بعد التفعيل',
      'كل المميزات مفتوحة',
      'بدون بطاقة ائتمان',
      'دعم عبر البريد',
    ],
    cta: 'ابدأ التجربة',
  },
  {
    name: 'أساسي',
    price: 'تواصل معنا',
    period: 'شهرياً',
    desc: 'مثالي للعيادات والمعامل والمحلات الفردية.',
    features: [
      'نظامك كامل بكل الأقسام',
      'فواتير احترافية بشعارك',
      'دعم فني وتدريب الفريق',
      'تحديثات مستمرة',
    ],
    highlighted: true,
    cta: 'اطلب عرض سعر',
  },
  {
    name: 'احترافي',
    price: 'تواصل معنا',
    period: 'شهرياً',
    desc: 'للنشاطات التي تملك فروعاً وعدة مستخدمين.',
    features: [
      'فروع ومخازن متعددة',
      'مستخدمون بلا حدود بصلاحيات دقيقة',
      'طباعة حرارية 58/80mm',
      'نسخ احتياطي ومتابعة أولوية',
    ],
    cta: 'تواصل معنا',
  },
]

const TESTIMONIALS: ReadonlyArray<{ quote: string; name: string; business: string }> = [
  {
    quote: 'الكاشير اتعلمه في يوم، والطباعة الحرارية بتصدر الفاتورة في ثانية — وبيشتغل أوفلاين فعلاً.',
    name: 'سارة',
    business: 'سوبر ماركت',
  },
  {
    quote: 'أول مرة أعرف ربحي الحقيقي بنهاية كل يوم — المبيعات والمصروفات والمخزون قدامي في شاشة واحدة.',
    name: 'أحمد',
    business: 'بقالة وميني ماركت',
  },
  {
    quote: 'حدود الائتمان وكشوف الحسابات نظمت تعاملنا مع العملاء — مفيش فواتير ضايعة تاني.',
    name: 'محمود',
    business: 'مكتبة وقرطاسية',
  },
]

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'كيف يتم تفعيل حسابي بعد التسجيل؟',
    a: 'بعد إرسال طلبك يراجعه فريق H.A.M.D ويتواصل معك لتأكيد البيانات، ثم يفعّل حسابك وتبدأ فترة التجربة المجانية ١٤ يومًا. لا يمكن الدخول للنظام قبل الموافقة — هذا يحمي النظام ويضمن لكل عميل بداية منظمة.',
  },
  {
    q: 'هل يعمل بدون إنترنت؟',
    a: 'نعم، يمكنك البيع وإصدار الفواتير بدون شبكة تماماً، وعند عودة الاتصال تتم مزامنة كل شيء تلقائياً.',
  },
  {
    q: 'هل يدعم الطباعة الحرارية؟',
    a: 'نعم، يدعم رول 58mm و80mm للطباعة الحرارية إضافة إلى ورق A4 العادي للفواتير الرسمية.',
  },
  {
    q: 'هل البرنامج مناسب لعيادة أو معمل أسنان فقط أم للمحلات أيضاً؟',
    a: 'نوفّر ثلاثة برامج متخصصة: برنامج المخزون ونقاط البيع متاح الآن ويعمل فعلياً مع عملاءنا، بينما برنامجا إدارة عيادات الأسنان ومعامل الأسنان قيد التطوير وسنطلقهما قريباً — سجّل اهتمامك وسنبلغك فور توفرهما.',
  },
  {
    q: 'متى تصدر برامج العيادات والمعامل؟',
    a: 'البرنامجان قيد التطوير الآن ونطرحهما قريباً. يمكنك تسجيل طلبك مسبقاً وسيصلك إشعار عند الإطلاق مع عرض خاص للمتبكرين.',
  },
  {
    q: 'هل يمكن استيراد بياناتي الحالية؟',
    a: 'نعم، عبر ملف CSV يمكنك استيراد منتجاتك وعملائك — ويمكنك تصدير بياناتك في أي وقت، ونسخة احتياطية كاملة بضغطة واحدة.',
  },
  {
    q: 'هل بياناتي آمنة؟',
    a: 'بياناتك محفوظة على سيرفرك وتملكها أنت وحدك، مع صلاحيات مستخدمين دقيقة وسجل كامل لكل حركة، وإمكانية أخذ نسخة احتياطية في أي لحظة.',
  },
  {
    q: 'هل يعمل على الموبايل؟',
    a: 'نعم، التصميم متكيف بالكامل مع شاشات الجوال، ويمكنك تثبيت النظام كتطبيق PWA على شاشتك الرئيسية.',
  },
]

/* ------------------------------- primitives ------------------------------- */

function LogoMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-700 text-lg font-extrabold text-white shadow-md ${className ?? ''}`}
    >
      H
    </div>
  )
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <Reveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h2>
      {sub ? <p className="mt-3 text-muted-foreground md:text-lg">{sub}</p> : null}
    </Reveal>
  )
}

/* --------------------------------- header --------------------------------- */

function LandingHeader({ onAuth }: { onAuth: () => void }) {
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* brand (start side in RTL) */}
        <a href="#" className="flex min-w-0 items-center gap-2.5" aria-label="H.A.M.D — أعلى الصفحة">
          <LogoMark />
          <span className="truncate text-lg font-extrabold tracking-tight">H.A.M.D</span>
        </a>

        {/* center nav (desktop) */}
        <nav aria-label="روابط الصفحة" className="hidden md:flex md:items-center md:gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* actions (end side in RTL) */}
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="ghost" onClick={onAuth}>
              تسجيل الدخول
            </Button>
            <Button onClick={onAuth}>اطلب تفعيل حسابك</Button>
          </div>

          {/* mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-11 md:hidden"
                aria-label="فتح القائمة"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="rounded-b-2xl">
              <SheetHeader className="text-start">
                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                <SheetDescription className="sr-only">تنقل بين أقسام الصفحة</SheetDescription>
              </SheetHeader>
              <nav aria-label="قائمة الجوال" className="flex flex-col gap-1 px-4 pb-6">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMenuOpen(false)
                      onAuth()
                    }}
                  >
                    تسجيل الدخول
                  </Button>
                  <Button
                    onClick={() => {
                      setMenuOpen(false)
                      onAuth()
                    }}
                  >
                    اطلب تفعيل حسابك
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

/* ---------------------------------- hero ---------------------------------- */

function FloatingCard({
  className,
  delay = 0,
  children,
}: {
  className?: string
  delay?: number
  children: React.ReactNode
}) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={`absolute z-10 hidden lg:block ${className ?? ''}`}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}
        className="flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/** Short display name for hero tabs / footer chips. */
function programShort(name: string): string {
  return name.replace('برنامج ', '').replace('إدارة ', '')
}

function Hero({ onAuth }: { onAuth: () => void }) {
  const liveIdx = PROGRAMS.findIndex((p) => p.status === 'live')
  const [tab, setTab] = React.useState(liveIdx === -1 ? 0 : liveIdx)
  const active = PROGRAMS[tab]

  return (
    <section className="relative overflow-x-clip pb-16 pt-14 md:pb-24 md:pt-20" aria-label="المقدمة">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3.5 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            شركة H.A.M.D للحلول البرمجية
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          className="mt-5 text-4xl font-black leading-[1.2] tracking-tight md:text-6xl"
        >
          برامج إدارة عيادات ومعامل الأسنان
          <br />
          والمخزون ونقاط البيع
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: 'easeOut' }}
          className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl"
        >
          H.A.M.D شركة برمجيات متخصصة في أنظمة إدارة الأعمال — نبني لك برنامجًا يدير نشاطك
          بالكامل: بالعربية والإنجليزية، على الكمبيوتر والموبايل، أونلاين وأوفلاين.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button onClick={onAuth} size="lg" className="h-12 px-8 text-base font-bold shadow-md">
            ابدأ الآن — تجربة مجانية
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
            <a href="#programs">تعرّف على برامجنا</a>
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.34 }}
          className="mt-4 text-sm text-muted-foreground"
        >
          برنامج المخزون ونقاط البيع متاح الآن · برامج العيادات والمعامل قريباً · بياناتك ملكك
        </motion.p>
      </div>

      {/* product showcase — tabbed between the three programs */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
        className="relative mx-auto mt-10 max-w-5xl px-4 md:mt-14"
      >
        <div
          role="tablist"
          aria-label="تبويب برامجنا"
          className="mx-auto mb-6 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border bg-muted/50 p-1.5 shadow-sm"
        >
          {PROGRAMS.map((p, i) => (
            <button
              key={p.name}
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors sm:px-4 ${
                tab === i
                  ? 'bg-background text-foreground shadow-md ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <p.icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{programShort(p.name)}</span>
              {p.status === 'live' ? (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                  <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                  متاح
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                  <Clock className="size-2.5" aria-hidden />
                  قريباً
                </span>
              )}
            </button>
          ))}
        </div>

        {active.status === 'live' ? (
          <motion.div
            key={`live-${tab}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative"
          >
            <FloatingCard className="-start-2 top-16 xl:-start-10" delay={0.7}>
              <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-bold" dir="ltr">
                  INV-0021
                </p>
                <p className="text-xs text-muted-foreground">فاتورة · مدفوعة ✓</p>
              </div>
            </FloatingCard>

            <FloatingCard className="-end-2 bottom-20 xl:-end-10" delay={0.9}>
              <TrendingUp className="size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-bold">مبيعات اليوم · ١٢٬٤٠٠ ج.م</p>
                <p className="text-xs font-medium text-primary">↑ 18% مقارنة بالأمس</p>
              </div>
            </FloatingCard>

            <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
              {/* browser chrome */}
              <div className="flex items-center gap-2 border-b bg-muted/70 px-4 py-2.5" aria-hidden>
                <div className="flex gap-1.5">
                  <span className="size-3 rounded-full bg-red-400" />
                  <span className="size-3 rounded-full bg-amber-400" />
                  <span className="size-3 rounded-full bg-emerald-500" />
                </div>
                <div
                  dir="ltr"
                  className="mx-auto flex items-center rounded-md border bg-background px-4 py-1 text-xs text-muted-foreground"
                >
                  hamd.app
                </div>
                <div className="w-[52px]" />
              </div>
              <img
                src="/landing/app-dashboard.png"
                alt="لقطة شاشة من برنامج H.A.M.D للمخزون ونقاط البيع تعرض المبيعات والمخزون والتقارير"
                className="block h-auto w-full bg-muted"
                width={1280}
                height={720}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`soon-${tab}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="overflow-hidden rounded-xl border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b bg-muted/70 px-4 py-2.5" aria-hidden>
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-400" />
                <span className="size-3 rounded-full bg-amber-400" />
                <span className="size-3 rounded-full bg-emerald-500" />
              </div>
              <div
                dir="ltr"
                className="mx-auto flex items-center rounded-md border bg-background px-4 py-1 text-xs text-muted-foreground"
              >
                hamd.app
              </div>
              <div className="w-[52px]" />
            </div>
            <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-muted/70 via-background to-muted/50 p-8 text-center md:min-h-[430px] md:p-12">
              <div
                aria-hidden
                className="absolute -end-20 -top-20 size-64 rounded-full bg-primary/5 blur-2xl"
              />
              <div aria-hidden className="absolute -bottom-24 -start-16 size-72 rounded-full bg-primary/5 blur-2xl" />
              <span
                className={`relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${active.gradient} text-white shadow-lg`}
              >
                <active.icon className="size-8" aria-hidden />
              </span>
              <span className="relative inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-sm font-extrabold text-amber-600 dark:text-amber-400">
                <Clock className="size-4" aria-hidden />
                قريباً
              </span>
              <h3 className="relative text-xl font-extrabold md:text-2xl">{active.name}</h3>
              <p className="relative max-w-md text-sm leading-relaxed text-muted-foreground">
                {active.desc}
              </p>
              <p className="relative text-xs font-bold text-muted-foreground">{active.soonNote}</p>
              <a
                href={`mailto:support@hamd.app?subject=${encodeURIComponent(`إشعار إطلاق ${active.name}`)}`}
                className="relative mt-1 inline-flex min-h-10 items-center gap-2 rounded-full border bg-background px-5 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-accent"
              >
                <Bell className="size-4 text-primary" aria-hidden />
                أبلغني عند الإطلاق
              </a>
            </div>
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}

/* ---------------------------------- about --------------------------------- */

function About() {
  return (
    <section
      id="about"
      className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-24"
      aria-label="من نحن"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="من نحن؟"
          sub="شركة H.A.M.D للحلول البرمجية — نبني أنظمة إدارة تفهم صاحب العمل وتخدم عملاءه."
        />
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">H.A.M.D</strong> شركة برمجيات متخصصة في تطوير
                أنظمة إدارة الأعمال العربية. نحن لا نبيع «برنامج جاهز لأي حد» — بل نفهم طبيعة
                نشاطك أولًا: العيادة لها سير عمل مختلف عن المعمل، والمعمل مختلف عن المحل، ونبني
                لكل نشاط نظامًا يخدمه فعلاً.
              </p>
              <p>
                رسالتنا بسيطة: أن يدير صاحب العمل نشاطه من مكان واحد — مريضاته أو حالاته أو
                مخزونه أو فواتيره أو أرباحه — بدون دفاتر ولا جداول إكسل متفرقة، ومن أي جهاز:
                كمبيوتر الكلينيك، موبايل المدير، أو جهاز الكاشير.
              </p>
              <p>
                كل برامجنا تشترك في نفس المبادئ: عربية أولاً مع دعم إنجليزي كامل، عمل أونلاين
                وأوفلاين، صلاحيات مستخدمين دقيقة، فواتير احترافية بشعارك، وتقارير تُدعم القرار
                لحظة بلحظة — مع دعم فني حقيقي يرد عليك.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {ABOUT_STATS.map((stat, i) => (
              <Reveal key={stat.value} delay={i * 0.07} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <stat.icon className="size-5" aria-hidden />
                  </span>
                  <p className="text-xl font-black leading-snug">{stat.value}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{stat.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- programs -------------------------------- */

function ProgramCard({ program, onAuth, delay }: { program: Program; onAuth: () => void; delay: number }) {
  const live = program.status === 'live'
  return (
    <Reveal delay={delay} className="h-full">
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md ${
          live ? 'ring-2 ring-primary/70' : ''
        }`}
      >
        {/* status badge */}
        {live ? (
          <span className="absolute end-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-emerald-700 shadow-md">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            متاح الآن
          </span>
        ) : (
          <span className="absolute end-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-amber-600 shadow-md">
            <Clock className="size-3.5" aria-hidden />
            قريباً
          </span>
        )}
        <div className={`flex items-center gap-4 bg-gradient-to-br ${program.gradient} p-6 text-white ${live ? '' : 'opacity-90'}`}>
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <program.icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-snug">{program.name}</h3>
            <p className="mt-1 text-sm text-white/85">{program.tagline}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">{program.desc}</p>
          <p className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-400">
            {live ? 'هذا هو البرنامج الذي تستخدمه عملاؤنا اليوم — جرّبه بنفسك.' : program.soonNote}
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {program.features.map((f) => (
              <li key={f} className={`flex items-start gap-2 text-sm ${live ? '' : 'text-muted-foreground/70'}`}>
                {live ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            {live ? (
              <Button onClick={onAuth} className="h-11 w-full gap-1.5 font-bold shadow-sm">
                ابدأ الآن — تجربة مجانية
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                disabled
                variant="outline"
                aria-label={`${program.name} — غير متاح بعد`}
                className="h-11 w-full cursor-not-allowed gap-1.5 font-bold text-muted-foreground"
              >
                <Clock className="size-4" aria-hidden />
                غير متاح — قريباً
              </Button>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  )
}

function Programs({ onAuth }: { onAuth: () => void }) {
  return (
    <section id="programs" className="scroll-mt-24 py-16 md:py-24" aria-label="برامجنا">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="برامجنا الثلاثة"
          sub="برنامج المخزون ونقاط البيع متاح الآن ويعمل مع عملائنا — وبرنامجا العيادات والمعامل قيد التطوير وسنطلقهما قريباً."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {PROGRAMS.map((p, i) => (
            <ProgramCard key={p.name} program={p} onAuth={onAuth} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- services -------------------------------- */

function Services() {
  return (
    <section
      id="services"
      className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-24"
      aria-label="خدماتنا"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="خدماتنا"
          sub="أكثر من برنامج جاهز — فريق برمجي كامل يرافقك قبل التشغيل وبعده."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {SERVICES.map((service, i) => (
            <Reveal key={service.title} delay={(i % 3) * 0.06} className="h-full">
              <div className="h-full rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <service.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-bold">{service.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{service.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- how it works ---------------------------- */

function HowItWorks() {
  return (
    <section
      id="how"
      className="scroll-mt-24 py-16 md:py-24"
      aria-label="كيف تبدأ"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="ابدأ في ثلاث خطوات"
          sub="لبرنامج المخزون ونقاط البيع — لا تحتاج خبرة تقنية، تسجيل الطلب في دقيقة والتفعيل من فريقنا."
        />
        <div className="relative grid gap-10 md:grid-cols-3 md:gap-6">
          {/* dashed connector (desktop) */}
          <div
            aria-hidden
            className="absolute inset-x-24 top-8 hidden border-t-2 border-dashed border-border md:block"
          />
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.1} className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground shadow-lg">
                  {step.n}
                </div>
                <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------- videos --------------------------------- */

function Videos() {
  const [openVideo, setOpenVideo] = React.useState<string | null>(null)
  const activeVideo = VIDEOS.find((v) => v.id === openVideo) ?? null

  return (
    <section
      id="videos"
      className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-24"
      aria-label="الفيديوهات التعليمية"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="جولة داخل برنامج المخزون ونقاط البيع"
          sub="فيديوهات قصيرة من البرنامج المتاح الآن — شرح عربي واضح لنقطة البيع والمخزون والتقارير."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {VIDEOS.map((video, i) => (
            <Reveal key={video.id} delay={(i % 4) * 0.06} className="h-full">
              <button
                type="button"
                onClick={() => setOpenVideo(video.id)}
                aria-label={`تشغيل الفيديو: ${video.title}`}
                className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-start shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={`relative flex aspect-video w-full items-center justify-center bg-gradient-to-br ${video.gradient}`}
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-white/95 text-emerald-600 shadow-lg transition-transform group-hover:scale-105">
                    <Play className="ms-0.5 size-6 fill-current" aria-hidden />
                  </span>
                  <span className="absolute bottom-2 end-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                    {video.duration}
                  </span>
                </div>
                <div className="flex-1 p-4">
                  <h3 className="font-bold">{video.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{video.desc}</p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      <Dialog
        open={openVideo !== null}
        onOpenChange={(open) => {
          if (!open) setOpenVideo(null)
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{activeVideo?.title ?? 'فيديو تعليمي'}</DialogTitle>
            <DialogDescription>{activeVideo?.desc ?? ''}</DialogDescription>
          </DialogHeader>
          {openVideo ? (
            <video
              key={openVideo}
              controls
              autoPlay
              className="aspect-video w-full rounded-lg bg-black"
              src={`/videos/${openVideo}.mp4`}
            >
              متصفحك لا يدعم تشغيل الفيديو.
            </video>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/* --------------------------------- pricing -------------------------------- */

function Pricing({ onAuth }: { onAuth: () => void }) {
  return (
    <section
      id="pricing"
      className="scroll-mt-24 py-16 md:py-24"
      aria-label="الأسعار"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="أسعار واضحة — ابدأ مجاناً"
          sub="أسعار برنامج المخزون ونقاط البيع (المتاح الآن) — بعد الموافقة على طلبك تحصل على ١٤ يوم تجربة كاملة بدون بطاقة ائتمان."
        />
        <div className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.08} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm md:p-8 ${
                  plan.highlighted ? 'ring-2 ring-primary' : ''
                }`}
              >
                {plan.highlighted ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-md">
                    الأكثر شيوعاً
                  </span>
                ) : null}
                <h3 className="text-lg font-extrabold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/ {plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.desc}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <Button
                    onClick={onAuth}
                    variant={plan.highlighted ? 'default' : 'outline'}
                    className="h-11 w-full"
                  >
                    {plan.cta}
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------- testimonials ----------------------------- */

function Testimonials() {
  return (
    <section
      className="border-y bg-muted/30 py-16 md:py-24"
      aria-label="آراء العملاء"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="عملاؤنا يتحدثون"
          sub="محلات وبقالات وصيدليات تدير مبيعاتها ومخزونها يوميًا عبر برنامج المخزون ونقاط البيع."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {TESTIMONIALS.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.08} className="h-full">
              <figure className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex gap-0.5" aria-label="تقييم 5 من 5 نجوم">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="size-4 fill-primary text-primary" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">
                  «{item.quote}»
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary"
                  >
                    {item.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">{item.business}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------- faq ---------------------------------- */

function Faq() {
  return (
    <section
      id="faq"
      className="scroll-mt-24 py-16 md:py-24"
      aria-label="الأسئلة الشائعة"
    >
      <div className="mx-auto max-w-3xl px-4">
        <SectionHeading title="الأسئلة الشائعة" sub="كل ما تريد معرفته قبل أن تبدأ." />
        <Reveal>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-start text-base font-semibold">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------- pwa install (mobile app) ------------------------ */

/** Secondary CTA — appears only when the browser offers a native install prompt. */
function InstallAppCta() {
  const evt = useInstaller()
  const [busy, setBusy] = React.useState(false)
  if (!evt) return null
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await triggerInstall()
        } finally {
          setBusy(false)
        }
      }}
      className="mt-3 h-11 gap-2 rounded-full px-6 text-sm font-semibold text-emerald-50 hover:bg-white/10 hover:text-white"
    >
      <Smartphone className="size-4" aria-hidden />
      ثبّت التطبيق على هاتفك
    </Button>
  )
}

/* -------------------------------- final cta ------------------------------- */

function FinalCta({ onAuth }: { onAuth: () => void }) {
  return (
    <section className="py-16 md:py-24" aria-label="ابدأ الآن">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-emerald-700 px-6 py-14 text-center text-white shadow-xl md:py-20">
            <div aria-hidden className="absolute -end-16 -top-16 size-64 rounded-full bg-white/10" />
            <div
              aria-hidden
              className="absolute -bottom-24 -start-20 size-80 rounded-full bg-black/10"
            />
            <div className="relative">
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">
                جاهز تدير نشاطك باحتراف؟
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-emerald-50/90 md:text-lg">
                أرسل طلبك الآن — يراجعه فريق H.A.M.D ويفعّل حسابك وتبدأ تجربتك المجانية ١٤ يومًا.
              </p>
              <Button
                onClick={onAuth}
                className="mt-8 h-12 bg-white px-8 text-base font-bold text-emerald-700 shadow-lg hover:bg-emerald-50"
              >
                اطلب تفعيل حسابك مجاناً
              </Button>
              <div>
                <InstallAppCta />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* --------------------------------- footer --------------------------------- */

const FOOTER_COLS: ReadonlyArray<{
  title: string
  links: ReadonlyArray<{ label: string; href: string }>
}> = [
  {
    title: 'برامجنا',
    links: [
      { label: 'المخزون ونقاط البيع — متاح', href: '#programs' },
      { label: 'إدارة عيادات الأسنان — قريباً', href: '#programs' },
      { label: 'إدارة معامل الأسنان — قريباً', href: '#programs' },
    ],
  },
  {
    title: 'الشركة',
    links: [
      { label: 'من نحن', href: '#about' },
      { label: 'خدماتنا', href: '#services' },
      { label: 'الأسعار', href: '#pricing' },
      { label: 'الأسئلة الشائعة', href: '#faq' },
    ],
  },
  {
    title: 'الدعم',
    links: [
      { label: 'تواصل معنا — support@hamd.app', href: 'mailto:support@hamd.app' },
      { label: 'الفيديوهات التعليمية', href: '#videos' },
    ],
  },
]

function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/40" aria-label="تذييل الصفحة">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-lg font-extrabold tracking-tight">H.A.M.D</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              شركة H.A.M.D للحلول البرمجية — برامج إدارة عيادات ومعامل الأسنان والمخزون ونقاط
              البيع، بالعربية والإنجليزية، على الكمبيوتر والموبايل، أونلاين وأوفلاين.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-sm font-bold">{col.title}</h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} H.A.M.D — جميع الحقوق محفوظة</p>
          <p>شركة للحلول البرمجية · برامج إدارة الأعمال</p>
        </div>
      </div>
    </footer>
  )
}

/* ---------------------------------- page ---------------------------------- */

export default function LandingPage({ onAuth }: LandingPageProps) {
  // Smooth in-page scrolling (scoped to the landing page lifetime only)
  React.useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => {
      document.documentElement.style.scrollBehavior = prev
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <LandingHeader onAuth={onAuth} />
      <main className="flex-1">
        <Hero onAuth={onAuth} />
        <About />
        <Programs onAuth={onAuth} />
        <Services />
        <HowItWorks />
        <Videos />
        <Pricing onAuth={onAuth} />
        <Testimonials />
        <Faq />
        <FinalCta onAuth={onAuth} />
      </main>
      <Footer />
    </div>
  )
}
