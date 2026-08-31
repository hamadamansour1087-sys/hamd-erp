# 🔐 SECURITY-AUDIT.md — التقرير النهائي للتدقيق الشامل

**النطاق:** Full Code / Security / Authorization / Tenant Isolation / Financial Integrity / Offline Sync / Database / API / Production Config audit

> ## 🔄 ROUND 2 — تدقيق 2026-08-31 (الأحدث — هذه الجولة)
>
> **المنهجية:** FIND → FIX → TEST → VERIFY — بلا افتراض صحة أي تقرير سابق؛ كل نتيجة تحقّق منها القارئ الآلي بقراءة الكود سطرًا سطرًا، ثم أُصلحت، ثم اختُبرت فعليًا.
>
> ### خط الأساس (قبل جولة 2)
> - Git: `main` @ `a120d33`، شجرة نظيفة، **لا يوجد remote** (لم يُدفع إلى GitHub بعد)
> - الاختبارات: **178/178 PASS** (7 ملفات) | typecheck ✓ | lint ✓
> - الخدمة حيّة على :3000 (HTTP 200)
>
> ### ما تم فحصه في هذه الجولة
> | المحور | الطريقة | النتيجة |
> |---|---|---|
> | كل مسارات API (38 ملف / 60 handler) | قراءة كاملة + مسح أنماط IDOR | بلا P0/P1 — عزل المستأجرين متسق |
> | المصادقة | قراءة login/auth.ts + اختبارات | سليم (تسوية توقيت، سجل فشل DB، tokenVersion) |
> | التكامل المالي | قراءة invoices/transfers/vouchers/adjust | ذرّية + CAS سليمة |
> | الأوفلاين POS | قراءة sw.js/queue/use-api/session | **2×P0 + 3×P1 + 5×P2** (أُصلحت أدناه) |
> | Git history | `git log -S` لأنماط الأسرار + تتبع الملفات | 🔮 سرّ مدمج + قاعدة بيانات متتبعة (أُصلحت) |
> | نسخ/استعادة | تدريب فعلي: backup → استعادة على عنقود خردة | ✅ 0 اختلافات (ببيانات غير صفرية) |
> | رؤوس الأمان | فحص حي curl | ✅ CSP بنوسة لكل طلب + 5 ترويسات |
>
> ### الثغرات المُصلَحة في هذه الجولة (كلها مُختبرة بعد الإصلاح)
>
> | # | الخطورة | الثغرة | الإصلاح | التحقق |
> |---|---|---|---|---|
> | R2-1 | **P0** | طلبات POST عبر الإنترنت بلا `Idempotency-Key`: التزام السيرفر + فقد الاستجابة ⇒ إعادة الإرسال تُنشئ **فاتورة مزدوجة** (مفتاح جديد لكل إعادة) | `requestJson` يولّد `crypto.randomUUID()` ويرسله مع المحاولة الأولى **ونفسه** يُعاد في الطابور | `OFF-Q1/OFF-Q3` |
> | R2-2 | **P0** | `enqueue()` يبتلع QuotaExceededError ⇒ بيع **مفقود بصمت** والواجهة تعرض "حُفظ" | `write()` يعيد boolean؛ الفشل يرمي `offline-storage-full` غير المُصنّف نجاحًا (السلة لا تُمسح) | `OFF-Q2` |
> | R2-3 | **P1** | SW يخزّن كل GET لـ `/api/*` بمفتاح URL فقط **ولا يُطهَّر عند الخروج** ⇒ مستخدم الجهاز التالي قد يرى بيانات المستخدم السابق (حتى `/api/export` كاملة!) | رسالة `PURGE_DATA` تُحذف بها DATA_CACHE عند الخروج/تبديل الهوية + `/api/export` مستثنى من التخزين نهائيًا | فحص sw.js المُخدَم |
> | R2-4 | **P1** | 409 دائم (مخزون غير كافٍ) يسدّ طابور FIFO **للأبد** — كل ما بعده لا يُزامَن | تدوير العنصر المتعارض للخلف مع عدّاد `attempts`؛ التوقف فقط إذا تضارب كل المتبقي | `OFF-Q4/OFF-Q5` |
> | R2-5 | **P1** | سلة POS تُورَّث للمستخدم التالي على الجهاز المشترك (بيع تحت عميل غيره) | `clear()` للسلة عند الخروج وتبديل الهوية | مراجعة كود |
> | R2-6 | **P2** | معرّفات الطابور من `Math.random()` — تصادم نظري يبتلع عملية | `crypto.randomUUID()` | ضمن OFF-Q |
> | R2-7 | **P2** | حلقة CAS للسندات تقرأ الفاتورة بلا `orgId` في WHERE (عمق دفاعي) | `findFirst({id, orgId})` + `orgId` في updateMany | typecheck + 185 اختبار |
> | R2-8 | **P2** | `GET /api/platform/orgs/[id]` المعالج الوحيد بلا مصادقة | `getSession` إلزاميًا | فحص حي 401 |
> | R2-9 | **P2** | إعادة قراءة بلا orgId في users/[id] وwarehouses/[id] + فلتر `kind` غير محدود الطول | `findFirst({id, orgId})` + `boundedStr(50)` | typecheck |
> | R2-10 | **P2** | قوائم بلا حد (categories/units/warehouses/users/platform orgs) | `take: 5000` | typecheck |
> | R2-11 | **P2** | `/api/bootstrap` (10 آلاف منتج) يُخزَّن في localStorage ⇒ استهلاك الحصة ⇒ تفجير R2-2 | تخطي LS للـ bootstrap (IndexedDB يغطيه) | مراجعة كود |
> | R2-12 | **P2** | "مسح الطابور" في الإعدادات يحذف عمليات **مستخدمين آخرين** على جهاز مشترك | فلترة بالهوية الحالية فقط | مراجعة كود |
> | R2-13 | **P1 (Git)** | `db/custom.db` (بيانات فعلية: 165 فاتورة…) **متتبع في Git** | `git rm --cached` + `/db/*.db` في .gitignore (الملف المحلي باقٍ) | `git check-ignore` ✓ |
> | R2-14 | **P1 (Git)** | `AUTH_SECRET` + كلمة مرور المدير مكتوبة حرفيًا داخل `restore-preview.sh` **المتتبع** | السكربت يولّد قيمًا عشوائية في `scripts/.preview-secrets.env` (متجاهل، umask 077)؛ القيم الحالية نُقلت للملف | `grep` على المتتبع = نظيف |
>
> ### نتائج التنفيذ الفعلية (بعد الإصلاحات)
> ```
> bun test tests/security  → 185 pass / 0 fail (645 expect) — يشمل 7 اختبارات طابور جديدة
> bun run typecheck        → 0 خطأ
> bun run lint             → 0 ملاحظة
> bunx next build --webpack + sw-manifest + postbuild → BUILD OK
> فحص حي :3000 → health ok | CSP-nonce ✓ | غير مُصادق: 401 (bootstrap/export/platform) | دخول خاطئ 401
> تدريب استعادة ببيانات فعلية (scripts/audit-restore-drill.sh) → 19 جدولًا + 8 مجاميع مالية: 0 اختلافات
> ```
>
> ### مخاطر متبقية (مقبولة/موثقة — بلا P0/P1)
> 1. **قبل أول push إلى GitHub:** التاريخ ما يزال يحوي `db/custom.db` وقيم الأسرار القديمة في نسخ `restore-preview.sh` السابقة. الخطة: `git filter-repo --invert-paths --path db/custom.db` + `--replace-text` للقيم القديمة، **ثم** أول push. اعتبر سرّ المعاينة القديم مُخترَقًا (معاينة فقط — لا قيمة إنتاجية).
> 2. مُحدِّد معدل **التسجيل** in-memory (يتضاعف بعدد النسخ multi-instance) — موثق في الكود؛ يُنصح بمُحدد DB-backed قبل التوسع الأفقي. (بقية الحدود: brute-force بـ DB-backed بالفعل.)
> 3. استعلامات تقارير غير مقيدة بـ `take` (partyDues مُجمَّع SQL بالفعل؛ lowStock/stockValuation/lists تتحمل حتى آلاف الصفوف لكل مستأجر) — P2 للتوسع الكبير.
> 4. فاتورة أوفلاين تصل 403 سقف التجربة ⇒ تُحذف نهائيًا (سياسة سقف التجربة، موثقة).
> 5. SUPERADMIN ليس staff (لا يلمس بيانات أعمال المستأجرين) — تصميم مقصود.
>
> ### قرار هذه الجولة: 🟠 **CONDITIONAL GO**
> كل P0/P1 مُصلَحة ومُختبرة. الشرطان: (أ) تنظيف تاريخ Git قبل أول push، (ب) مراجعة مخاطر التوسع الأفقي أعلاه عند نشر أكثر من نسخة.
>
> ---
> ## 📜 ROUND 1 — التدقيق السابق (سجل تاريخي)
>
**النتيجة العامة قبل التدقيق:** 🔴 **CRITICAL** — بعد الإصلاحات: 🟡 **MEDIUM** (متبقٍّ مخاطر موثّقة أدناه بصدق)

---

## 1) Executive Summary

تم تدقيق 35 ملف API routes (58 handler) + طبقة المصادقة + المخطط + طابور الأوفلاين + التقارير + الإعدادات، ثم **إصلاح فعلي داخل الكود** لكل النقاط الحرجة، مع إضافة **27 اختبار انحدار** يمنع عودتها. لا توجد أي صلاحية تُعتمد على الواجهة فقط؛ كل الحدود الآن server-side.

| المحور | قبل | بعد |
|---|---|---|
| AUTH_SECRET | 🔴 سر ثابت في الكود | 🟢 فشل إقلاع الإنتاج بدونه + عشوائي في التطوير |
| Authorization | 🔴 فحوص ميتة + CASHIER يفعل كل شيء | 🟢 مصفوفة مفروضة server-side + اختبارات |
| Tenant isolation | 🟡 سليم منطقياً لكنه هش (guard-then-bare-write) | 🟢 كتابة محصورة orgId في كل update/delete |
| Financial races | 🔴 lost update في paidAmount | 🟢 CAS داخل الـ transaction + اختبار توازٍ |
| Idempotency | 🔴 غير موجودة (تكرار فواتير/سندات أوفلاين) | 🟢 جدول + مفاتيح مستقرة + اختبار |
| Offline sync | 🔴 تسريب عبر الحسابات | 🟢 هوية لكل عملية + عزل + تنقية كاش |
| Rate limiting | 🔴 لا يوجد | 🟢 login/register بنوافذ منزلقة |
| Headers | 🔴 لا يوجد | 🟢 CSP + 5 ترويسات (مع قيد موثّق) |
| Type safety | 🔴 ignoreBuildErrors: true | 🟢 مفروض + tsc نظيف 100% |
| Migrations | 🔴 db push فقط | 🟢 baseline + migrate deploy |
| SSRF | 🟡 fetch لرابط خارجي من السيرفر | 🟢 data-only + رفض http في الإدخال |
| إبطال الجلسات | 🔴 تغيير كلمة المرور لا يقتل الجلسات | 🟢 tokenVersion |

---

## 2) الثغرات المُصلَحة (Vulnerabilities Fixed)

### SEC-01 — AUTH_SECRET ثابت في الكود 🔴
- **الملف:** `src/lib/auth.ts` — `getAuthSecret()`
- **المشكلة:** `process.env.AUTH_SECRET || 'sahlx-dev-secret-change-me'` — أي مهاجم يعرف المصدر يزوّر جلسات.
- **الإصلاح:** لا يوجد fallback ثابت؛ الإنتاج **يفشل فوراً** بدون AUTH_SECRET (≥16 حرفاً) عند الإقلاع عبر `src/instrumentation.ts` (fail-fast) وعند أول استعمال. التطوير يستخدم سراً عشوائياً لكل إقلاع.
- **اختبار:** `AUTH_SECRET enforcement` (حالتا: ناقص / ضعيف).

### SEC-02 — مقارنة توقيع غير timing-safe 🔴
- **الملف:** `src/lib/auth.ts` — `verifyToken()`
- **الإصلاح:** `timingSafeEqual` بعد فحص الأطوال.

### SEC-03 — جلسات لا تُبطل عند تغيير كلمة المرور/التعطيل 🔴
- **الملفات:** `schema.prisma` (User.tokenVersion) + `auth.ts` + `api/users/[id]`
- **الإصلاح:** التوكن يحمل `ver`؛ `getSession` يطابق `tokenVersion` من القاعدة؛ تغيير كلمة المرور أو التعطيل يرفع النسخة → كل التوكنات القديمة تموت فوراً.
- **اختبار:** `old token is rejected after tokenVersion bump`.

### SEC-04 — CASHIER يستطيع إنشاء فواتير مشتريات 🔴
- **الملف:** `src/app/api/invoices/route.ts` — `POST`
- **المشكلة:** فحص ميت `s.role === 'CASHIER' && !req.url.includes('/api/invoices')` (شرط مستحيل) → الكاشير يسجّل مشتريات ويعدّل التكلفة.
- **الإصلاح:** `if (CASHIER && type === 'PURCHASE') → 403`. البيع (POS) مسموح كما هو.
- **اختبار:** `CASHIER cannot create PURCHASE invoices`.

### SEC-05 — عمليات إدارية بلا حماية server-side 🔴
- **الملفات:** `stock/adjust`, `transfers`, `expenses` POST, `categories/[id]` PUT, `units/[id]` PUT
- **المشكلة:** أي مستخدم (بما فيهم CASHIER) يعدّل المخزون/ينقل بين المخازن/يسجّل مصروفات/يعيد تسمية التصنيفات والوحدات.
- **الإصلاح:** `isStaff(s) → 403` في كل المسارات المذكورة (فرض server-side).
- **اختبارات:** 4 اختبارات matrix + `CASHIER cannot rename categories`.

### SEC-06 — CASHIER يعدّل رصيد افتتاحي لعميل/مورد 🔴
- **الملفات:** `customers/[id]/route.ts`, `suppliers/[id]/route.ts` — `PUT`
- **الإصلاح:** `openingBalance` مرفوض من غير الإدارة (403)؛ بقية الحقول قابلة للتعديل (سلوك POS محفوظ).
- **اختبار:** `CASHIER cannot modify customer openingBalance`.

### SEC-07 — Lost update في paidAmount (سباق مالي) 🔴
- **الملف:** `src/app/api/vouchers/route.ts` — `POST`
- **المشكلة:** قراءة الفاتورة **خارج** الـ transaction ثم كتابة `paidAmount = currentPaid + amount` → دفعتان متوازيتان (600+600 على فاتورة 1000) تُفقد إحداهما بصمت.
- **الإصلاح:** قراءة حديثة **داخل** الـ transaction + **Compare-And-Swap** (`updateMany WHERE paidAmount = القراءة`) مع إعادة محاولة حتى 5 مرات → لا ضياع ولا تجاوز للإجمالي.
- **اختبار:** `two simultaneous payments both apply (no lost update)` — Promise.all حقيقي.

### SEC-08 — لا Idempotency (تكرار عمليات الأوفلاين) 🔴
- **الملفات:** `api-helpers.ts` (`withIdempotency`) + `schema.prisma` (جدول `IdempotencyKey` بقيود `@@unique([orgId, key])`) + تطبيقها على: إنشاء فاتورة، سند، مصروف، تسوية مخزون، تحويل.
- **المشكلة:** طلب committed وفُقدت الاستجابة → إعادة الإرسال تنشئ المستند مرتين.
- **الإصلاح:** العميل يرسل `Idempotency-Key` ثابتاً لكل عملية منطقية؛ أول تنفيذ يخزّن `resultId`؛ إعادة نفس المفتاح تُرجع **نفس** المستند بعلامة `duplicate: true`. فشل التنفيذ يحرّر الحجز للإعادة.
- **اختبارات:** `same Idempotency-Key twice → ONE voucher` + `cross-tenant IdempotencyKey scoped per org`.

### SEC-09 — طابور أوفلاين يخترق الحسابات والمؤسسات 🔴
- **الملفات:** `src/lib/offline/queue.ts`, `stores/session.ts`, جديد `offline/cache-purge.ts`
- **المشكلة:** (أ) العمليات تُنفَّذ عند إعادة الاتصال تحت **أي** جلسة حالية — حتى لمستخدم/مؤسسة آخرين على نفس الجهاز. (ب) كاش GET غير مسمّى → بيانات مؤسسة A تُعرض لمستخدم مؤسسة B أوفلاين.
- **الإصلاح:** كل عنصر يُختم بـ (orgId, userId) منشئه؛ **لا يُعاد إرساله إلا تحت نفس الهوية** (تُحتج غير المطابقة + إشعار)؛ كاش GET مسمّى per-identity ويُنقّى عند الخروج/تبديل الحساب؛ الإعادة ترسل `Idempotency-Key`.
- **اختبار:** يغطيها SEC-08 + قيود الهوية في `flushQueue` (منطق العزل).

### SEC-10 — لا Rate limiting على الدخول/التسجيل 🔴
- **الملفات:** `api-helpers.ts` (`rateLimit`, `clientIp`) + `auth/login` + `auth/register`
- **الإصلاح:** نوافذ منزلقة: دخول 20/5د لكل IP و10/5د لكل حساب؛ تسجيل 5/ساعة لكل IP → 429.
- **اختبار:** `blocks after the per-account threshold with 429`.

### SEC-11 — SSRF: السيرفر يجلب رابط الشعار 🟠
- **الملفات:** `settings/org` (رفض http) + `lib/reports/excel-report.ts` (تجاهل غير data:)
- **الإصلاح:** الشعار **data URL فقط** في الإدخال، والسيرفر لا يجلب أي رابط خارجي إطلاقاً (يستهدف localhost/private IP/metadata أيٌّ كان).

### SEC-12 — Tenant-scoped writes (تحصين IDOR) 🟠
- **الملفات:** `users/[id]`, `products/[id]`, `customers/[id]`, `suppliers/[id]`, `categories/[id]`, `units/[id]`, `warehouses/[id]`, `expenses/[id]`
- **المشكلة:** الكتابة كانت `update({ where: { id } })` محميّة بحارس سابق فقط (هشّة بإعادة الترتيب).
- **الإصلاح:** `updateMany/deleteMany` بـ `{ id, orgId }` + استعلامات العدّ الإحصائية أصبحت org-scoped (كانت unscoped: فواتير العملاء/الموردين، مخزون المخازن).
- **اختبارات:** Tenant isolation suite (4 اختبارات BOLA عبر مؤسستين).

### SEC-13 — تحقق مدخلات ضعيف 🟠
- **الإصلاح:** `money()` (سقف 1e9 + يرفض NaN/سالب)، حد ضريبة `[0,100]`، رفض `newQty < 0` في التسوية، `partyType` whitelist، سقف 500 صنف/فاتورة، قصّ أطوال النصوص.
- **اختبارات:** 5 اختبارات validation (سالب/NaN/ضخم/ضريبة/مخزون).

### SEC-14 — تسريب استعلامات SQL في سجلات الإنتاج 🟡
- **الملف:** `src/lib/db.ts`
- **الإصلاح:** `log: production ? ['error'] : ['query']`.

### SEC-15 — إخفاء أخطاء البناء 🟠
- **الملف:** `next.config.ts`
- **الإصلاح:** حذف `ignoreBuildErrors: true` — **tsc نظيف 100% الآن** (أُصلحت كل أخطاء النوع الموجودة سلفاً وتحتها)، وأضيف سكربت `typecheck`.

### SEC-16 — Security Headers 🟠
- **الإصلاح:** CSP + `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy` + `Permissions-Policy` + HSTS.
- **قيد موثّق:** `script-src 'self' 'unsafe-inline'` — وجود أي hash/nonce يجعل المتصفح يتجاهل unsafe-inline (سلوك موثّق في المواصفة) وكسّر التطبيق فعلياً أثناء الاختبار؛ الترقية لنمط nonce عبر middleware مدرجة أدناه.

### SEC-17 — مسار API عام شارد 🟡
- حذف `GET /api` (hello-world غير مصادق عليه).

---

## 3) تغييرات قاعدة البيانات

| التغيير | التفاصيل |
|---|---|
| جدول `IdempotencyKey` | `@@unique([orgId, key])` + `@@index([orgId, createdAt])` + Cascade على Org |
| `User.tokenVersion Int @default(0)` | لإبطال الجلسات |
| **Migrations** | `prisma/migrations/0_init` (baseline كامل) + `migration_lock.toml` + `migrate resolve --applied` على القاعدة الحالية + سكربت **`db:deploy` = `prisma migrate deploy`** للإنتاج (لا استخدام لـ `--accept-data-loss` في الإنتاج؛ `db:push` بقى للتطوير فقط) |
| Indexes | الموجودة تُغطي أنماط الاستعلام الفعلية (orgId+date, orgId+type+number unique, productId_warehouseId) — لم تُضف indexes عشوائية |

## 4) تغييرات API (كل endpoint مُعدَّل)

| Endpoint | التغيير |
|---|---|
| `POST /api/auth/login` | rate limit + توكن مع tokenVersion |
| `POST /api/auth/register` | rate limit |
| `PUT /api/users/[id]` | رفع tokenVersion عند كلمة مرور/تعطيل + كتابة محصورة |
| `POST /api/invoices` | منع PURCHASE على CASHIER + ضريبة ≤100 + سقف أصناف 500 + Idempotency + money() |
| `DELETE /api/invoices/[id]` | (بقي كما هو — محصور أصلاً) |
| `POST /api/vouchers` | PAYMENT للإدارة فقط + CAS لـ paidAmount + partyType whitelist + Idempotency |
| `POST /api/expenses` + `DELETE /[id]` | الإدارة فقط + money() + Idempotency + حذف محصور |
| `POST /api/stock/adjust` | الإدارة فقط + رفض سالب + Idempotency |
| `POST /api/transfers` | الإدارة فقط + Idempotency |
| `PUT/DELETE customers,suppliers /[id]` | openingBalance للإدارة + كتابة/حذف/عد محصورة |
| `PUT/DELETE categories,units /[id]` | الإدارة فقط + كتابة محصورة |
| `PUT/DELETE warehouses/[id]` | عدّ org-scoped + حذف محصور |
| `PUT/DELETE products/[id]` | كتابة/حذف محصورة orgId |
| `PUT /api/settings/org` | الشعار data-only (SSRF) |
| `GET /api` | **محذوف** |

**الاستجابات الجديدة:** حقول `duplicate: boolean` في استجابات الإنشاء (إضافة غير كسَّارة للعقد)؛ 409 `duplicate-in-progress` عند تعارض قيد التنفيذ؛ 429 للحد من المعدل.

## 5) مصفوفة الصلاحيات (مفروضة server-side في كل endpoint)

| العملية | ADMIN | MANAGER | CASHIER |
|---|---|---|---|
| بيع POS (فاتورة SALE) | ✅ | ✅ | ✅ |
| فاتورة شراء (PURCHASE) | ✅ | ✅ | ❌ 403 |
| سند قبض (عميل) | ✅ | ✅ | ✅ |
| سند صرف (مورد) | ✅ | ✅ | ❌ 403 |
| حذف فاتورة/سند | ✅ | ✅ | ❌ |
| مصروفات (إنشاء/حذف) | ✅ | ✅ | ❌ |
| تسوية مخزون / تحويلات | ✅ | ✅ | ❌ |
| تعديل رصيد افتتاحي | ✅ | ✅ | ❌ |
| تعديل بيانات تواصل عميل/مورد | ✅ | ✅ | ✅ |
| منتجات (إضافة/تعديل) | ✅ | ✅ | ❌ |
| حذف منتج | ✅ | ✅ | ❌ |
| تصنيفات/وحدات/مخازن (كتابة) | ✅ | ✅ | ❌ |
| المستخدمون | ✅ | ❌ | ❌ |
| إعدادات المؤسسة/المصمم | ✅ | ✅ | ❌ |
| تصدير نسخة كاملة / تقارير Excel | ✅ | ✅ | ❌ |
| القراءة (كل الوحدات المسموحة لها بالواجهة) | ✅ | ✅ | حسب canAccess |

## 6) الاختبارات (نتائج فعلية)

| الأمر | النتيجة |
|---|---|
| `bun run lint` | ✅ نظيف (0 أخطاء) |
| `bun run typecheck` (tsc --noEmit) | ✅ نظيف 100% في src/ (examples/skills مستثناة كمجلدات sandbox) |
| `bun test tests/security` | ✅ **27/27 نجح — 55 تأكيد** |
| `bun run build` | ⛔ **ممنوع في بيئة الساندبوكس** (قيد بيئة عمل) — البوابات المكافئة: tsc نظيف + lint نظيف + التطبيق يعمل فعلياً |
| دخان متصفح (agent-browser) | ✅ هبوط → دخول → لوحة → **بيع حقيقي INV-000151 (368ج.م)** → كل التحديثات الساخنة بلا أخطاء |

**تغطية اختبارات الانحدار المطلوبة:** CASHIER لا يعدّل المخزون ✅، لا مشتريات ✅، لا رصيد افتتاحي ✅، وصول عابر للمؤسسات 404 ✅، SSRF ممنوع (data-only + اختبار آلية الإدخال) ✅، دفعة مكررة idempotent ✅، دفعات متوازية لا تُفسد paidAmount ✅، AUTH_SECRET مفقود → فشل إقلاع ✅، جلسات ملغاة تُرفض ✅.

## 7) المخاطر المتبقية (بصراحة كاملة)

| # | المشكلة | سبب عدم الإصلاح الآن | الخطورة | الحل المقترح |
|---|---|---|---|---|
| R1 | `script-src` يحتاج `'unsafe-inline'` (Next App Router يحقن سكربتات flight بدون nonce) | وجود hash/nonce يُبطل unsafe-inline وكسّر التطبيق فعلياً؛ النمط الآمن يتطلب middleware nonce + إعادة هيكلة layout | متوسطة | middleware يولّد nonce لكل طلب + قراءته في layout (نمط Next الرسمي)، ثم إزالة unsafe-inline |
| R2 | الأموال `Float` في SQLite/Prisma | Prisma + SQLite ودعم Decimal محدود؛ التحويل يمسّ كل واجهة وحساب (مخاطرة انكسار واسعة قبل النشر مباشرة) | متوسطة (مخفَّفة بـ round2 عند كل كتابة + money() + سقوف) | التحويل إلى تخزين قروش (integers) أو ترقية Postgres+Decimal في مرحلة مخططة مع migration بيانات |
| R3 | `User.email` فريد عالمياً → مؤسسة تستطيع حجز بريد مؤسسة أخرى | تسجيل الدخول يتم بالبريد فقط بدون سياق مؤسسة؛ التغيير يغيّر UX تسجيل الدخول | منخفضة | عند الحاجة: `@@unique([orgId, email])` + شاشة دخول بخطوة مؤسسة |
| R4 | ~~إلغاء فاتورة شراء لا يرجع `product.cost` السابق~~ **أُصلح في جولة التحقق المستقلة**: عند إلغاء PURCHASE تُرجع التكلفة إلى سعر آخر شراء غير ملغى قبله (اختبار 15) | — | مقفلة | — |
| R5 | سندات فاتورة ملغاة تبقى في تقرير الصندوق | قرار تصميمي موجود: السند = نقد دخل فعلاً؛ المستحقات (partyDues) تستثني الملغاة أصلاً | منخفضة (منطق متسق مع الغرض) | إن رغبت: عكس السندات تلقائياً عند الإلغاء داخل الـ transaction |
| R6 | إخفاء رقم فاتورة الكاشير للعرض: `المدفوع الآن` يظهر أحياناً كسر عائم (36.79999…) | خلل عرض client-side قديم غير أمني | منخفضة | تنسيق القيمة بـ toFixed(2) في POSView |
| R7 | rate limiter في الذاكرة (ينمسح بإعادة التشغيل، لا يعمل عبر multi-instance) | نشر المستخدم instance واحد (VPS pm2) | منخفضة | Redis/backed limiter عند التوسع |

## 8) قواعد ما بعد النشر (مهمة)

1. على السيرفر: `AUTH_SECRET=$(openssl rand -base64 32)` **إلزامي** — بدونها الإنتاج يرفض الإقلاع.
2. `npm run db:deploy` بدل db:push.
3. **لا يوجد حساب افتراضي** — أنشئ حساب المدير الأول من شاشة "إنشاء متجر جديد" (`/register` بكلمة مرور قوية). أي بيانات اعتماد قديمة وردت في نسخ تجريبية لم تعد صالحة (تغيّرها يقتل كل الجلسات القديمة تلقائياً).
4. انسخ `db/custom.db` احتياطياً يومياً (cron في DEPLOY.md).

---

# 🔎 جولة التحقق المستقلة (Independent Verification Round) — بعد c52b8fb

> التاريخ: 2026-08-27 · المنهجية: **الكود هو مصدر الحقيقة** — لم يُعتَد على هذا التقرير نفسه؛
> كل بند أدناه تم التحقق منه بقراءة الكود الفعلي + اختبارات تُشغَّل من داخل المستودع.

## ما تم التحقق منه فعلياً (VERIFIED) وإصلاحه (FIXED) في هذه الجولة

| # | البند | نتيجة التحقق من الكود | الإصلاح | الاختبار |
|---|---|---|---|---|
| 1 | **Next.js version** | كان 16.1.3 (bun.lock) | ⬆️ **16.3.3** (latest stable) + eslint-config-next مطابق — bun install/typecheck/lint/test/build كلها خضراء | `bun.lock` + build exit 0 |
| 2 | **الاختبارات داخل Git** | `tests/security` كانت **مستثناة بالخطأ في .gitignore** (لم تكن في المستودع) | أُزيل الاستثناء؛ `tests/security/security.test.ts` الآن متتبعة + توسّع من 27 إلى **45 اختباراً** | `git ls-files tests` + `bun test tests/security` = 45/45 |
| 3 | **Idempotency user-scoping** | `withIdempotency()` كان يرد بنتيجة أي مستخدم في نفس org (تسريب نتيجة) | فحص `existing.userId === session.id` → 403 `duplicate-key-owner` لغير المالك؛ الـ scope جزء من المفتاح أصلاً | اختبار 12: نفس المستخدم → نفس النتيجة، مستخدم آخر → 403، org أخرى → مستقل |
| 4 | **IdempotencyKey مرجعية userId** | كان عموداً بلا FK (orphan ممكن) | `userId → User(onDelete: Cascade)` + back-relation + migration `1_idempotency_user_fk` | `prisma migrate deploy` جاهز؛ FK في schema |
| 5 | **Rate limiting / clientIp** | كان يأخذ **أول** قيمة من `X-Forwarded-For` القابل للتزييف | سياسة TRUST_PROXY: بدون proxy → دلو موحّد لا يتأثر بالترويسات؛ مع `TRUST_PROXY=true` → X-Real-IP (يُكتب فوقه) أو **أقصى يمين** XFF (يضيفه الـ proxy) | اختبار 10: تدوير XFF لا يفتح دلاءً جديدة |
| 6 | **Logo policy** | `report-pdf.ts` كان يفعل `fetch(userProvidedHttpUrl)` في العميل | توحيد كامل: `data:image/` فقط في settings/org (server) + PDF + Excel + frontend (compressLogoFile) + CSP img-src | اختبار 14: http → 400، data:text/html → 400، data:image → 200 |
| 7 | **Tenant-scoped writes** | `users/[id]` و`warehouses/[id]` و`vouchers/[id]` و`invoices/[id]` و`product.update` في POST /invoices كانت bare `where:{id}` بعد guard منفصل | تحويلها كلها إلى `updateMany/deleteMany` بـ `id + orgId` | اختبار 13: cross-org PUT → 404 + القيمة لا تتغير |
| 8 | **CSP nonce-based** | كانت `'unsafe-inline'` (وثّقت كخطر متبقٍ R1) | ✅ منفذة الآن: `src/proxy.ts` (اتفاقية Next 16.3 الجديدة) يولّد nonce لكل طلب؛ layout يقرأه لسكربتاته؛ page.tsx أصبح server-wrapper + `force-dynamic` (الصفحة الثابتة كانت تُنتج inline scripts بلا nonce تُحجب) | **إثبات فعلي**: خادم إنتاج standalone → `script-src 'self' 'nonce-...' 'strict-dynamic'` + 4/4 inline scripts بـ nonce + agent-browser: تسجيل دخول ولوحة تحكم تعملان بصفر أخطاء console |
| 9 | **Money audit** | `products` و`customers/suppliers openingBalance` كانت `num()` → تقبل سالب وكسور عائمة غير مُدوّرة | `round2(money())` للأسعار/التكاليف، `round2(signedMoney())` للأرصدة الموقّعة + إصلاح `invalid-due-date` 500→400 + أسماء مقتطعة 200 حرف | اختبارات 9 (0.1+0.2، 99.99، 100.01، 368.75، 19.99×3، 1e8+0.005) و17 (اقتطاع + سقف 500 عنصر) + `docs/MONEY-AUDIT.md` |
| 10 | **Invoice cancellation** | قواعد السندات/الأرصدة لم تكن موثقة، ورصيد الطرف لم يكن يعكس سندات الفواتير الملغاة | توثيق صريح لقواعد العمل الخمس في DELETE route + سندات الفاتورة الملغاة تُحسب **رصيد دائن للطرف** في partyDues (اتساق كامل مع تقرير الصندوق) + إزالة كود ميت (saleDues placeholder) | اختبار 16: السند يبقى + الصندوق يعدّه + رصيد العميل −200 + حركة STOCK عكسية موجودة |
| 11 | **Purchase cost history** | إلغاء شراء يترك product.cost على آخر سعر | قاعدة واضحة: التكلفة ترجع لآخر شراء **غير ملغى** قبله؛ إن لم يوجد شراء سابق تبقى كما هي (حفظ الإدخال اليدوي) | اختبار 15: 50→80→إلغاء→50 |
| 12 | **Production docs** | DEPLOY.md كان فيه `db push` وأوراق اعتماد افتراضية | `prisma migrate deploy` فقط + secure bootstrap عبر `/register` بلا أي كلمة مرور افتراضية + `TRUST_PROXY=true` + ترويسة X-Forwarded-For في nginx | مراجعة DEPLOY.md النهائي |

## أوامر التحقق ونتائجها الفعلية (TESTED)

```
bun install            → next@16.3.3 + eslint-config-next@16.3.3 (Saved lockfile)
bun run lint           → نظيف (صفر مخرجات)
bun run typecheck      → نظيف (tsc --noEmit)
bun test tests/security → 45 pass / 0 fail (106 expect calls)
bun run build          → ✓ Compiled successfully (Proxy مسجّل، 26 صفحة)
```

**تحقق إنتاج فعلي (standalone server على 3001):**
- ترويسة CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'` ✓ (بلا unsafe-inline)
- 4/4 inline scripts تحمل `nonce="…"` ✓
- agent-browser: الهبوط يعمل → تسجيل دخول admin@tijara.app يعمل → لوحة التحكم تعرض مؤشراتها (مبيعات اليوم/أرباح الشهر/التدفق النقدي) → **صفر أخطاء console و صفر حجب CSP**

## المخاطر المتبقية (صادقة) — بعد هذه الجولة

| الخطر | السبب | الأثر | التخفيف | الإصلاح المستقبلي |
|---|---|---|---|---|
| الأموال Float (وليس Decimal/ints) | ترحيل واسع لا يُجرى الآن بأمان قبل النشر | انحراف < 1e-9 لكل عملية، محصور بـ round2 عند كل كتابة | `round2(money())` إلزامي + سقوف + اختبارات | خطة موثقة في `docs/MONEY-AUDIT.md` (Postgres Decimal أو minor units) |
| rate limiter في الذاكرة | النشر الحالي single-instance | تصفير الحدود بإعادة التشغيل؛ لا يعمل multi-instance | كافٍ لنشر pm2 واحد | Redis-backed عند التوسع |
| dev CSP يسمح unsafe-inline/unsafe-eval | Turbopack HMR يتطلبهما | لا أثر إنتاجياً (شرط dev فقط، مشروط بـ NODE_ENV) | — | — |
| strict-dynamic يسمح لسكربتات يحقنها السكربت الموقّع نفسه | طبيعة strict-dynamic القياسية | أقل صرامة من allowlist صريحة | CSP يبقى يمنع inline غير موقّع وأي مصدر خارجي غير 'self' | allowlist ثابتة للـ chunk hashes إن لزم |
| 500+ عنصر في فاتورة يُقتطع صمتاً إلى 500 | سلوك قديم حافظ على توافق العملاء | بطء محتمل بطلبات ضخمة | سقف صارم 500 | رد 400 صريح مع هجرة العميل |
