# 🚀 دليل رفع H.A.M.D على GitHub والنشر على استضافة

> **قاعدة الإنتاج الذهبية:** قاعدة البيانات في الإنتاج هي **PostgreSQL حصراً**
> (`provider = "postgresql"` مثبّت في `prisma/schema.prisma`). **ممنوع منعاً باتاً**
> نشر SQLite في الإنتاج — ملف `db/custom.db` القديم أرشيف ترحيل فقط لا يفتحه
> السيرفر أبداً (انظر «الترحيل القديم» أدناه).

---

## الجزء الأول: الرفع على GitHub

المستودع المحلي **جاهز بالكامل** (فرع `main` + تاريخ نظيف من أي قواعد بيانات أو أسرار).
كل ما عليك:

### 1) أنشئ مستودعاً جديداً على GitHub
- ادخل [github.com/new](https://github.com/new)
- الاسم المقترح: `hamd` — اختر **Private** (مشروع تجاري)
- **لا تختر** أي خيار لإضافة README أو .gitignore (المستودع يجب أن يبقى فارغاً)
- اضغط **Create repository**

### 2) اربط المستودع وادفع (من مجلد المشروع على جهازك)

```bash
git remote add origin https://github.com/اسم-حسابك/hamd.git
git push -u origin main
```

> سُئلت عن كلمة المرور؟ استخدم **Personal Access Token** بدل كلمة المرور العادية:
> GitHub ← Settings ← Developer settings ← Personal access tokens ← Generate (اختر `repo` صلاحية).
> أو استخدم SSH: `git remote add origin git@github.com:اسم-حسابك/hamd.git`

> ملاحظة: `db/custom.db` وملفات `.env` مستبعدة من Git عبر `.gitignore` — لن تُرفع
> أبداً، وهذا مقصود: قاعدة البيانات والأسرار لا تُخزَّن في المستودع.

---

## الجزء الثاني: اختيار الاستضافة

> ⚠️ **تحذير مهم:** التطبيق يعمل على **PostgreSQL ≥ 14**. اختر استضافة توفّر
> قاعدة PostgreSQL مُدارة أو ثبّتها على السيرفر بنفسك. **لا يعمل التطبيق على
> SQLite في الإنتاج**، ولا على أي استضافة بدون قاعدة بيانات حقيقية.

| الخيار | التكلفة | الصعوبة | الأنسب لـ |
|---|---|---|---|
| **VPS + PostgreSQL** (Hostinger / Contabo / DigitalOcean) | ~5–10$/شهر | ⭐⭐ متوسطة | الإنتاج الفعلي — موصى به ✅ |
| **Vercel + Neon** (PostgreSQL مُدار مجاني) | مجاني/20$ | ⭐ سهلة | مدعوم رسمياً — انظر `docs/DEPLOY-VERCEL.md` ✅ |
| Railway / Render | ~5$/شهر | ⭐ سهلة | التجربة السريعة (مع إضافة PostgreSQL) |

> التطبيق عديم الحالة (stateless): لا ملفات على القرص، كل البيانات في PostgreSQL —
> يعمل بنفس الخطوات على مثيل واحد أو N مثيلات خلف load balancer
> (انظر `docs/PRODUCTION-DEPLOYMENT.md`).

---

## الجزء الثالث: النشر على VPS (Ubuntu) — خطوة بخطوة

### 1) تجهيز السيرفر (مرة واحدة)

```bash
# Node.js 24 + Bun + PostgreSQL + nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx git
curl -fsSL https://bun.sh/install | bash
sudo npm i -g pm2
```

### 2) إنشاء قاعدة البيانات PostgreSQL

```bash
sudo -u postgres psql << 'EOF'
CREATE USER hamd WITH PASSWORD 'كلمة-مرور-قوية-عشوائية';
CREATE DATABASE hamd OWNER hamd;
EOF
```

> أو استخدم قاعدة PostgreSQL مُدارة (Neon / Supabase / RDS) واحتفظ برابط الاتصال.

### 3) سحب المشروع وتشغيله

```bash
cd /opt
sudo git clone https://github.com/اسم-حسابك/hamd.git
sudo chown -R $USER:$USER hamd
cd hamd
bun install

# ملف البيئة من القالب الرسمي:
cp .env.example .env

# عدّل .env:
#   DATABASE_URL="postgresql://hamd:كلمة-المرور@127.0.0.1:5432/hamd?connection_limit=10&pool_timeout=20&connect_timeout=10"
#   AUTH_SECRET="$(openssl rand -base64 32)"     # سرّ الجلسات — إلزامي (التطبيق يرفض الإقلاع بدونه)
#   TRUST_PROXY=true                              # لأن التطبيق خلف nginx

# تطبيق مخطط قاعدة البيانات — الأمر الوحيد المسموح في الإنتاج:
bun run db:deploy        # = prisma migrate deploy

# البناء والتشغيل
bun run build
pm2 start npm --name hamd -- start
pm2 save && pm2 startup   # تشغيل تلقائي بعد إعادة تشغيل السيرفر
```

التطبيق الآن يعمل على المنفذ **3000** داخلياً.

> 🚫 **ممنوع في الإنتاج:** `prisma db push` (أو `bun run db:push`) — يفرّق المخطط
> بدون سجل ترحيلات وقد يُسقط بيانات. الأمر الوحيد لتطبيق المخطط على الإنتاج هو
> `prisma migrate deploy`. لتعديل المخطط مستقبلاً: أنشئ الترحيل على قاعدة تطوير
> بـ `prisma migrate dev` ثم طبّقه على الإنتاج بـ `bun run db:deploy`
> (التفاصيل: `docs/DATABASE-MIGRATION.md` §Rules going forward).

### 4) الترحيل القديم (لمرة واحدة فقط — اختياري)

إن كانت لديك **نسخة خارجية** من أرشيف SQLite القديم (`db/custom.db` من نظام سابق)
وتريد استيراد بياناته مرة واحدة، فالسكربت الجاهز:

```bash
LEGACY_DATABASE_URL="file:/path/to/custom.db" \
DATABASE_URL="postgresql://hamd:...@127.0.0.1:5432/hamd" \
bun scripts/migrate-sqlite-to-postgres.ts
# يتحقق ذاتياً بعد النسخ (عدّ الصفوف + مجاميع المال والمخزون) ويخرج بخطأ عند أي اختلاف
```

الإجراء الكامل والتحقق: `docs/DATABASE-MIGRATION.md`.
ملف `db/custom.db` المحلي **أرشيف لا يُحذف ولا يُستخدم وقت التشغيل ولا يُرفع لـ Git** —
السيرفر لا يفتحه أبداً.

### 5) ربط الدومين + شهادة SSL

```bash
# أنشئ A Record في DNS يشير لـ IP السيرفر، ثم:
sudo tee /etc/nginx/sites-available/hamd << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # يحسب التطبيق حدّ محاولات الدخول لكل IP حقيقي (لا تجلب من العميل):
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/hamd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# شهادة SSL مجانية:
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

✅ تطبيقك الآن على `https://your-domain.com`

### 6) إنشاء حساب المدير — آمن بدون كلمات مرور افتراضية ⚠️
- عند أول تشغيل افتح `https://your-domain.com` واختر **إنشاء متجر جديد** (نقطة `/register`) —
  أول حساب تُنشئه يصبح **ADMIN** على مؤسستك الخاصة، ولا يوجد أي حساب افتراضي بأي كلمة مرور معروفة.
- **لا تستخدم كلمة مرور ضعيفة** — سيُخزّن الهاش بـ scrypt ويُصدر رمز جلسة موقّع.
- أضف بقية المستخدمين (مديرين/كاشير) من: الإعدادات ← المستخدمين.

> ملاحظة أمنية: أي كلمة مرور قديمة وردت في نسخ تجريبية سابقة لم تعد صالحة — لا يوجد حساب افتراضي في الإنتاج.

- تريد البدء بقاعدة **فارغة**؟ أنشئ قاعدة PostgreSQL جديدة فارغة (`CREATE DATABASE ...`)،
  اضبط `DATABASE_URL` عليها، نفّذ `bun run db:deploy`، ثم `pm2 restart hamd`.
  (لا تستخدم `prisma db push --accept-data-loss` في الإنتاج أبداً — استخدم `migrate deploy` فقط).

---

## الجزء الرابع: النشر على Vercel + Neon (PostgreSQL مُدار)

مدعوم رسمياً وباختبار كامل (Offline POS يعمل كما هو):

1. أنشئ قاعدة PostgreSQL مجانية على [neon.tech](https://neon.tech) وانسخ رابط **Pooled**.
2. ارفع المستودع إلى GitHub ثم اربطه بـ Vercel — **لا تغيّر إعدادات البناء**
   (سكربت البناء نفسه يعمل على المنصتين؛ خطوة نسخ standalone تتجاهل نفسها تلقائياً على Vercel).
3. أضف متغيري البيئة `DATABASE_URL` و `AUTH_SECRET` قبل النشر.

الدليل المصوّر خطوة بخطوة + نقل البيانات + قائمة تحقق ما قبل التسليم:
**`docs/DEPLOY-VERCEL.md`**

> Railway / Render: نفس مبدأ VPS — أضف **PostgreSQL add-on**، نفس متغيرات البيئة،
> وبناء/تشغيل مطابقين. لا يوجد أي إعداد يعتمد على ملفات محلية.

---

## متغيرات البيئة (مرجع سريع)

| المتغير | إلزامي؟ | القيمة |
|---|---|---|
| `DATABASE_URL` | ✅ إلزامي | `postgresql://user:pass@host:5432/hamd?connection_limit=10&pool_timeout=20&connect_timeout=10` |
| `AUTH_SECRET` | ✅ إلزامي في الإنتاج | `openssl rand -base64 32` (≥ 16 حرفاً — التطبيق يفشل في الإقلاع بدونه) |
| `TRUST_PROXY` | خلف proxy | `true` لتقييد محاولات الدخول لكل IP حقيقي |
| `PORT` | اختياري | الافتراضي 3000 |

القالب الرسمي: `.env.example`.

---

## بعد النشر مباشرة: تفعيل تطبيق الموبايل 📱

1. افتح `capacitor.config.ts` في المشروع وضع رابط موقعك:
   ```ts
   server: { url: 'https://your-domain.com', ... }
   ```
2. اتبع `MOBILE-APP.md` لبناء الـ APK — تطبيق الموبايل سيتصل بنفس السيرفر ونفس البيانات.

---

## التحديثات اللاحقة (نشر نسخة جديدة)

```bash
cd /opt/hamd
git pull
bun install
bun run db:deploy        # إن جاء مع النسخة ترحيل قاعدة بيانات جديد
bun run build
pm2 restart hamd
```

> خذ نسخة احتياطية قبل أي `db:deploy` (انظر أدناه) — الترحيلات forward-only
> والتراجع عنها يكون باستعادة النسخة الاحتياطية (`docs/DISASTER-RECOVERY.md`).

## النسخ الاحتياطي (يومي — PostgreSQL)

```bash
# نسخ منطقي (pg_dump) — يعمل مع أي PostgreSQL محلي أو مُدار:
crontab -e
# أضف السطر (نسخة يومية 3 فجراً مضغوطة وبتاريخ):
0 3 * * * pg_dump "postgresql://hamd:كلمة-المرور@127.0.0.1:5432/hamd" -Fc -f /root/backups/hamd-$(date +\%F).dump

# تحقّق أسبوعياً من أن النسخ قابلة للاستعادة فعلاً (نسخة غير قابلة للاستعادة = لا نسخة):
#   الإجراء الكامل والاختبار: scripts/pg-restore-verify.sh + docs/DISASTER-RECOVERY.md
```

> قاعدة: **النسخ الاحتياطي يُخزَّن خارج سيرفر التشغيل** (S3 / قرص خارجي / تخزين
> المزود المُدار) — نسخة على نفس السيرفر لا تنجيك من فقدان السيرفر.
> النسخ البارد (cold snapshot) للمجموعة المحلية: `scripts/pg-backup.sh`.

---

## أخطاء شائعة وحلولها

| المشكلة | الحل |
|---|---|
| `Error: Cannot find module '.next/standalone/server.js'` | نسيت `bun run build` قبل start |
| `P1001: Can't reach database server` | `DATABASE_URL` خاطئ أو PostgreSQL غير مشغّل: `sudo systemctl status postgresql` وجرّب الاتصال بـ `psql "$DATABASE_URL"` |
| `P1003: Database hamd does not exist` | أنشئ القاعدة (`CREATE DATABASE hamd OWNER hamd;`) ثم `bun run db:deploy` |
| التطبيق يرفض الإقلاع في الإنتاج (AUTH_SECRET) | لم تضبط `AUTH_SECRET` في `.env` — أضفه (≥ 16 حرفاً) وأعد التشغيل |
| حدّ محاولات الدخول يحسب كل المستخدمين كمصدر واحد | نسيت `TRUST_PROXY=true` أو nginx لا يمرر `X-Forwarded-For` |
| 502 Bad Gateway | `pm2 logs hamd` لرؤية الخطأ؛ غالباً المنفذ 3000 مشغول أو البناء فشل |
| الخطوط/الصور لا تظهر | تأكد أن نسخة `public` داخل `.next/standalone` (سكربت build ينسخها تلقائياً) |
