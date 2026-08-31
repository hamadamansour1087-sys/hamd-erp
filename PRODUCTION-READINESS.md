# 🚦 PRODUCTION-READINESS.md — قرار الجاهزية للإنتاج

**التاريخ:** 2026-08-31 | **HEAD:** `b806bb8` (main) | **القرار:** 🟠 **CONDITIONAL GO**

---

## 1) الخلاصة التنفيذية

مشروع H.A.M.D ERP (نقاط بيع + محاسبة، عربي RTL، Multi-Tenant، Offline-POS) خضع لجولتي تدقيق شاملتين (FIND→FIX→TEST→VERIFY). جولة 2 (هذه) فحصت كل مسارات API (60 handler)، المصادقة، عزل المستأجرين، التكامل المالي، التزامن، Idempotency، الأوفلاين، Git، النسخ الاحتياطي — أصلحت **2×P0 + 4×P1 + 8×P2** ورفعت حصيلة الاختبارات إلى **185/185**. لا توجد مشكلة P0/P1 معروفة غير معالَجة.

## 2) ما يجب أن يعمل — وحالته المتحقق منها فعليًا

| المتطلب | الحالة | الدليل |
|---|---|---|
| Multi-Tenant (orgId في كل كيان + كل استعلام) | ✅ | قراءة 38 route + اختبارات tenant-gate + فحص حي 401 |
| Multi-User + RBAC server-side | ✅ | مصفوفة أدوار مفروضة في الـ handlers + اختبارات |
| Offline POS (طابور + مزامنة + عدم تكرار) | ✅ | مفتاح idempotency ثابت عبر المحاولة الأولى والإعادة + 7 اختبارات جديدة |
| التكامل المالي (DECIMAL، ذرّية، CAS) | ✅ | قراءة الكود + اختبار توازٍ المدفوعات |
| النسخ الاحتياطي/الاستعادة | ✅ | تدريب فعلي ببيانات غير صفرية: 0 اختلافات |
| lint / typecheck / build / tests | ✅ | 0 / 0 / BUILD OK / 185-185 |
| بيانات الإنتاج PostgreSQL فقط | ✅ | provider=postgresql، .env.example بلا SQLite، سكربت ترحيل محفوظ |
| بيانات العملاء محفوظة | ✅ | db/custom.db لم يُحذف (فُصل عن Git فقط) |

## 3) الشروط الواجب قبل النشر الفعلي

1. **تنظيف تاريخ Git قبل أول push** (إلزامي):
   ```bash
   pip install git-filter-repo
   git filter-repo --invert-paths --path db/custom.db
   printf '<old-AUTH_SECRET-hex-64>==>REDACTED\n<old-admin-password>==>REDACTED\n' > /tmp/replacements.txt
   git filter-repo --replace-text /tmp/replacements.txt
   # تحقق: يجب ألا يرجع شيئًا
   git log --all --oneline -- db/custom.db
   git log --all -S'<old-admin-password>'
   ```
   > سرّ المعاينة القديم اعتبره مُسرَّبًا (لم يحمِ إنتاجًا أبدًا). ملفات .env الحقيقية ليست في التاريخ أبدًا (تحقق `git log --all -- .env`).
2. **أسرار الإنتاج:** `AUTH_SECRET=$(openssl rand -base64 32)` جديد + `DATABASE_URL` من مزود PG مُدار. لا تُعاد استخدام قيم المعاينة.
3. **نسخ احتياطي يومي:** شغّل `scripts/pg-backup.sh` مجدولًا + `pg-restore-verify.sh` أسبوعيًا (docs/DISASTER-RECOVERY.md)، أو snapshots المزود المُدار.
4. **HTTPS أمام التطبيق** (الترويسات تشمل HSTS وSecure-cookie تعمل خلف TLS فقط).

## 4) مخاطر مقبولة (P2 موثقة — لا تمنع النشر الأول)

| # | الخطر | الأثر | متى يُعالَج |
|---|---|---|---|
| 1 | مُحدد معدل التسجيل in-memory | سبام تسجيل يتضاعف بعدد النسخ | قبل التوسع الأفقي — انقله لجدول DB مثل LoginAttempt |
| 2 | تقارير غير مقيدة take (lowStock/valuation) | بطء عند عشرات آلاف الصفوف/مستأجر | عند نمو البيانات — SQL aggregation |
| 3 | فاتورة أوفلاين + 403 سقف تجربة = حذف نهائي | فقد عملية لعميل تجاوز السقف (سياسة معلنة) | قرار عمل |
| 4 | مزامنة متعددة التبويبات بلا Web Locks | تعارضات عرض فقط — السيرفر dedupe | تحسين اختياري |
| 5 | إجماليات الأوفلاين عرضٌ تقديري حتى المزامنة | فرق محتمل بعد تغيير سعر/ضريبة مركزيًا | توثيق للمستخدم |

## 5) بيانات النشر المرجعية

- Build: `bunx next build --webpack && node scripts/build-sw-manifest.mjs && node scripts/postbuild-local.mjs` (على Vercel: `next build` القياسي كافٍ — postbuild الخاص للمعاينة standalone فقط)
- Migrations: `prisma migrate deploy` فقط في الإنتاج (ممنوع `db push`)
- Health: `GET /api/health` → `{"status":"ok","db":"ok"}`
- الجلسة: كوكي httpOnly `session`، 30 يومًا، إبطال فوري عبر tokenVersion

## 6) خلاصة قرار

**🟠 CONDITIONAL GO** — التطبيق جاهز نشرًا على Vercel + PostgreSQL بشرط تنفيذ تنظيف تاريخ Git (قسم 3-1) قبل أي push خارجي، وضبط أسرار إنتاج جديدة. كل ما عدا ذلك أخضر مع اختباراته الفعلية.
