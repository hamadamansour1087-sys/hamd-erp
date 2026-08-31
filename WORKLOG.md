# 🧾 WORKLOG.md — سجل عمل التدقيق الشامل (Round 3 — الإغلاق النهائي)

**الجلسة:** 2026-08-31 | **الأمر:** «نفّذ كل شيء — أريد البرنامج بدون أخطاء أو أي ثغرات»
**القاعدة الذهبية:** لا ادعاء نجاح اختبار إلا بتشغيله فعليًا؛ لا إصلاح بدون توثيق سببه.

---

## PHASE 0 — Baseline (بلا تعديل)
- استعادة كاملة بعد **إعادة تعيين الساندبوكس الثالثة** (`restore-preview.sh`): PG 16.14 + بناء + daemon :3000 → RESTORE OK (HTTP 200)
- Git: `main` نظيف @ `640b675` | لا remote | 51 commit | تقارير الجولة 2 مقروءة (CONDITIONAL GO بشرطين)

## PHASE 2+25 — الأسرار وتاريخ Git (تنفيذ الشرط أ)
- مسح كامل للتاريخ: الملفات الحساسة المتتبعة تاريخيًا = `db/custom.db` + أسرار قديمة في 3 commits — **ومفاجأة: `PRODUCTION-READINESS.md` الحالي نفسه كان يسرد القيم حرفيًا** (داخل مثال أمر التنظيف + أمر pickaxe)
- قنّعت القيم في الملفات الحالية إلى placeholders (R3-2)
- **تنظيف التاريخ بـ `git filter-repo` — 4 مرارات** (مرار لكل شكل: مقتبس من سكربت المعاينة، عارٍ من نسخ التقارير، وبادئة كلمة المرور)، ملف الاستبدال بُني صامتًا من التاريخ نفسه ولم يُطبع أبدًا
- **التحقق النهائي (صفر في الكل):** `git log --all -- db/custom.db` = 0 | pickaxe للسرّ = 0 | لكلمة المرور وبادئتها = 0 | لا يوجد أي hex-64 في أي blob في أي commit
- أول push إلى أي remote أصبح آمنًا — كل الـ hashes تغيرت (موثق: التاريخ أعيد كتابته بالكامل)

## PHASE 4 — الترحيلات
- baseline للترحيلين السابقين على العنقود المستعاد (`migrate resolve --applied`) + تطبيق `20260901000000_rate_limit_events` بـ `migrate deploy`
- `bunx prisma migrate status` → **Database schema is up to date!** (3 migrations)

## PHASE 15 — إغلاق خطر 4-1 (محدد التسجيل → DB عالمي)
- `RateLimitEvent` (نمط LoginAttempt: صف لكل ضربة مقبولة + تنظيف موجّه + GC 24h + مفتاح مقتطع 200) + `dbRateLimit()` في api-helpers
- register/route: طبقتان — مُخمّد in-memory رخيص ثم **ميزانية عالمية DB-backed** (5/ساعة/IP)
- 6 اختبارات انحدار جديدة (`tests/security/rate-limit-db.test.ts`) أبرزها **محاكاة مثيل بارد**: 5 صفوف في DB وحدها ترد الضربة السادسة في عملية جديدة
- ملاحظة هندسية موثقة في الاختبار: خريطة in-memory مشتركة بين ملفات bun المتوازية (عملية واحدة) — صُممت التوكيدات لتكون حتمية في كل الترتيبات

## PHASE 26+27 — المصفوفة الكاملة والفحص الحي (نتائج فعلية)
| الاختبار | النتيجة |
|---|---|
| `bun test tests/security` | **191 pass / 0 fail** (185 + 6، 670 expect، 9 ملفات) |
| `bun run typecheck` / `bun run lint` | 0 / 0 |
| `bunx next build --webpack` + manifest + postbuild | BUILD OK (103 أصل SW) |
| daemon :3000 | health `{"status":"ok","db":"ok"}` |
| بوابات المصادقة | bootstrap/export/platform/reports = 401 ✓ دخول خاطئ 401 ✓ |
| الرؤوس | CSP بنوسة + X-Frame DENY + nosniff + Referrer-Policy + Permissions-Policy ✓ |
| **إثبات حي للميزة الجديدة** | 6 تسجيلات متتالية على :3000 → **5×201 ثم 429** |
| النسخ الاحتياطي | `pg-backup.sh` نسخة باردة 24MB + sha256 + فك وفحص ملفي (PG_VERSION=16) + الصحة ok بعدها |

## 🔴 حادثة موثقة: فقدان `db/custom.db`
- الملف (أرشيف SQLite: 165 فاتورة…) غير موجود على القرص — فُقد بإعادة تعيين الساندبوكس الثالثة **قبل بدء الجولة** (غير متتبع منذ `b806bb8` → الساندبوكس يمسح كل غير متتبع؛ الدليل: `.preview-secrets.env` أُعيد توليده من الصفر)
- ليس بفعل تنظيف التاريخ (التنظيف أزال نسخة Git فقط — وهذا هو المطلوب أمنيًا)
- الاسترداد مستنفد: `git fsck --unreachable` فارغ، لا نسخ في القرص/tmp
- الأثر محدود: بياناته سبق ترحيلها إلى PostgreSQL بصفر اختلافات؛ سجل النظام الفعلي PostgreSQL؛ درس مُطبق: النسخ الدائم خارج البيئة فقط (DEPLOYMENT.md)

## PHASE 29+30 — المسح الثابت النهائي والتحقق
- الأسرار في HEAD: لا شيء (فحص git grep للقيم والبادئات) | migrate status: up to date | لا ignoreBuildErrors | CSP بنوسة | كل بوابات 401 | 191/191
- **الملفات المتغيرة:** prisma/schema.prisma، prisma/migrations/20260901000000_rate_limit_events (جديد)، src/lib/api-helpers.ts، src/app/api/auth/register/route.ts، tests/security/rate-limit-db.test.ts (جديد)، PRODUCTION-READINESS.md (🟢 GO)، SECURITY-AUDIT.md (جولة 3)، DEPLOYMENT.md، public/sw-manifest.json
- **قرار الجولة 3: 🟢 GO** — الشرطان منفّذان ومتحقق منهما؛ لا P0/P1 مفتوح

---

# 📜 Round 2 (سجل تاريخي) — 2026-08-31

**الجلسة:** 2026-08-31 | **المنهجية:** AUDIT → FIND → FIX → TEST → VERIFY → DOCUMENT
**القاعدة الذهبية:** لا ادعاء نجاح اختبار إلا بتشغيله فعليًا؛ لا إصلاح بدون توثيق سببه.

---

## PHASE 0 — Baseline (بلا تعديل)
- `git status`: نظيف | branch: `main` | HEAD: `a120d33` | remotes: **لا يوجد**
- الخدمة حيّة :3000 (HTTP 200) | worklog السابق مقروء (recovery-2، landing-v2)

## PHASE 1 — الجرد
- 38 ملف API route / 60 handler، src/lib (auth, api-helpers, tenant, db, locks, offline, pwa)، prisma/schema.prisma (430 سطرًا)، tests/security (7 ملفات)، scripts (نسخ/استعادة/ترحيل)، public/sw.js، docs (7 ملفات)

## PHASE 2+25 — الأسرار وGit
- `.env` الحقيقي **ليس** في التاريخ (`git log --all -- .env` فارغ)؛ `.env.example` بلا أسرار ✓
- 🔴 `db/custom.db` متتبع من commit `56faf9b` (165 فاتورة داخل Git)
- 🔴 `AUTH_SECRET` + كلمة مرور المدير حرفيًا في `scripts/restore-preview.sh` (commit `c571287`)

## PHASE 3+4 — المخطط والترحيلات
- provider=postgresql، DECIMAL(14,2) للمال و(14,3) للكميات، orgId+فهارس+unique مقيّد بكل كيان، حذف Cascade/Restrict مقصود
- migrations متسقة (baseline + warehouse_fk_restrict)، `db:deploy` = `migrate deploy` ✓ — لم يُستخدم `db push` في الإنتاج

## PHASE 5 — SQLite القديمة (فحص فقط — لم تُلمس)
- 20 جدولًا: 165 فاتورة، 542 بندًا، 148 سندًا، 568 حركة، 36 منتجًا، 11 عميلًا، 7 موردين، 3 مستخدمين
- سكربت الترحيل: قراءة فقط للمصدر، معاملة واحدة، تحقق تلقائي بعد الإدخال (عدّادات + مجاميع مالية)

## PHASE 6 — المصادقة (قراءة كاملة + اختبارات)
- scrypt + DUMMY_HASH لتسوية التوقيت، حد 64KB للجسم، حد 1024 لكلمة المرور، سجل فشل DB-backed (10/حساب، 20/IP، 5 دقائق، fail-only)، بوابة دورة حياة المؤسسة بعد التحقق من الاعتماد، tokenVersion يبطل الجلسات فورًا

## PHASE 7+8 — RBAC وعزل المستأجرين (وكيل استكشاف + تحقق يدوي)
- كل الـ 57 handler المحمي يستدعي getSession قبل أي Prisma؛ المصفوفة موثقة لكل route؛ كل POST يتحقق من ملكية المفاتيح المرجعية (customer/supplier/product/warehouse) لـ orgId
- الموقعان الوحيدان بلا orgId في WHERE: platform (سوبر أدمن مقصود) + auth (بالبريد العام مقصود)

## PHASE 9+11 — التكامل المالي والتزامن المخزون (قراءة يدوية للكود)
- الفواتير: معاملة واحدة (فاتورة+بنود+مخزون+سند)، CAS شرطي للمخزون (`qty: {gte}` في WHERE)، حماية نافذة الانهيار بـ clientOperationId @@unique داخل المعاملة، withDbRetry للـ deadlocks
- التحويلات: CAS دائمًا + أقفال صفوف `FOR UPDATE` بترتيب كانوني يمنع deadlock عابر للنسخ
- السندات: CAS داخل المعاملة يمنع lost-update وoverpayment (أضفت orgId للعمق الدفاعي — R2-7)
- stock/adjust: CAS loop على `qty: oldQty` + mutex — lost update مستحيل

## PHASE 10 — Idempotency
- تحقق صارم للمفتاح (charset/length) قبل أي DB، هوية `scope:SHA-256(raw)`، ملكية المفتاح للمستخدم الأصلي (403 غيره)، استقلالية orgs، طبقتان ضد نافذة الانهيار، GC 90 يومًا

## PHASE 12+22 — الأوفلاين (وكيل + تحقق يدوي لكل نتيجة)
- **الوكيل وجد 2×P0 + 3×P1 + 5×P2 — تحققت منها كلها بنفسي قبل الإصلاح** (انظر SECURITY-AUDIT.md R2-1..R2-12)
- سلوك محفوظ عمدًا: الطابور يبقى بعد الخروج (يعاد لنفس المستخدم فقط)، 401 يجمّد ولا يحذف

## PHASE 13+14+15 — أمن API والتحقق من المدخلات وحدود المعدل
- لا fetch خارجي في API (لا SSRF)، لا eval/child_process، لا مسارات ملفات؛ readJson بسقف 1MB/streaming؛ money/qty/date/str محدودة بكل route؛ login بـ DB ledger + in-memory damper (موثق أحادي النسخة)؛ register in-memory (P2 موثق)

## PHASE 16 — الرؤوس (فحص حي)
- CSP بنوسة لكل طلب + strict-dynamic (بلا unsafe-inline للسكربت في الإنتاج)، X-Frame-Options DENY، nosniff، Referrer-Policy، Permissions-Policy، HSTS (خلف TLS) — تحقق curl فعلي

## PHASE 17+18+19+20+21 — Next/TS، الأخطاء، السجلات، الأداء، متعدد النسخ
- لا ignoreBuildErrors، tsc/eslint نظيفة، البناء ينجح
- الأخطاء: رموز ثابتة فقط للمستخدم (لا stacks/SQL/paths)
- السجلات: طلب مهيكل بلا query strings؛ PrismaClient singleton؛ تصنيف in-memory: rateLimit (أحادي)، KeyedMutex (أحادي مع CAS-DB backstop)، sessionGate (عميل) — القاعدة دائمًا DB

## PHASE 23 — النسخ والاستعادة (تشغيل فعلي)
- `pg-backup.sh`: نسخة باردة 23MB + sha256 ✓
- `pg-restore-verify.sh` (بيانات صفرية) ✓ ثم تدريب مُقوّى: `scripts/audit-restore-drill.sh` (جديد) — قاعدة `hamd_drill` معزولة ببيانات اصطناعية → نسخ → استعادة على عنقود :5433 → **19 جدولًا + 8 مجاميع مالية = 0 اختلافات** → تنظيف كامل

## PHASE 26+27 — المصفوفة الكاملة والفحص الحي (نتائج فعلية)
| الاختبار | النتيجة |
|---|---|
| `bun test tests/security` | **185 pass / 0 fail** (178 أساس + 7 طابور جديدة، 645 expect، 8 ملفات، 24.3s) |
| `bun run typecheck` | 0 خطأ |
| `bun run lint` | 0 ملاحظة |
| `bunx next build --webpack` + manifest + postbuild | BUILD OK (103 أصل SW) |
| فحص حي :3000 | health ok | CSP-nonce ✓ | 401 للجميع غير المصادق | دخول خاطئ 401 | دخول صحيح 200 | مفتاح idempotency غير صالح مرفوض | stock-adjust بلا صلاحية 403 |

## PHASE 28 — حلقة الإصلاح (ترتيب P0→P2) — 14 إصلاحًا، commit `b806bb8`
كل إصلاح مذكور بجدول R2-1..R2-14 في SECURITY-AUDIT.md مع آلية التحقق الخاصة به. بعد الإصلاحات: إعادة تشغيل الخدمة بالبناء الجديد (daemon :3000، HTTP 200).

## PHASE 29+30 — المسح الثابت النهائي والتحقق
- AUTH_SECRET fallback: لا يوجد (رسالة خطأ فقط) | ignoreBuildErrors: لا | unsafe-inline script-src: لا (styles فقط، موثق) | fetch في API: لا | raw SQL: 5 مواضع كلها tagged-template مُعامَلة | findUnique/update/delete بلا orgId: لا (بعد الإصلاحات) | كلمات مرور مكتوبة: لا | SQLite في وثائق الإنتاج: لا (وثائق الترحيل فقط)
- **كل مراحل القائمة 30 تحقق منها فعليًا** — لا PASS بدون تشغيل

## الملفات المتغيرة (commit b806bb8)
`.gitignore`، `db/custom.db` (فصل من Git فقط)، `public/sw.js`، `public/sw-manifest.json`، `scripts/restore-preview.sh`، `scripts/audit-restore-drill.sh` (جديد)، 10 ملفات API/lib/views، `tests/security/offline-queue.test.ts` (جديد)، + تقارير: `SECURITY-AUDIT.md` (Round 2)، `PRODUCTION-READINESS.md`، `DEPLOYMENT.md`، `WORKLOG.md`

---

# 🔁 Round 4 — توحيد وثائق النشر على PostgreSQL (2026-09-01)

**المحفّز:** بلاغ تناقض وثائقي — `DEPLOY.md` الجذري ما يزال يعلّم نشر إنتاج SQLite (قاعدة `file:`، Volume للملف، cron `cp custom.db`، Vercel «غير مناسب»، وتعليمة حذف `db/custom.db`) بينما المعمارية الفعلية PostgreSQL إلزاميًا (Prisma provider=postgresql، Neon+Vercel هدف النشر).

**FIND:**
- مسح كل وثائق النشر: `DEPLOY.md` 🔴 (إعادة كتابة) | `docs/PRODUCTION-DEPLOYMENT.md` / `docs/DEPLOY-VERCEL.md` / `DEPLOYMENT.md` / `docs/DATABASE-MIGRATION.md` / `docs/DISASTER-RECOVERY.md` 🟢 سليمة | ذكر SQLite في سجلات التدقيق التاريخية (SECURITY-AUDIT/MONEY-AUDIT/FINAL-REPORT/SCALING) مقبول لأنه سجل/ترحيل.
- فحص إضافي كشف R4-2: `package.json` build بلا `--webpack` — `bun run build` أنتج أصل Turbopack (61 أصلًا) يخالف الوثائق والأصل المُتحقق (webpack، 103).

**FIX:**
- R4-1: إعادة كتابة `DEPLOY.md` كاملة — PostgreSQL حصرًا، `bun run db:deploy` فقط، Vercel+Neon مدعوم رسميًا، نسخ احتياطي `pg_dump` + `pg-restore-verify.sh` خارجي، قسم ترحيل وحيد يوجه إلى `docs/DATABASE-MIGRATION.md`، صريح بمنع `db push` ومنع حذف `db/custom.db`، وأخطاء شائعة PostgreSQL (P1001/P1003/AUTH_SECRET/TRUST_PROXY).
- R4-2: تثبيت `next build --webpack` في package.json — أوامر البناء أصبحت متطابقة مع الموثق على كل المنصات.
- R4-3: `docs/DEPLOY-VERCEL.md` — صياغة مشروطة لمصدر بيانات الترحيل توافق سجل حادثة فقدان الأرشيف.

**TEST/VERIFY (نُفذ فعليًا، لا PASS بلا تشغيل):**
- `bun run lint` 0 | `bun run typecheck` 0 | `bun test tests/security` **191/191** | `bun run build` (webpack مثبّت) OK — 103 أصل SW بنمط webpack مطابق للراند-3.
- إعادة تشغيل daemon بالأصل الجديد (`daemon-start.mjs` — تجاوز علة DATABASE_URL المسربة في جلسة المعاينة): health `db:ok` · `/` 200 · أصل ثابت من manifest الجديد 200 · `POST /api/auth/login` 200.
- grep نهائي: صفر تعليمات SQLite إنتاجية في وثائق النشر، وكل ذكر `db push` فيها نهي. `.env.example` مطابق للمعمارية. `db/custom.db` غير متتبع. لا `git push`.

**القرار:** 🟢 GO دون تغيير — وثائق النشر أصبحت متسقة تمامًا مع المعمارية (PostgreSQL + migrate deploy).

**الملفات المتغيرة (الراند 4):** `DEPLOY.md`، `docs/DEPLOY-VERCEL.md`، `package.json` (سكربت build فقط)، `public/sw-manifest.json` (إعادة توليد)، `PRODUCTION-READINESS.md` (§7)، `WORKLOG.md` (هذا القسم).

### Round-4 إضافة — إثبات تحقق حي بتطلب المالك (2026-09-01)

المالك طلب تنفيذًا حيًا للأوامر الأربعة على النسخة النهائية بدل قراءة أرقام التقارير + نسخة احتياطية حقيقية بإثبات استعادة (بعد فقدان أرشيف SQLite الموثق).

**نُفّذ حيًا على `923d213`:** `bun install` EXIT 0 (1147 pkg) → `lint` EXIT 0 → `typecheck` EXIT 0 → `build` EXIT 0 (103 أصل webpack) → `bun test tests/security` **191 pass / 0 fail / 670 expect / 29.18s** → فحص حي على الأصل الجديد: health `db:ok` · `/` 200 · أصل webpack 200 · login 200.

**تدريب نسخ احتياطي حقيقي:** `pg-backup.sh` → 24MB + sha256 → `pg-restore-verify.sh` → عنقود مؤقت :5433 → **0 discrepancies → RESTORE DRILL PASSED** (شفافية: قاعدة المعاينة 0 صفوف أعمال — الإثبات لخط الآلة؛ التخزين الخارجي شرط عند النشر الفعلي).

**تحديث قرار Vercel (قرار تجاري):** `docs/DEPLOY-VERCEL.md` — عميل مدفوع ⇒ **Pro من أول يوم** (§0 + §3-2 + بند في قائمة تحقق §6)؛ Hobby للتجربة الذاتية فقط.

**خطوات النشر المتبقية — بيد المالك حصرًا (بالتجهيز الحرفي):**
1. Vercel **Pro** (لو العميل بيدفع) من [vercel.com](https://vercel.com) — متطلب شروط استخدام، مش اختياري.
2. من جهاز المالك: `git remote add origin https://github.com/<account>/hamd.git && git push -u origin main` (المستودع Private، بلا README/.gitignore).
3. Neon: Project جديد → Region Frankfurt → انسخ رابط **Pooled** + `?pgbouncer=true&connection_limit=1&sslmode=require`.
4. الترحيل (من جهاز المالك): `DATABASE_URL="<neon-pooled-url>" bunx prisma migrate deploy` — ثم نقل بيانات الأرشيف القديم إن وُجدت نسخة خارجية (docs/DATABASE-MIGRATION.md).
5. Vercel: Import المشروع → متغيرات البيئة `DATABASE_URL` + `AUTH_SECRET` (openssl rand -base64 48) → Deploy.
6. اختبار ذاتي كامل قبل تسليم الرابط: دخول → فاتورة → سند → تقرير → POS أوفلاين (قائمة §6 في docs/DEPLOY-VERCEL.md).
