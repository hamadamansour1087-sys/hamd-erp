import type { CapacitorConfig } from '@capacitor/cli'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  إعدادات بناء تطبيق الموبايل (Android / iOS) — H.A.M.D
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  التطبيق الموبايل عبارة عن غلاف أصلي (Native Shell) حول نفس تطبيق الويب،
 *  يتصل بسيرفر Next.js المُستضاف (نفس الواجهة ونفس قاعدة البيانات).
 *
 *  ⚠️ خطوة إلزامية قبل بناء الـ APK:
 *     ضع رابط تطبيقك المنشور (HTTPS) في server.url بالأسفل،
 *     ثم شغّل:  bun run cap:sync   ثم ابنِ التطبيق (انظر MOBILE-APP.md).
 *
 *  ملاحظات:
 *   - appId: معرّف فريد للتطبيق على المتاجر (لا يمكن تغييره بعد النشر في Google Play).
 *   - webDir: مجلد placeholder فقط؛ لأن التطبيق يحمّل الواجهة من السيرفر مباشرة.
 *   - إن أردت إصدارًا تجريبيًا يشير لسيرفر محلي عبر HTTP ضع cleartext: true مؤقتًا (للاختبار فقط).
 */
const config: CapacitorConfig = {
  appId: 'app.hamd.manager',
  appName: 'H.A.M.D',
  webDir: 'cap-www',
  server: {
    // ⚠️ استبدل هذا الرابط برابط سيرفرك المنشور قبل بناء نسخة النشر
    url: 'https://your-domain.example.com',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f7fdfa',
  },
  ios: {
    contentInset: 'always',
  },
}

export default config
