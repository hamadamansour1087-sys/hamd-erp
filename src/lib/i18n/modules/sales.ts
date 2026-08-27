// Module dictionary for 'sales' — owned exclusively by Task 3-a (PosSalesAgent).
import type { LangDict } from '../root-dict'

export const salesDict: LangDict = {
  en: {
    // ---------- header & stats ----------
    'sales.subtitle': 'Track, settle and print your sales invoices',
    'sales.statToday': "Today's sales",
    'sales.statTodayCount': '{n} invoices',
    'sales.statPageTotal': 'Page total',
    'sales.statUnsettled': 'Unsettled (this page)',
    'sales.readonlyHint': 'Cashier access is view-only',

    // ---------- filters ----------
    'sales.searchPh': 'Invoice number or customer name / phone…',
    'sales.statusAll': 'All statuses',
    'sales.customerAll': 'All customers',
    'sales.clearSearch': 'Clear search',
    'sales.filtersAria': 'Filters',

    // ---------- table ----------
    'sales.colNumber': 'No.',
    'sales.colItems': 'Items',
    'sales.openDetails': 'Open invoice {n}',
    'sales.empty': 'No invoices match',
    'sales.emptyHint': 'Try adjusting search or filters — or make a sale from the POS screen.',
    'sales.goToPos': 'Open POS',

    // ---------- detail sheet ----------
    'sales.invBadge': 'Invoice INV-{n}',
    'sales.itemsTitle': 'Line items',
    'sales.paymentsTitle': 'Payments on this invoice',
    'sales.noPayments': 'No payments recorded yet',
    'sales.warehouseChip': 'Warehouse: {name}',
    'sales.printA4': 'Print A4',
    'sales.printThermal80': 'Thermal 80mm',
    'sales.printThermal58': 'Thermal 58mm',
    'sales.printMoreSizes': 'More print sizes',
    'sales.offlineNoPrint': 'Printing is unavailable while offline',

    // ---------- payment dialog ----------
    'sales.payAction': 'Add payment',
    'sales.payTitle': 'New payment on invoice {n}',
    'sales.payDesc': 'Receipt voucher is numbered automatically and the invoice status updates instantly.',
    'sales.amountRequired': 'Enter an amount greater than zero',
    'sales.overPay': 'Amount exceeds the remaining balance on this invoice',
    'sales.dateHint': 'Leave empty to use today',
    'sales.paymentDone': 'Receipt voucher #{n} recorded',

    // ---------- cancel ----------
    'sales.cancelAction': 'Cancel invoice',
    'sales.cancelTitle': 'Cancel invoice {n}?',
    'sales.cancelDesc':
      'Quantities will be returned to stock automatically and the invoice stops counting in reports. This cannot be undone.',
    'sales.cancelYes': 'Yes, cancel & restock',
    'sales.cancelDone': 'Invoice {n} cancelled',

    // ---------- misc ----------
    'sales.soldBeyondStock': 'Sold beyond available stock: {names}',
    'sales.itemsLine': '{n} × {price}',
    'sales.loadError': 'Could not load invoices — check your connection.',
    'sales.prevPage': 'Previous page',
    'sales.nextPage': 'Next page',
  },
  ar: {
    // ---------- الترويسة والإحصاءات ----------
    'sales.subtitle': 'تابع فواتير البيع وسدّدها واطبعها',
    'sales.statToday': 'مبيعات اليوم',
    'sales.statTodayCount': '{n} فاتورة',
    'sales.statPageTotal': 'إجمالي الصفحة',
    'sales.statUnsettled': 'غير مسددة (بالصفحة)',
    'sales.readonlyHint': 'صلاحية الكاشير للعرض فقط',

    // ---------- الفلاتر ----------
    'sales.searchPh': 'رقم الفاتورة أو اسم/هاتف العميل…',
    'sales.statusAll': 'كل الحالات',
    'sales.customerAll': 'كل العملاء',
    'sales.clearSearch': 'مسح البحث',
    'sales.filtersAria': 'الفلاتر',

    // ---------- الجدول ----------
    'sales.colNumber': 'الرقم',
    'sales.colItems': 'العناصر',
    'sales.openDetails': 'عرض تفاصيل الفاتورة رقم {n}',
    'sales.empty': 'لا توجد فواتير مطابقة',
    'sales.emptyHint': 'جرّب تعديل البحث أو الفلاتر — أو أتمم عملية بيع من نقطة البيع.',
    'sales.goToPos': 'فتح نقطة البيع',

    // ---------- ورقة التفاصيل ----------
    'sales.invBadge': 'فاتورة INV-{n}',
    'sales.itemsTitle': 'بنود الفاتورة',
    'sales.paymentsTitle': 'الدفعات المسجلة على الفاتورة',
    'sales.noPayments': 'لا توجد دفعات مسجلة بعد',
    'sales.warehouseChip': 'المخزن: {name}',
    'sales.printA4': 'طباعة A4',
    'sales.printThermal80': 'حرارية 80mm',
    'sales.printThermal58': 'حرارية 58mm',
    'sales.printMoreSizes': 'أحجام طباعة إضافية',
    'sales.offlineNoPrint': 'الطباعة غير متاحة في وضع عدم الاتصال',

    // ---------- نافذة الدفع ----------
    'sales.payAction': 'تسجيل دفعة',
    'sales.payTitle': 'دفعة جديدة على الفاتورة {n}',
    'sales.payDesc': 'يُرقَّم سند القبض تلقائياً وتتحدث حالة الفاتورة فوراً.',
    'sales.amountRequired': 'أدخل مبلغاً أكبر من صفر',
    'sales.overPay': 'المبلغ أكبر من المتبقي على هذه الفاتورة',
    'sales.dateHint': 'اتركه فارغاً ليُسجَّل بتاريخ اليوم',
    'sales.paymentDone': 'تم تسجيل سند القبض رقم {n}',

    // ---------- الإلغاء ----------
    'sales.cancelAction': 'إلغاء الفاتورة',
    'sales.cancelTitle': 'إلغاء الفاتورة {n}؟',
    'sales.cancelDesc':
      'ستُعاد الكميات إلى المخزون تلقائياً، وتتوقف الفاتورة عن الاحتساب في التقارير. لا يمكن التراجع عن هذا الإجراء.',
    'sales.cancelYes': 'نعم، إلغاء وارجاع الكميات',
    'sales.cancelDone': 'تم إلغاء الفاتورة {n}',

    // ---------- متنوع ----------
    'sales.soldBeyondStock': 'تم البيع بأكثر من الرصيد المتاح: {names}',
    'sales.itemsLine': '{n} × {price}',
    'sales.loadError': 'تعذّر تحميل الفواتير — تحقق من الاتصال.',
    'sales.prevPage': 'الصفحة السابقة',
    'sales.nextPage': 'الصفحة التالية',
  },
}
