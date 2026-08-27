# 🚀 دليل رفع H.A.M.D على GitHub والنشر على استضافة

---

## الجزء الأول: الرفع على GitHub

المستودع المحلي **جاهز بالكامل** (فرع `main` + كوميت أول نظيف). كل ما عليك:

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

---

## الجزء الثاني: اختيار الاستضافة

> ⚠️ **تحذير مهم:** التطبيق يستخدم قاعدة بيانات **SQLite** (ملف محلي سريع ومجاني).
> هذا مثالي على **VPS / Railway / Render / Fly.io**، لكن **لا يعمل على Vercel** (نظام ملفات مؤقت يُمسح مع كل نشر — بياناتك ستضيع!). إن أصررت على Vercel سيلزم ترحيل القاعدة لـ Turso/Postgres.

| الخيار | التكلفة | الصعوبة | الأنسب لـ |
|---|---|---|---|
| **VPS** (Hostinger / Contabo / DigitalOcean) | ~5$/شهر | ⭐⭐ متوسطة | الإنتاج الفعلي — موصى به ✅ |
| **Railway** | ~5$/شهر | ⭐ سهلة | التجربة السريعة |
| **Render** | مجاني/مدفوع | ⭐ سهلة | التجربة السريعة |
| Vercel | — | — | ❌ غير مناسب (انظر التحذير) |

---

## الجزء الثالث: النشر على VPS (Ubuntu) — خطوة بخطوة

### 1) تجهيز السيرفر (مرة واحدة)

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm i -g pm2
```

### 2) سحب المشروع وتشغيله

```bash
cd /opt
sudo git clone https://github.com/اسم-حسابك/hamd.git
sudo chown -R $USER:$USER hamd
cd hamd

# تثبيت الحزم + إعداد قاعدة البيانات
npm install
npx prisma generate

# ملف البيئة — المسار يُضبط تلقائياً على مجلد المشروع الحالي:
echo "DATABASE_URL=\"file:$(pwd)/db/custom.db\"" > .env
# سرّ الجلسات (إلزامي للأمان):
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env

# البناء والتشغيل
npm run build
pm2 start npm --name hamd -- start
pm2 save && pm2 startup   # تشغيل تلقائي بعد إعادة تشغيل السيرفر
```

التطبيق الآن يعمل على المنفذ **3000** داخلياً.

### 3) ربط الدومين + شهادة SSL

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

### 4) أول تسجيل دخول — مهم ⚠️
- المستخدم التجريبي: `admin@tijara.app` / كلمة المرور: `123456`
- **غيّر كلمة المرور فوراً** من الإعدادات ← المستخدمين، وأنشئ مستخدميك الحقيقيين.
- تريد البدء بقاعدة **فارغة** بدل البيانات التجريبية؟ أوقف التطبيق، احذف `db/custom.db`، نفّذ `npx prisma db push`، ثم `pm2 restart hamd`.

---

## الجزء الرابع: بديل سريع — Railway / Render

1. أنشئ مشروعاً جديداً من مستودع GitHub.
2. أضف **Volume** (قرص دائم) مُركّبًا على مجلد المشروع كي يبقى ملف `db/custom.db` محفوظاً.
3. إعدادات البناء والتشغيل:

| الإعداد | القيمة |
|---|---|
| Install | `npm install && npx prisma generate` |
| Build | `npm run build` |
| Start | `npm run start` |
| متغير `AUTH_SECRET` | قيمة عشوائية طويلة |

4. اربط الدومين من إعدادات المنصة (تضيف SSL تلقائياً).

---

## متغيرات البيئة (مرجع سريع)

| المتغير | إلزامي؟ | القيمة |
|---|---|---|
| `DATABASE_URL` | يُضبط تلقائياً بسكربت start | `file:<مسار-المشروع>/db/custom.db` |
| `AUTH_SECRET` | ✅ إلزامي في الإنتاج | `openssl rand -base64 32` |
| `PORT` | اختياري | الافتراضي 3000 |

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
npm install
npm run build
pm2 restart hamd
```

## النسخ الاحتياطي (يومي — كل البيانات في ملف واحد)

```bash
crontab -e
# أضف السطر (نسخة يومية 3 فجراً):
0 3 * * * cp /opt/hamd/db/custom.db /root/backups/custom-$(date +\%F).db
```

---

## أخطاء شائعة وحلولها

| المشكلة | الحل |
|---|---|
| `Error: Cannot find module '.next/standalone/server.js'` | نسيت `npm run build` قبل start |
| صفحة تفتح لكن البيانات لا تحفظ | تأكد من وجود مجلد `db/` وصلاحيات الكتابة `chown -R $USER db/` |
| الجلسة تُمسح بعد كل إعادة تشغيل | لم تضبط `AUTH_SECRET` في `.env` — أضفه وأعد التشغيل |
| 502 Bad Gateway | `pm2 logs hamd` لرؤية الخطأ؛ غالباً المنفذ 3000 مشغول أو البناء فشل |
| الخطوط/الصور لا تظهر | تأكد أن نسخة `public` داخل `.next/standalone` (سكربت build ينسخها تلقائياً) |
