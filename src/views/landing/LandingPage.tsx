'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coffee,
  FileText,
  Menu,
  Pill,
  Play,
  Printer,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Warehouse,
  WifiOff,
  Zap,
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
  { href: '#features', label: 'المميزات' },
  { href: '#how', label: 'كيف يعمل' },
  { href: '#videos', label: 'الفيديوهات' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
]

const CATEGORIES: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
  { icon: ShoppingBasket, label: 'بقالات وسوبر ماركت' },
  { icon: UtensilsCrossed, label: 'مطاعم ومطابخ' },
  { icon: Pill, label: 'صيدليات' },
  { icon: Store, label: 'محلات تجزئة' },
  { icon: Coffee, label: 'كافيهات' },
  { icon: Sparkles, label: 'بوتيكات ومعارض' },
]

const FEATURES: ReadonlyArray<{ icon: LucideIcon; title: string; desc: string }> = [
  {
    icon: Zap,
    title: 'نقطة بيع فائقة السرعة',
    desc: 'باركود، اختصارات كيبورد، وبيع في ثوانٍ دون أي تعقيد.',
  },
  {
    icon: Warehouse,
    title: 'مخازن متعددة وفروع',
    desc: 'أرصدة لحظية، تحويلات بين المخازن، وجرد دوري منظم.',
  },
  {
    icon: FileText,
    title: 'فواتير بمصداقية احتراف',
    desc: 'صمّم قالب فاتورتك بشعارك وألوانك وبياناتك الضريبية.',
  },
  {
    icon: Printer,
    title: 'طباعة حرارية و A4',
    desc: 'رول 58mm و80mm للكاشير، وفواتير A4 رسمية للشركات.',
  },
  {
    icon: BarChart3,
    title: 'تقارير وأرباح لحظية',
    desc: 'مبيعات، مصروفات، أرباح، وأرصدة عملاء وموردين في لوحة واحدة.',
  },
  {
    icon: Users,
    title: 'عملاء وموردون',
    desc: 'كشوف حسابات تفصيلية، حدود ائتمان، ومتابعة التحصيل.',
  },
  {
    icon: ShieldCheck,
    title: 'صلاحيات مستخدمين',
    desc: 'مدير وكاشير بأذونات منفصلة — كل واحد يرى ما يخصه فقط.',
  },
  {
    icon: WifiOff,
    title: 'يعمل أوفلاين',
    desc: 'تابع البيع بدون إنترنت، والمزامنة تتم تلقائياً عند العودة.',
  },
]

const STEPS: ReadonlyArray<{ n: string; title: string; desc: string }> = [
  { n: '١', title: 'أنشئ حسابك ومحلك', desc: 'تسجيل في دقيقة — اسم المحل، العملة، وبياناتك.' },
  { n: '٢', title: 'أضف منتجاتك ومخازنك', desc: 'استورد منتجاتك من ملف CSV أو أضفها يدوياً بالباركود.' },
  { n: '٣', title: 'ابدأ البيع وراقب أرباحك', desc: 'فاتورتك الأولى خلال دقائق، وتقارير لحظية من اليوم الأول.' },
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
    period: '٣٠ يوماً',
    desc: 'جرّب النظام كاملاً بدون أي التزام.',
    features: [
      '٣٠ يوماً تجربة كاملة',
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
    desc: 'مثالي للمحلات الفردية.',
    features: [
      'نقطة بيع كاملة',
      'فواتير احترافية',
      'مخزن واحد',
      'تقارير أساسية',
      'جهاز واحد',
    ],
    highlighted: true,
    cta: 'ابدأ الآن',
  },
  {
    name: 'احترافي',
    price: 'تواصل معنا',
    period: 'شهرياً',
    desc: 'للنشاطات التي تملك فروعاً ومخازن متعددة.',
    features: [
      'فروع ومخازن متعددة',
      'مستخدمون بلا حدود',
      'طباعة حرارية 58/80mm',
      'نسخ احتياطي تلقائي',
    ],
    cta: 'تواصل معنا',
  },
]

const TESTIMONIALS: ReadonlyArray<{ quote: string; name: string; business: string }> = [
  {
    quote: 'نظام بسيط وفهمته كاشيري في يوم واحد — مفيش تدريب ولا تعقيد.',
    name: 'محمود',
    business: 'سوبر ماركت النور',
  },
  {
    quote: 'الطباعة الحرارية وفرت عليّ ورق كتير، والفاتورة بتتصدر في ثانية.',
    name: 'سارة',
    business: 'بوتيك بلس',
  },
  {
    quote: 'بتابع مخازني من موبايلي وأنا برا المحل — التحديثات لحظية فعلاً.',
    name: 'أحمد',
    business: 'مطبعة الأمل',
  },
]

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'هل يعمل بدون إنترنت؟',
    a: 'نعم، يمكنك البيع وإصدار الفواتير بدون شبكة تماماً، وعند عودة الاتصال تتم مزامنة كل شيء تلقائياً.',
  },
  {
    q: 'هل يدعم الطباعة الحرارية؟',
    a: 'نعم، يدعم رول 58mm و80mm للطباعة الحرارية إضافة إلى ورق A4 العادي للفواتير الرسمية.',
  },
  {
    q: 'هل يمكنني استيراد منتجاتي؟',
    a: 'نعم، عبر ملف CSV يمكنك استيراد كل منتجاتك بأسمائها وأسعارها وباركودها — ويمكنك كذلك تصدير بياناتك في أي وقت.',
  },
  {
    q: 'هل بياناتي آمنة؟',
    a: 'بياناتك محفوظة على جهازك/سيرفرك وتملكها أنت وحدك، مع إمكانية أخذ نسخة احتياطية كاملة JSON بضغطة واحدة.',
  },
  {
    q: 'هل يعمل على الموبايل؟',
    a: 'نعم، التصميم متكيف بالكامل مع شاشات الجوال، ويمكنك تثبيت النظام كتطبيق PWA على شاشتك الرئيسية.',
  },
  {
    q: 'هل اللغة الإنجليزية مدعومة؟',
    a: 'نعم، تبديل فوري بين العربية والإنجليزية مع قلب كامل لاتجاه الواجهة RTL/LTR.',
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
            <Button onClick={onAuth}>ابدأ الآن</Button>
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
                    ابدأ الآن
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

function Hero({ onAuth }: { onAuth: () => void }) {
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
            جديد — يعمل بدون إنترنت
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          className="mt-5 text-4xl font-black leading-[1.2] tracking-tight md:text-6xl"
        >
          أدر محلك ومخازنك…
          <br />
          من مكان واحد
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: 'easeOut' }}
          className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl"
        >
          H.A.M.D نظام متكامل لنقاط البيع والمخازن والفواتير — بالعربية والإنجليزية، على
          الكمبيوتر والموبايل، أونلاين وأوفلاين.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button onClick={onAuth} size="lg" className="h-12 px-8 text-base font-bold shadow-md">
            ابدأ الآن مجاناً
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
            <a href="#videos">شاهد الفيديوهات التعليمية</a>
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.34 }}
          className="mt-4 text-sm text-muted-foreground"
        >
          بدون بطاقة ائتمان · إعداد في دقيقة · بياناتك ملكك
        </motion.p>
      </div>

      {/* browser mockup */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
        className="relative mx-auto mt-12 max-w-5xl px-4 md:mt-16"
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
          {/* fake browser chrome */}
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
            alt="لقطة شاشة من نظام H.A.M.D تعرض المبيعات والمخزون والتقارير"
            className="block h-auto w-full bg-muted"
            width={1280}
            height={720}
          />
        </div>
      </motion.div>
    </section>
  )
}

/* ------------------------------ trust + features --------------------------- */

function TrustStrip() {
  return (
    <section className="border-y bg-muted/30 py-10" aria-label="القطاعات المخدومة">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <Reveal>
          <p className="text-sm text-muted-foreground">موثوق من محلات ومطاعم وصيدليات وسوبر ماركت</p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-2.5 md:gap-3">
            {CATEGORIES.map((cat) => (
              <li
                key={cat.label}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-foreground/80 shadow-sm"
              >
                <cat.icon className="size-4 text-primary" aria-hidden />
                {cat.label}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-16 md:py-24" aria-label="المميزات">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="كل ما يحتاجه محلك في نظام واحد"
          sub="من أول باركود حتى تقرير الأرباح — H.A.M.D يغنيك عن الدفاتر وجداول الإكسل المتفرقة."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 4) * 0.06} className="h-full">
              <div className="h-full rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-bold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
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
      className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-24"
      aria-label="كيف يعمل"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="ابدأ في ثلاث خطوات"
          sub="لا تحتاج خبرة تقنية — إعداد كامل في أقل من عشر دقائق."
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
      className="scroll-mt-24 py-16 md:py-24"
      aria-label="الفيديوهات التعليمية"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="تعلّم H.A.M.D في دقائق"
          sub="فيديوهات تعليمية قصيرة — نص عربي واضح مع موسيقى هادئة."
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
      className="scroll-mt-24 border-y bg-muted/30 py-16 md:py-24"
      aria-label="الأسعار"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="أسعار واضحة — ابدأ مجاناً"
          sub="جرّب كل المميزات ٣٠ يوماً بدون بطاقة ائتمان، واختر الباقة التي تناسب محلك."
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
    <section className="py-16 md:py-24" aria-label="آراء العملاء">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          title="أصحاب محلات بيتكلموا عنّا"
          sub="آلاف الفواتير تُصدر يومياً عبر H.A.M.D في محلات مثل محلك."
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
      className="scroll-mt-24 border-t bg-muted/30 py-16 md:py-24"
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
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">جاهز تطوّر محلك؟</h2>
              <p className="mx-auto mt-3 max-w-xl text-emerald-50/90 md:text-lg">
                انضم لآلاف المحلات التي تدير مخازنها ومبيعاتها بذكاء — ابدأ مجاناً اليوم.
              </p>
              <Button
                onClick={onAuth}
                className="mt-8 h-12 bg-white px-8 text-base font-bold text-emerald-700 shadow-lg hover:bg-emerald-50"
              >
                ابدأ الآن مجاناً
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
    title: 'المنتج',
    links: [
      { label: 'المميزات', href: '#features' },
      { label: 'الأسعار', href: '#pricing' },
      { label: 'الفيديوهات', href: '#videos' },
      { label: 'الأسئلة الشائعة', href: '#faq' },
    ],
  },
  {
    title: 'الدعم',
    links: [
      { label: 'تواصل معنا — support@hamd.app', href: 'mailto:support@hamd.app' },
      { label: 'دليل الاستخدام', href: '#videos' },
    ],
  },
  {
    title: 'النظام',
    links: [
      { label: 'يعمل أوفلاين', href: '#features' },
      { label: 'تطبيق PWA', href: '#faq' },
      { label: 'عربي / إنجليزي', href: '#faq' },
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
              نظام إدارة محلات ومخازن متكامل — بالعربية والإنجليزية، على الكمبيوتر والموبايل،
              أونلاين وأوفلاين.
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
          <p>© 2026 H.A.M.D — جميع الحقوق محفوظة</p>
          <p>صُنع بعناية لأصحاب المحلات ❤</p>
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
        <TrustStrip />
        <Features />
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
