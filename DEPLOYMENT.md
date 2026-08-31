# 🚀 DEPLOYMENT.md — دليل النشر (Vercel + PostgreSQL)

هذا الملف المرجع السريع للنشر. الشروح الكاملة: `docs/PRODUCTION-DEPLOYMENT.md` (خادم خاص)، `docs/DEPLOY-VERCEL.md` (Vercel + Neon)، `DEPLOY.md` (عام)، `docs/DISASTER-RECOVERY.md` (النسخ الاحتياطي)، `docs/DATABASE-MIGRATION.md` (ترحيل SQLite القديم).

---

## 1) المتطلبات

| المتطلب | القيمة |
|---|---|
| قاعدة البيانات | PostgreSQL ≥ 14 مُدار (Neon / Supabase / RDS) — **SQLite ممنوع في الإنتاج** |
| Node | ≥ 20 (Bun اختياري للتشغيل المحلي) |
| متغيرات بيئة | `DATABASE_URL`، `AUTH_SECRET` (≥16 حرفًا، وإلا يفشل الإقلاع)، `TRUST_PROXY=true` خلف proxy موثوق |

## 2) خطوات النشر على Vercel + Neon

```bash
# 1. قاعدة البيانات (Neon): أنشئ Project واحصل على connection string
#    أضف ?connection_limit=10&pool_timeout=20&connect_timeout=10

# 2. الترحيل (من جهازك، مرة واحدة):
DATABASE_URL="<neon-url>" bunx prisma migrate deploy
#    (ترحيل بيانات SQLite القديمة — إن كانت لديك نسخة خارجية من db/custom.db:
#     LEGACY_DATABASE_URL="file:db/custom.db" DATABASE_URL="<neon-url>" \
#     bun scripts/migrate-sqlite-to-postgres.ts   — يتحقق ذاتيًا ويخرج بخطأ عند أي اختلاف
#     ملاحظة جولة 3: الأرشيف الأصلي فُقد بإعادة تعيين بيئة المعاينة — حادثة موثقة)

# 3. Vercel: اربط المستودع واضبط متغيرات البيئة:
#    DATABASE_URL / AUTH_SECRET (openssl rand -base64 32) / TRUST_PROXY=true
#    Build = next build   |   Postinstall = prisma generate (موجود في package.json)

# 4. أول نشر ثم تحقق:
curl https://<domain>/api/health          # {"status":"ok","db":"ok"}
```

## 3) النشر على خادم خاص (بديل)

```bash
bun install
bunx prisma migrate deploy
bunx next build --webpack && node scripts/build-sw-manifest.mjs && node scripts/postbuild-local.mjs
NODE_ENV=production AUTH_SECRET=... DATABASE_URL=... node .next/standalone/server.js
# ضع nginx/caddy أمامًا بـ TLS + X-Real-IP (راجع docs/PRODUCTION-DEPLOYMENT.md §reverse-proxy)
```

## 4) قواعد صارمة

1. `prisma migrate deploy` **فقط** — `db push` ممنوع في الإنتاج (حرف `db:push` موجود للتطوير المحلي حصرًا).
2. لا تضع أي سر في Git — القيم تُدار بمتغيرات البيئة للمنصة. `scripts/.preview-secrets.env` خاص بالمعاينة المحلية ومتجاهل.
3. ~~`db/custom.db` أرشيف محلي… نظّف التاريخ قبل أول push~~ **مُغلق في جولة 3**: تنظيف تاريخ Git **تم وتحقق** (صفر أثر للـ DB والأسرار في كل التاريخ — انظر PRODUCTION-READINESS.md §3). ملاحظة: الملف نفسه فُقد بإعادة تعيين بيئة المعاينة (حادثة موثقة) — إن توفرت نسخة خارجية منه واستُرجست محليًا فقاعدة الاستبعاد من Git سارية.
4. بعد أي تغيير على `prisma/schema.prisma`: `bunx prisma migrate dev --name <change>` محليًا ثم `migrate deploy` في الإنتاج.

## 5) ما بعد النشر — قائمة تحقق

- [ ] `GET /api/health` يعيد `db:"ok"`
- [ ] تسجيل مؤسسة → حالة PENDING → موافقة المدير من كونسول المنصة → TRIAL
- [ ] دخول/خروج، إنشاء منتج/عميل/فاتورة/سند/مصروف/تحويل
- [ ] POS أوفلاين: اقطع الشبكة أثناء البيع → حُفظ محليًا → أعد الاتصال → فاتورة واحدة بالضبط (لا تكرار)
- [ ] `/api/export` (ADMIN) يعيد النسخة الكاملة — ولا يُخزَّن في SW (تحقق من `caches.match('/api/export')` = undefined)
- [ ] مجدول النسخ الاحتياطي يعمل + تدريب استعادة أسبوعي (`scripts/pg-restore-verify.sh`)
- [ ] رؤوس الأمان: `curl -I` يظهر CSP بنوسة + X-Frame-Options: DENY + HSTS
