// Module dictionary for 'purchases' (Purchases screen) — owned exclusively by Task 3-b.
import type { LangDict } from '../root-dict'

export const purchasesDict: LangDict = {
  en: {
    // ---------- Page header ----------
    'purch.sub': 'Purchase invoices — stock intake, supplier dues and payment status',

    // ---------- Stats ----------
    'purch.statMonthTotal': 'Purchases this month',
    'purch.statMonthCount': 'Invoices this month',
    'purch.statUnpaid': 'Unpaid remainder',
    'purch.scopePageHint': 'Sum over the current filtered page only',
    'purch.monthHint': 'Most recent 200 invoices of the month',

    // ---------- Toolbar ----------
    'purch.searchPh': 'Search by number or supplier…',
    'purch.statusAll': 'All statuses',
    'purch.supplierAll': 'All suppliers',
    'purch.newInvoice': 'New purchase invoice',

    // ---------- Table columns ----------
    'purch.colNo': 'Number',
    'purch.colDate': 'Date',
    'purch.colSupplier': 'Supplier',
    'purch.colWarehouse': 'Warehouse',
    'purch.colItems': 'Items',
    'purch.colTotal': 'Total',
    'purch.colPaid': 'Paid',
    'purch.colRemain': 'Remaining',
    'purch.colStatus': 'Status',
    'purch.cashSupplierRow': 'Cash supplier',

    // ---------- Row actions ----------
    'purch.viewAria': 'View: PUR-{n}',
    'purch.payAria': 'Pay invoice PUR-{n}',
    'purch.cancelAria': 'Cancel invoice PUR-{n}',
    'purch.cancelChip': 'Cancel',

    // ---------- Empty / error ----------
    'purch.empty': 'No purchase invoices yet',
    'purch.emptyHint': 'Record your first purchase so the stock lands in your warehouse with full cost tracking.',
    'purch.noResults': 'No invoices match these filters',
    'purch.noResultsHint': 'Try clearing a filter or changing the search text.',

    // ---------- Create dialog ----------
    'purch.createTitle': 'New purchase invoice',
    'purch.createDesc':
      'Add items, adjust unit costs freely, then record how much was paid. Stock is updated instantly.',
    'purch.supplierLabel': 'Supplier',
    'purch.pickSupplier': 'Pick a supplier…',
    'purch.noSupplier': 'None (cash purchase)',
    'purch.quickAddBtn': 'Nothing fits? Quick-add',
    'purch.quickAddNamePh': 'Supplier name…',
    'purch.quickAddPhonePh': 'Phone (optional)',
    'purch.quickAddSave': 'Add supplier',
    'purch.quickAddNeedName': 'Enter the supplier name first',
    'purch.supplierAdded': 'Supplier added successfully',
    'purch.warehouseLabel': 'Warehouse',
    'purch.itemsTitle': 'Items',
    'purch.productSearchPh': 'Search products to add…',
    'purch.noProductsFound': 'No matching product',
    'purch.lineCost': 'Unit cost',
    'purch.lineQty': 'Qty',
    'purch.lineTotal': 'Line total',
    'purch.removeItem': 'Remove {name}',
    'purch.discountLabel': 'Discount (amount)',
    'purch.taxLabel': 'VAT %',
    'purch.taxPreview': 'Tax amount',
    'purch.grandTotal': 'Grand total',
    'purch.paymentTitle': 'Payment',
    'purch.paidAmountLabel': 'Amount paid now',
    'purch.fullPaidChip': 'Paid in full',
    'purch.creditChip': 'On credit',
    'purch.dueDateLabel': 'Due date',
    'purch.needItem': 'Add at least one item with a quantity greater than zero',
    'purch.badLine': 'Every line needs a quantity > 0 and a cost ≥ 0',
    'purch.createSubmit': 'Save purchase',
    'purch.created': 'Purchase invoice #{n} created successfully',
    'purch.warningsTitle': 'Saved with warnings',
    'purch.costPrefillHint': 'Unit costs default to each product’s latest known cost — edit them per line.',

    // ---------- Detail dialog ----------
    'purch.detailTitle': 'Purchase #{n}',
    'purch.itemsHeadName': 'Product',
    'purch.linkedVouchers': 'Linked payments',
    'purch.noVouchers': 'No payments recorded on this invoice yet',
    'purch.print80': 'Print · 80mm roll',
    'purch.printA4': 'Print · A4',

    // ---------- Pay dialog ----------
    'purch.payTitle': 'Pay purchase invoice',
    'purch.payDesc': 'Records a payment voucher and applies it directly into this invoice’s paid amount.',
    'purch.payRemainingInfo': 'Current remaining on this invoice',
    'purch.payDone': 'Payment voucher #{n} recorded',
    'purch.payAlreadyDone': 'This invoice is already fully paid',
    'purch.payChip': 'Pay',
    'purch.savePaymentShort': 'Record payment',

    // ---------- Cancel ----------
    'purch.cancelTitle': 'Cancel this purchase invoice?',
    'purch.cancelWarn':
      'The purchased quantities will be removed back out of "{wh}" stock via reversal movements, and the invoice becomes cancelled. Any payments stay recorded.',
    'purch.cancelConfirm': 'Yes, cancel it',
    'purch.cancelledToast': 'Invoice #{n} cancelled — purchased stock was removed',
  },
  ar: {
    // ---------- ترويسة الصفحة ----------
    'purch.sub': 'فواتير المشتريات — إدخال المخزون ومستحقات الموردين وحالة السداد',

    // ---------- الإحصاءات ----------
    'purch.statMonthTotal': 'مشتريات هذا الشهر',
    'purch.statMonthCount': 'عدد فواتير الشهر',
    'purch.statUnpaid': 'غير مسدد',
    'purch.scopePageHint': 'مجموع الصفحة الحالية المعروضة فقط بعد الفلترة',
    'purch.monthHint': 'أحدث ٢٠٠ فاتورة من الشهر',

    // ---------- شريط الأدوات ----------
    'purch.searchPh': 'ابحث برقم الفاتورة أو المورد…',
    'purch.statusAll': 'كل الحالات',
    'purch.supplierAll': 'كل الموردين',
    'purch.newInvoice': 'فاتورة شراء',

    // ---------- أعمدة الجدول ----------
    'purch.colNo': 'الرقم',
    'purch.colDate': 'التاريخ',
    'purch.colSupplier': 'المورد',
    'purch.colWarehouse': 'المخزن',
    'purch.colItems': 'العناصر',
    'purch.colTotal': 'الإجمالي',
    'purch.colPaid': 'المسدد',
    'purch.colRemain': 'المتبقي',
    'purch.colStatus': 'الحالة',
    'purch.cashSupplierRow': 'مورد نقدي',

    // ---------- إجراءات الصف ----------
    'purch.viewAria': 'عرض فاتورة PUR-{n}',
    'purch.payAria': 'سداد فاتورة PUR-{n}',
    'purch.cancelAria': 'إلغاء فاتورة PUR-{n}',
    'purch.cancelChip': 'إلغاء',

    // ---------- حالات الفراغ ----------
    'purch.empty': 'لا توجد فواتير مشتريات بعد',
    'purch.emptyHint': 'سجّل أول عملية شراء ليدخل المخزون إلى مخزنك مع متابعة التكاليف بدقة.',
    'purch.noResults': 'لا فواتير تطابق هذه الفلاتر',
    'purch.noResultsHint': 'جرّب مسح أحد الفلاتر أو تغيير كلمة البحث.',

    // ---------- حوار الإنشاء ----------
    'purch.createTitle': 'فاتورة شراء جديدة',
    'purch.createDesc':
      'أضف الأصناف وعدّل تكلفة الوحدة بحرية، ثم سجّل ما تم دفعه. يتحدّث المخزون فوراً.',
    'purch.supplierLabel': 'المورد',
    'purch.pickSupplier': 'اختر موردًا…',
    'purch.noSupplier': 'بدون (شراء نقدي)',
    'purch.quickAddBtn': 'لا يوجد؟ أضف سريعاً',
    'purch.quickAddNamePh': 'اسم المورد…',
    'purch.quickAddPhonePh': 'الهاتف (اختياري)',
    'purch.quickAddSave': 'إضافة المورد',
    'purch.quickAddNeedName': 'أدخل اسم المورد أولاً',
    'purch.supplierAdded': 'تمت إضافة المورد بنجاح',
    'purch.warehouseLabel': 'المخزن',
    'purch.itemsTitle': 'الأصناف',
    'purch.productSearchPh': 'ابحث عن صنف لإضافته…',
    'purch.noProductsFound': 'لا يوجد صنف مطابق',
    'purch.lineCost': 'تكلفة الوحدة',
    'purch.lineQty': 'الكمية',
    'purch.lineTotal': 'إجمالي السطر',
    'purch.removeItem': 'إزالة {name}',
    'purch.discountLabel': 'الخصم (قيمة)',
    'purch.taxLabel': 'نسبة الضريبة %',
    'purch.taxPreview': 'قيمة الضريبة',
    'purch.grandTotal': 'الإجمالي النهائي',
    'purch.paymentTitle': 'الدفع',
    'purch.paidAmountLabel': 'المبلغ المدفوع الآن',
    'purch.fullPaidChip': 'مدفوعة بالكامل',
    'purch.creditChip': 'آجل',
    'purch.dueDateLabel': 'تاريخ الاستحقاق',
    'purch.needItem': 'أضف صنفاً واحداً على الأقل بكمية أكبر من صفر',
    'purch.badLine': 'كل سطر يحتاج كمية > ٠ وتكلفة ≥ ٠',
    'purch.createSubmit': 'حفظ الفاتورة',
    'purch.created': 'تم إنشاء فاتورة الشراء رقم {n}',
    'purch.warningsTitle': 'تم الحفظ مع تنبيهات',
    'purch.costPrefillHint': 'تكلفة الوحدة تُملأ مسبقاً بآخر تكلفة معروفة للصنف، ويمكنك تعديلها لكل سطر.',

    // ---------- حوار التفاصيل ----------
    'purch.detailTitle': 'فاتورة شراء رقم {n}',
    'purch.itemsHeadName': 'الصنف',
    'purch.linkedVouchers': 'سندات الصرف المرتبطة',
    'purch.noVouchers': 'لا توجد مدفوعات مسجلة على هذه الفاتورة بعد',
    'purch.print80': 'طباعة · رول ٨٠ مم',
    'purch.printA4': 'طباعة · A4',

    // ---------- حوار السداد ----------
    'purch.payTitle': 'سداد فاتورة شراء',
    'purch.payDesc': 'يسجّل سند صرف ويُخصم مباشرة من المتبقي على هذه الفاتورة.',
    'purch.payRemainingInfo': 'المتبقي حالياً على هذه الفاتورة',
    'purch.payDone': 'تم تسجيل سند الصرف رقم {n}',
    'purch.payAlreadyDone': 'هذه الفاتورة مسددة بالكامل بالفعل',
    'purch.payChip': 'سداد',
    'purch.savePaymentShort': 'تسجيل السداد',

    // ---------- الإلغاء ----------
    'purch.cancelTitle': 'إلغاء فاتورة الشراء هذه؟',
    'purch.cancelWarn':
      'ستُخصم الكميات المشتراة من مخزون «{wh}» عبر قيود عكسية، وتتحول الفاتورة إلى ملغاة. تبقى المدفوعات المسجلة كما هي.',
    'purch.cancelConfirm': 'نعم، ألغِ الفاتورة',
    'purch.cancelledToast': 'تم إلغاء الفاتورة رقم {n} وخُصم المخزون المشترى',
  },
}
