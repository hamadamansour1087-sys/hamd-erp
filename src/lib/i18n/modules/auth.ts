// Module dictionary for 'auth' — tenant lifecycle strings (approval/trial).
import type { LangDict } from '../root-dict'

export const authDict: LangDict = {
  en: {
    'auth.phone': 'Phone number',
    'auth.phoneHint': 'So we can call you to activate the account',
    'auth.registerHint': 'After you submit, our team reviews the request and activates your account — then your 14-day free trial starts.',
    'auth.pendingTitle': 'Request received successfully',
    'auth.pendingDesc': 'Your account is now under review by the H.A.M.D team. Once approved you will get a 14-day free trial — we will contact you on the number you provided.',
    'auth.pendingBack': 'Back to login',
    'auth.orgPending': 'Your account is under review by our team — you will be able to log in once it is approved.',
    'auth.orgSuspended': 'Your account has been suspended. Please contact H.A.M.D support.',
    'auth.orgTrialExpired': 'Your free trial has ended. Contact H.A.M.D to activate your account.',
    'toast.trialLimitProducts': 'Trial limit reached (50 products). Contact us to activate your account.',
    'toast.trialLimitInvoices': 'Trial limit reached (100 sales invoices). Contact us to activate your account.',
    'trial.bannerDays': 'Free trial — {days} days left',
    'trial.contactActivate': 'Contact us to activate',
  },
  ar: {
    'auth.phone': 'رقم الهاتف',
    'auth.phoneHint': 'لنتواصل معك لتفعيل الحساب',
    'auth.registerHint': 'بعد إرسال الطلب يراجعه فريق H.A.M.D ويفعّل حسابك — وتبدأ بعدها فترة التجربة المجانية ١٤ يومًا.',
    'auth.pendingTitle': 'تم استلام طلبك بنجاح',
    'auth.pendingDesc': 'حسابك الآن قيد المراجعة من فريق H.A.M.D. بعد الموافقة ستحصل على فترة تجريبية مجانية ١٤ يومًا — وسنتواصل معك على الرقم الذي أدخلته.',
    'auth.pendingBack': 'العودة لتسجيل الدخول',
    'auth.orgPending': 'حسابك قيد المراجعة من فريقنا — ستتمكن من الدخول بعد الموافقة عليه.',
    'auth.orgSuspended': 'تم إيقاف حسابك مؤقتًا. يرجى التواصل مع دعم H.A.M.D.',
    'auth.orgTrialExpired': 'انتهت فترتك التجريبية المجانية. تواصل مع H.A.M.D لتفعيل حسابك.',
    'toast.trialLimitProducts': 'وصلت لحد التجربة (٥٠ صنف). تواصل معنا لتفعيل حسابك.',
    'toast.trialLimitInvoices': 'وصلت لحد التجربة (١٠٠ فاتورة بيع). تواصل معنا لتفعيل حسابك.',
    'trial.bannerDays': 'فترة تجريبية — متبقٍ {days} يومًا',
    'trial.contactActivate': 'تواصل معنا للتفعيل',
  },
}
