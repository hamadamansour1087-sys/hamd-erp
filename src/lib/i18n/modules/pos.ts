// Module dictionary for 'pos' — owned exclusively by Task 3-a (PosSalesAgent).
import type { LangDict } from '../root-dict'

export const posDict: LangDict = {
  en: {
    // ---------- header & search ----------
    'pos.subtitle': 'Ring up sales in seconds',
    'pos.searchPh': 'Search product or scan barcode…',
    'pos.searchClear': 'Clear search',
    'pos.catAll': 'All',
    'pos.productImgAlt': '{name} image',
    'pos.outOfStock': 'Out',
    'pos.lowStock': 'Low',
    'pos.inStockAria': 'Available: {n}',

    // ---------- customer ----------
    'pos.customerLabel': 'Customer',
    'pos.pickCustomer': 'Choose customer…',
    'pos.custSearchPh': 'Search by name or phone…',
    'pos.walkInReset': 'Walk-in (cash)',
    'pos.noCustomers': 'No customers match your search',
    'pos.clearCustomer': 'Remove customer (back to walk-in)',

    // ---------- cart lines ----------
    'pos.cartTitle': 'Current sale',
    'pos.cartEmpty': 'Cart is empty',
    'pos.cartEmptyHint': 'Tap products or scan a barcode to start selling',
    'pos.removeItem': 'Remove {name}',
    'pos.qtyPlus': 'Increase quantity of {name}',
    'pos.qtyMinus': 'Decrease quantity of {name}',
    'pos.qtyInput': 'Quantity of {name}',
    'pos.lineTotal': 'Line total',

    // ---------- warehouse ----------
    'pos.warehouseLabel': 'Sell from warehouse',

    // ---------- totals ----------
    'pos.discPct': '{p}% off',
    'pos.taxPct': 'VAT ({p}%)',

    // ---------- payment ----------
    'pos.paidAtCheckout': 'Paid now',
    'pos.remainingInvoice': 'Remaining on invoice',
    'pos.changeBack': 'Change due to customer',
    'pos.quickCash': 'Quick cash',
    'pos.fullAmount': 'Full amount',

    // ---------- submit & states ----------
    'pos.checkout': 'Complete sale (F2)',
    'pos.submitting': 'Saving invoice…',
    'pos.errNoItems': 'Add at least one item to the cart first',
    'pos.offlineNoPrint': 'Printing is unavailable while offline',

    // ---------- success dialog ----------
    'pos.successTitle': 'Sale completed',
    'pos.savedOfflineTitle': 'Saved on this device',
    'pos.savedOfflineHint':
      'The invoice will sync automatically when you are back online — printing is disabled for queued invoices.',
    'pos.printA4': 'Print A4',
    'pos.printThermal80': 'Thermal 80mm',
    'pos.printThermal58': 'Thermal 58mm',
    'pos.printMoreSizes': 'More print sizes',
    'pos.newSale': 'New sale',
    'pos.viewInvoice': 'View invoice',

    // ---------- mobile cart bar ----------
    'pos.viewCart': 'View cart',
    'pos.barQty': '{n} {unit}',
  },
  ar: {
    // ---------- الترويسة والبحث ----------
    'pos.subtitle': 'أتمم عمليات البيع في ثوانٍ',
    'pos.searchPh': 'ابحث عن منتج أو امسح الباركود…',
    'pos.searchClear': 'مسح البحث',
    'pos.catAll': 'الكل',
    'pos.productImgAlt': 'صورة {name}',
    'pos.outOfStock': 'منتهي',
    'pos.lowStock': 'منخفض',
    'pos.inStockAria': 'المتاح: {n}',

    // ---------- العميل ----------
    'pos.customerLabel': 'العميل',
    'pos.pickCustomer': 'اختر عميلاً…',
    'pos.custSearchPh': 'بحث بالاسم أو الهاتف…',
    'pos.walkInReset': 'عميل نقدي',
    'pos.noCustomers': 'لا يوجد عميل مطابق للبحث',
    'pos.clearCustomer': 'إزالة العميل (العودة لنقدي)',

    // ---------- بنود السلة ----------
    'pos.cartTitle': 'عملية البيع الحالية',
    'pos.cartEmpty': 'السلة فارغة',
    'pos.cartEmptyHint': 'انقر على المنتجات أو امسح الباركود لبدء البيع',
    'pos.removeItem': 'حذف {name}',
    'pos.qtyPlus': 'زيادة كمية {name}',
    'pos.qtyMinus': 'إنقاص كمية {name}',
    'pos.qtyInput': 'كمية {name}',
    'pos.lineTotal': 'إجمالي السطر',

    // ---------- المخزن ----------
    'pos.warehouseLabel': 'البيع من مخزن',

    // ---------- الإجماليات ----------
    'pos.discPct': 'خصم {p}٪',
    'pos.taxPct': 'ض.ق.م ({p}٪)',

    // ---------- الدفع ----------
    'pos.paidAtCheckout': 'المدفوع الآن',
    'pos.remainingInvoice': 'المتبقي على الفاتورة',
    'pos.changeBack': 'الباقي للعميل',
    'pos.quickCash': 'فئات سريعة',
    'pos.fullAmount': 'كامل المبلغ',

    // ---------- الإتمام والحالات ----------
    'pos.checkout': 'إتمام البيع (F2)',
    'pos.submitting': 'جارٍ إنشاء الفاتورة…',
    'pos.errNoItems': 'أضف منتجاً واحداً على الأقل إلى السلة أولاً',
    'pos.offlineNoPrint': 'الطباعة غير متاحة في وضع عدم الاتصال',

    // ---------- نافذة النجاح ----------
    'pos.successTitle': 'تم إتمام البيع',
    'pos.savedOfflineTitle': 'حُفظ على هذا الجهاز',
    'pos.savedOfflineHint': 'سيتم إرسال الفاتورة تلقائياً عند عودة الاتصال — والطباعة معطّلة للفواتير المعلّقة.',
    'pos.printA4': 'طباعة A4',
    'pos.printThermal80': 'حرارية 80mm',
    'pos.printThermal58': 'حرارية 58mm',
    'pos.printMoreSizes': 'أحجام طباعة إضافية',
    'pos.newSale': 'فاتورة جديدة',
    'pos.viewInvoice': 'عرض الفاتورة',

    // ---------- شريط السلة للجوال ----------
    'pos.viewCart': 'فتح السلة',
    'pos.barQty': '{n} {unit}',
  },
}
