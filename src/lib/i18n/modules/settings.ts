// Module dictionary for 'settings' — owned exclusively by Task 5-c (SettingsAuthAgent).
// All keys are namespaced under `set.*`. A few auth-flow polish strings live here too
// (the auth module dict is frozen; this task's ownership allows set.* only).
import type { LangDict } from '../root-dict'

export const settingsDict: LangDict = {
  en: {
    // ---------- Header ----------
    'set.subtitle': 'Business profile, appearance, team, and backups — everything in one place',

    // ---------- Tabs ----------
    'set.tab.org': 'Business profile',
    'set.tab.appearance': 'Appearance',
    'set.tab.users': 'Users',
    'set.tab.data': 'Data & backup',
    'set.tab.about': 'About',

    // ---------- Shared lock / role notes ----------
    'set.lockTitle': 'Limited access',
    'set.lockHintCashier': 'You can view your business info here — editing it needs admin or manager rights. Ask an administrator to make changes.',
    'set.lockHintManager': 'Team management is available to administrators only.',

    // ---------- TAB 1 · Business profile ----------
    'set.orgSub': 'This identity appears on invoices, reports, and receipts',
    'set.nameField': 'Business name',
    'set.namePlaceholder': 'Supermarket Al-Nour',
    'set.currencyLabel': 'Currency',
    'set.taxLabel': 'Tax rate (%)',
    'set.taxHint': 'Applied to invoices by default — e.g. Egypt 14% · Saudi Arabia 15% · UAE 5%',
    'set.taxInvalid': 'Enter a tax rate between 0 and 100',
    'set.nameRequired': 'Enter the business name',
    'set.logoLabel': 'Logo',
    'set.logoHint': 'PNG or JPG — compressed automatically to 160px height for fast loading',
    'set.uploadLogo': 'Upload logo',
    'set.replaceLogo': 'Replace',
    'set.removeLogo': 'Remove',
    'set.invalidImage': 'Choose a valid image file',
    'set.orgSaved': 'Business profile saved — currency & tax applied instantly',

    // ---------- TAB 2 · Appearance ----------
    'set.appearanceSub': 'Pick a mode and accent color — the whole app reacts live',
    'set.themeMode': 'Day / night mode',
    'set.theme.system': 'System',
    'set.preview': 'Live preview',
    'set.previewBadge': 'Offer',
    'set.previewPrimary': 'Primary button',
    'set.previewSecondary': 'Secondary',
    'set.previewInputPh': 'Type something…',
    'set.appliedAccent': 'Active color',

    // ---------- TAB 3 · Users ----------
    'set.usersSub': 'Team accounts, roles, and sign-in access',
    'set.addUser': 'Add user',
    'set.editUser': 'Edit user',
    'set.role': 'Role',
    'set.colEmail': 'Email',
    'set.newPassword': 'New password',
    'set.pwMin': 'At least 6 characters',
    'set.youBadge': 'You',
    'set.active': 'Active',
    'set.inactive': 'Inactive',
    'set.toggleActiveAria': 'Activate or deactivate {name}',
    'set.addUserIntro': 'They will sign in with this email and password.',
    'set.fillAll': 'Fill all fields — password must be at least 6 characters',
    'set.userSaved': 'User updated successfully',
    'set.userAdded': 'User added — they can sign in now',
    'set.noUsersYet': 'No teammates yet',
    'set.errSelfDeactivate': "You can't deactivate your own account",
    'set.errSelfDemote': "You can't change your own role",
    'set.weakPassword': 'Password must be at least 6 characters',

    // ---------- Auth polish (auth dict frozen) ----------
    'set.rememberMe': 'Remember me',
    'set.showPassword': 'Show password',
    'set.hidePassword': 'Hide password',
    'set.copyEmail': 'Copy email',
    'set.copyPassword': 'Copy password',
    'set.invalidEmail': 'Please enter a valid email address',
    'set.registeringSplash': 'Submitting your request…',

    // ---------- TAB 4 · Data & backup ----------
    'set.dataSub': 'Backups, temporary storage, and maintenance tools',
    'set.backupTitle': 'Backup',
    'set.backupDesc': 'Downloads a complete JSON snapshot of your business: products, invoices, vouchers, expenses, stock movements and more. The file is saved straight to your device.',
    'set.dangerZone': 'Maintenance & danger zone',
    'set.cacheTitle': 'Temporary local storage',
    'set.cacheDesc': 'Clears offline-cached copies kept on this device only — your real data on the server is never touched. The page will reload afterwards.',
    'set.clearCache': 'Clear cached temporary storage',
    'set.cacheCleared': 'Cached storage cleared — reloading…',
    'set.queueTitle': 'Pending sync queue',
    'set.queueEmpty': 'Everything is synced — no pending changes ✨',
    'set.clearQueue': 'Clear pending queue',
    'set.queueConfirmTitle': 'Clear pending sync queue?',
    'set.queueClearWarn': 'This permanently discards {n} local change(s) that were not sent to the server yet — offline edits will be lost. Make sure you are back online, or that these changes are no longer needed.',
    'set.queueCleared': 'Pending queue cleared — reloading…',
    'set.resetInfoTitle': 'Full account reset',
    'set.resetInfo': 'A permanent wipe of all business data is not self-service in this version. Contact support with proof of ownership and we will securely reset your workspace.',

    // ---------- TAB 5 · About + PWA install ----------
    'set.aboutSub': 'Version, tutorial videos, and installation',
    'set.videos.title': 'Tutorial videos',
    'set.videos.sub': 'Short lessons — clear Arabic text with calm background music',
    'set.videos.play': 'Play',
    'set.installTitle': 'Install H.A.M.D on your device',
    'set.installDesc': 'Use H.A.M.D as its own app: home-screen icon, dedicated window, and full offline support.',
    'set.installed': 'App installed successfully 🎉',
    'set.installDismissed': 'No problem — you can install anytime from Settings → About.',
  },
  ar: {
    // ---------- الترويسة ----------
    'set.subtitle': 'بيانات النشاط والمظهر والفريق والنسخ الاحتياطي — كل شيء في مكان واحد',

    // ---------- التبويبات ----------
    'set.tab.org': 'بيانات النشاط',
    'set.tab.appearance': 'المظهر',
    'set.tab.users': 'المستخدمون',
    'set.tab.data': 'البيانات والنسخ الاحتياطي',
    'set.tab.about': 'حول التطبيق',

    // ---------- ملاحظات الصلاحيات ----------
    'set.lockTitle': 'صلاحية محدودة',
    'set.lockHintCashier': 'يمكنك الاطلاع على بيانات نشاطك من هنا — التعديل يتطلب صلاحية مدير النظام أو المدير. تواصل مع الإدارة لإجراء التغييرات.',
    'set.lockHintManager': 'إدارة المستخدمين متاحة لمدير النظام فقط.',

    // ---------- تبويب 1 · بيانات النشاط ----------
    'set.orgSub': 'تظهر هذه البيانات على الفواتير والتقارير وسندات القبض',
    'set.nameField': 'اسم النشاط',
    'set.namePlaceholder': 'سوبر ماركت النور',
    'set.currencyLabel': 'العملة',
    'set.taxLabel': 'نسبة الضريبة ٪',
    'set.taxHint': 'تُطبَّق على الفواتير تلقائياً — مثال: مصر ١٤٪ · السعودية ١٥٪ · الإمارات ٥٪',
    'set.taxInvalid': 'أدخل نسبة ضريبة بين ٠ و ١٠٠',
    'set.nameRequired': 'أدخل اسم النشاط',
    'set.logoLabel': 'الشعار',
    'set.logoHint': 'PNG أو JPG — يُضغط تلقائياً إلى ارتفاع ١٦٠ بكسل لتحميل أسرع',
    'set.uploadLogo': 'رفع شعار',
    'set.replaceLogo': 'تغيير',
    'set.removeLogo': 'إزالة',
    'set.invalidImage': 'اختر ملف صورة صالحاً',
    'set.orgSaved': 'تم حفظ بيانات النشاط — طُبِّقت العملة والضريبة فوراً',

    // ---------- تبويب 2 · المظهر ----------
    'set.appearanceSub': 'اختر الوضع ولون الثيم — يتغير التطبيق كله فوراً أثناء الاختيار',
    'set.themeMode': 'الوضع الليلي',
    'set.theme.system': 'حسب النظام',
    'set.preview': 'معاينة مباشرة',
    'set.previewBadge': 'عرض خاص',
    'set.previewPrimary': 'زر رئيسي',
    'set.previewSecondary': 'ثانوي',
    'set.previewInputPh': 'اكتب شيئاً…',
    'set.appliedAccent': 'اللون الحالي',

    // ---------- تبويب 3 · المستخدمون ----------
    'set.usersSub': 'حسابات الفريق والأدوار وصلاحيات الدخول',
    'set.addUser': 'إضافة مستخدم',
    'set.editUser': 'تعديل مستخدم',
    'set.role': 'الدور',
    'set.colEmail': 'البريد الإلكتروني',
    'set.newPassword': 'كلمة مرور جديدة',
    'set.pwMin': '٦ أحرف على الأقل',
    'set.youBadge': 'أنت',
    'set.active': 'نشط',
    'set.inactive': 'موقوف',
    'set.toggleActiveAria': 'تفعيل أو إيقاف حساب {name}',
    'set.addUserIntro': 'سيستخدم هذا البريد وكلمة المرور لتسجيل الدخول.',
    'set.fillAll': 'املأ جميع الحقول — كلمة المرور ٦ أحرف على الأقل',
    'set.userSaved': 'تم تحديث بيانات المستخدم',
    'set.userAdded': 'تمت إضافة المستخدم — يمكنه تسجيل الدخول الآن',
    'set.noUsersYet': 'لا يوجد أعضاء بعد',
    'set.errSelfDeactivate': 'لا يمكنك إيقاف حسابك الخاص',
    'set.errSelfDemote': 'لا يمكنك تغيير دورك الخاص',
    'set.weakPassword': 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل',

    // ---------- تحسينات المصادقة (قاموس auth مجمّد) ----------
    'set.rememberMe': 'تذكرني',
    'set.showPassword': 'إظهار كلمة المرور',
    'set.hidePassword': 'إخفاء كلمة المرور',
    'set.copyEmail': 'نسخ البريد الإلكتروني',
    'set.copyPassword': 'نسخ كلمة المرور',
    'set.invalidEmail': 'أدخل بريداً إلكترونياً صحيحاً',
    'set.registeringSplash': 'جارٍ إرسال طلب التسجيل…',

    // ---------- تبويب 4 · البيانات والنسخ الاحتياطي ----------
    'set.dataSub': 'النسخ الاحتياطي والتخزين المؤقت وأدوات الصيانة',
    'set.backupTitle': 'النسخ الاحتياطي',
    'set.backupDesc': 'تنزيل نسخة JSON كاملة من بيانات نشاطك: المنتجات والفواتير والسندات والمصروفات وحركات المخزون والمزيد. يُحفظ الملف مباشرة على جهازك.',
    'set.dangerZone': 'الصيانة ومنطقة الخطر',
    'set.cacheTitle': 'التخزين المحلي المؤقت',
    'set.cacheDesc': 'يمسح النسخ المؤقتة المحفوظة على هذا الجهاز فقط — بياناتك الحقيقية على السيرفر لا تتأثر أبداً. ستُعاد تحميل الصفحة بعد ذلك.',
    'set.clearCache': 'مسح التخزين المحلي المؤقت',
    'set.cacheCleared': 'تم مسح التخزين المؤقت — جارٍ إعادة التحميل…',
    'set.queueTitle': 'الطابور المعلّق للمزامنة',
    'set.queueEmpty': 'كل شيء متزامن — لا تغييرات معلّقة ✨',
    'set.clearQueue': 'مسح الطابور المعلّق',
    'set.queueConfirmTitle': 'مسح طابور المزامنة المعلّق؟',
    'set.queueClearWarn': 'سيتم تجاهل {n} تغييراً محلياً لم يُرسَل إلى السيرفر بعد بشكل نهائي — التعديلات التي أجريتها بدون إنترنت ستُفقد. تأكد أن الاتصال عاد، أو أن هذه التغييرات لم تعد مطلوبة.',
    'set.queueCleared': 'تم مسح الطابور المعلّق — جارٍ إعادة التحميل…',
    'set.resetInfoTitle': 'إعادة تعيين كاملة للحساب',
    'set.resetInfo': 'الحذف النهائي الكامل لبيانات النشاط غير متاح ذاتياً في هذه النسخة. تواصل مع فريق الدعم مع إثبات الملكية وسنعيد تهيئة مساحة عملك بأمان.',

    // ---------- تبويب 5 · حول + تثبيت PWA ----------
    'set.aboutSub': 'الإصدار والفيديوهات التعليمية والتثبيت',
    'set.videos.title': 'فيديوهات تعليمية',
    'set.videos.sub': 'دروس قصيرة — نص عربي واضح مع موسيقى خلفية هادئة',
    'set.videos.play': 'تشغيل',
    'set.installTitle': 'ثبّت H.A.M.D على جهازك',
    'set.installDesc': 'استخدم H.A.M.D كتطبيق مستقل: أيقونة على الشاشة الرئيسية ونافذة خاصة ودعم كامل للعمل بدون إنترنت.',
    'set.installed': 'تم تثبيت التطبيق بنجاح 🎉',
    'set.installDismissed': 'لا مشكلة — يمكنك التثبيت في أي وقت من الإعدادات ← حول التطبيق.',
  },
}
