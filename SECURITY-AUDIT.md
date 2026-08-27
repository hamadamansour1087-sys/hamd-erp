# 🔐 SECURITY-AUDIT.md — التقرير النهائي للتدقيق الشامل

**النطاق:** Full Code / Security / Authorization / Tenant Isolation / Financial Integrity / Offline Sync / Database / API / Production Config audit
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
| R4 | إلغاء فاتورة شراء لا يرجع `product.cost` السابق | السلوك الحالي مقصود (آخر تكلفة شراء) والرجوع يحتاج ledger لتاريخ التكاليف | منخفضة | جدول تكلفة تاريخية أو snapshot قبل التحديث |
| R5 | سندات فاتورة ملغاة تبقى في تقرير الصندوق | قرار تصميمي موجود: السند = نقد دخل فعلاً؛ المستحقات (partyDues) تستثني الملغاة أصلاً | منخفضة (منطق متسق مع الغرض) | إن رغبت: عكس السندات تلقائياً عند الإلغاء داخل الـ transaction |
| R6 | إخفاء رقم فاتورة الكاشير للعرض: `المدفوع الآن` يظهر أحياناً كسر عائم (36.79999…) | خلل عرض client-side قديم غير أمني | منخفضة | تنسيق القيمة بـ toFixed(2) في POSView |
| R7 | rate limiter في الذاكرة (ينمسح بإعادة التشغيل، لا يعمل عبر multi-instance) | نشر المستخدم instance واحد (VPS pm2) | منخفضة | Redis/backed limiter عند التوسع |

## 8) قواعد ما بعد النشر (مهمة)

1. على السيرفر: `AUTH_SECRET=$(openssl rand -base64 32)` **إلزامي** — بدونها الإنتاج يرفض الإقلاع.
2. `npm run db:deploy` بدل db:push.
3. غيّر كلمة مرور `admin@tijara.app / 123456` فوراً (تغييرها يقتل كل الجلسات القديمة تلقائياً).
4. انسخ `db/custom.db` احتياطياً يومياً (cron في DEPLOY.md).
