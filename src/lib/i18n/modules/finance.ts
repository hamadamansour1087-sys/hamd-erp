// Module dictionary for 'finance' (Receipt & Payment vouchers + Expenses hub) — owned exclusively by Task 3-b.
import type { LangDict } from '../root-dict'

export const financeDict: LangDict = {
  en: {
    // ---------- Page header / tabs ----------
    'fin.sub': 'Money in, money out — receipt & payment vouchers plus running expenses',
    'fin.tabReceipts': 'Receipt vouchers',
    'fin.tabPayments': 'Payment vouchers',
    'fin.tabExpenses': 'Expenses',

    // ---------- Stats ----------
    'fin.statRcvMonth': 'Collected this month',
    'fin.statRcvCount': 'Receipts count',
    'fin.statPayMonth': 'Paid out this month',
    'fin.statPayCount': 'Payments count',
    'fin.splitCash': 'Cash',
    'fin.splitOther': 'Other methods',
    'fin.statExpMonth': 'Expenses this month',
    'fin.statTopCat': 'Top category',
    'fin.statRowsPage': 'Records on page',
    'fin.noCategoryYet': '— none yet —',
    'fin.monthHint': 'Up to 200 most-recent records of this month',
    'fin.pageRowsHint': 'After current filters · page-scoped',

    // ---------- Split card ----------
    'fin.splitInTitle': 'Cash vs other methods (in)',
    'fin.splitOutTitle': 'Cash vs other methods (out)',

    // ---------- Toolbar ----------
    'fin.searchPh': 'Search by number or party…',
    'fin.partyCustomerAll': 'All customers',
    'fin.partySupplierAll': 'All suppliers',
    'fin.categoryAll': 'All categories',
    'fin.clearFilters': 'Clear filters',

    // ---------- Add buttons ----------
    'fin.addReceiptShort': 'New receipt voucher',
    'fin.addPaymentShort': 'New payment voucher',

    // ---------- Table ----------
    'fin.colNo': 'Number',
    'fin.colParty': 'Party',
    'fin.colInvoice': 'Linked invoice',
    'fin.standalone': 'Standalone',
    'fin.linkedChip': '#{n}',
    'fin.colAmount': 'Amount',
    'fin.colNote': 'Note',
    'fin.colCategory': 'Category',
    'fin.partyType.CUSTOMER': 'Customer',
    'fin.partyType.SUPPLIER': 'Supplier',
    'fin.partyType.OTHER': 'Other party',

    // ---------- Empty states ----------
    'fin.emptyReceipts': 'No receipt vouchers yet',
    'fin.emptyReceiptsHint': 'Record money you collect from customers — linked to a sales invoice or standalone.',
    'fin.emptyPayments': 'No payment vouchers yet',
    'fin.emptyPaymentsHint': 'Record money you pay to suppliers — linked to a purchase invoice or standalone.',
    'fin.emptyExpenses': 'No expenses recorded yet',
    'fin.emptyExpensesHint': 'Log rent, utilities, salaries and day-to-day spending to see true profit.',
    'fin.noResults': 'No rows match these filters',
    'fin.noResultsHint': 'Try clearing a filter or changing the search text.',

    // ---------- Voucher form ----------
    'fin.receiptTitle': 'New receipt voucher',
    'fin.receiptDesc': 'Money received — from an existing customer or any other party.',
    'fin.paymentTitle': 'New payment voucher',
    'fin.paymentDesc': 'Money paid out — to an existing supplier or any other party.',
    'fin.radioExisting': 'Existing party',
    'fin.radioOther': 'Another party',
    'fin.pickCustomer': 'Pick a customer…',
    'fin.pickSupplier': 'Pick a supplier…',
    'fin.otherNamePh': 'Party name (e.g. utility company)…',
    'fin.dueBadgeCustomer': 'Owes now',
    'fin.dueBadgeSupplier': 'We owe',
    'fin.linkInvoiceToggle': 'Link to an invoice',
    'fin.pickInvoicePh': 'Pick invoice…',
    'fin.invoiceOption': '#{n} · remaining {rem}',
    'fin.noOpenInvoices': 'No open invoices for this party',
    'fin.amountLabel': 'Amount',
    'fin.dateLabel': 'Date',
    'fin.dateEmptyHint': 'Leave empty for today',
    'fin.notePh': 'Short description (optional)…',
    'fin.errAmount': 'Enter an amount greater than zero',
    'fin.errParty': 'Pick a party or enter the other party’s name',
    'fin.saveVoucher': 'Save voucher',
    'fin.receiptDone': 'Receipt voucher #{n} recorded successfully',
    'fin.paymentDone': 'Payment voucher #{n} recorded successfully',
    'fin.donePhaseTitle': 'Voucher saved ✓',
    'fin.donePhaseHint': 'The voucher is numbered and searchable; print it now or close.',
    'fin.print80': 'Print · 80mm roll',
    'fin.printA4': 'Print · A4',
    'fin.mismatch':
      'Cannot link: this voucher type does not match the invoice type (receipt→sales, payment→purchase).',

    // ---------- Payables tip ----------
    'fin.payablesTipTitle': 'How payment vouchers work',
    'fin.payablesTip':
      'Every payment reduces the supplier’s due balance; if linked to a purchase invoice it also fills that invoice’s paid amount. Cash-in-hand decreases by each payout.',

    // ---------- Delete vouchers ----------
    'fin.delRcvTitle': 'Delete this receipt voucher?',
    'fin.delPmtTitle': 'Delete this payment voucher?',
    'fin.voucherDelWarn':
      'Deleting reverses its effect: if the voucher was applied to an invoice, that amount is removed from the invoice’s paid status. This cannot be undone.',
    'fin.voucherDeleted': 'Voucher deleted and its effect reversed',

    // ---------- Expenses ----------
    'fin.expenseTitle': 'Add expense',
    'fin.expenseDesc': 'Day-to-day operating costs outside of invoices.',
    'fin.expenseCatLabel': 'Category',
    'fin.expenseCatPh': 'e.g. rent, electricity…',
    'fin.expenseCatHint': 'Pick from previous categories or type a new one',
    'fin.expenseSaved': 'Expense recorded successfully',
    'fin.delExpTitle': 'Delete this expense?',
    'fin.delExpWarn': 'The record will be permanently removed from your books.',
    'fin.expenseDeleted': 'Expense deleted',
  },
  ar: {
    // ---------- ترويسة الصفحة / التبويبات ----------
    'fin.sub': 'كل ما يدخل ويخرج من مالك — سندات القبض والصرف والمصروفات الجارية',
    'fin.tabReceipts': 'سندات القبض',
    'fin.tabPayments': 'سندات الصرف',
    'fin.tabExpenses': 'المصروفات',

    // ---------- الإحصاءات ----------
    'fin.statRcvMonth': 'إجمالي التحصيلات هذا الشهر',
    'fin.statRcvCount': 'عدد سندات القبض',
    'fin.statPayMonth': 'إجمالي المدفوعات هذا الشهر',
    'fin.statPayCount': 'عدد سندات الصرف',
    'fin.splitCash': 'نقدي',
    'fin.splitOther': 'طرق أخرى',
    'fin.statExpMonth': 'مصروفات هذا الشهر',
    'fin.statTopCat': 'أعلى تصنيف',
    'fin.statRowsPage': 'السجلات في الصفحة',
    'fin.noCategoryYet': '— لا شيء بعد —',
    'fin.monthHint': 'حتى أحدث ٢٠٠ سجل خلال هذا الشهر',
    'fin.pageRowsHint': 'بعد الفلاتر الحالية · حسب الصفحة',

    // ---------- بطاقة التقسيم ----------
    'fin.splitInTitle': 'نقدي مقابل طرق أخرى (وارد)',
    'fin.splitOutTitle': 'نقدي مقابل طرق أخرى (صادر)',

    // ---------- شريط الأدوات ----------
    'fin.searchPh': 'ابحث برقم السند أو الطرف…',
    'fin.partyCustomerAll': 'جميع العملاء',
    'fin.partySupplierAll': 'جميع الموردين',
    'fin.categoryAll': 'كل التصنيفات',
    'fin.clearFilters': 'مسح الفلاتر',

    // ---------- أزرار الإضافة ----------
    'fin.addReceiptShort': 'سند قبض جديد',
    'fin.addPaymentShort': 'سند صرف جديد',

    // ---------- الجدول ----------
    'fin.colNo': 'الرقم',
    'fin.colParty': 'الطرف',
    'fin.colInvoice': 'الفاتورة المرتبطة',
    'fin.standalone': 'مستقلة',
    'fin.linkedChip': 'فاتورة #{n}',
    'fin.colAmount': 'المبلغ',
    'fin.colNote': 'ملاحظة',
    'fin.colCategory': 'التصنيف',
    'fin.partyType.CUSTOMER': 'عميل',
    'fin.partyType.SUPPLIER': 'مورد',
    'fin.partyType.OTHER': 'جهة أخرى',

    // ---------- حالات الفراغ ----------
    'fin.emptyReceipts': 'لا توجد سندات قبض بعد',
    'fin.emptyReceiptsHint': 'سجّل ما تحصّله من العملاء — مرتبطاً بفاتورة بيع أو سنداً مستقلاً.',
    'fin.emptyPayments': 'لا توجد سندات صرف بعد',
    'fin.emptyPaymentsHint': 'سجّل ما تدفعه للموردين — مرتبطاً بفاتورة مشتريات أو سنداً مستقلاً.',
    'fin.emptyExpenses': 'لا توجد مصروفات مسجلة بعد',
    'fin.emptyExpensesHint': 'سجّل الإيجار والكهرباء والرواتب ومصروفات اليوم لتعرف ربحك الحقيقي.',
    'fin.noResults': 'لا صفوف تطابق هذه الفلاتر',
    'fin.noResultsHint': 'جرّب مسح أحد الفلاتر أو تغيير كلمة البحث.',

    // ---------- نموذج السند ----------
    'fin.receiptTitle': 'سند قبض جديد',
    'fin.receiptDesc': 'مبلغ مستلم — من عميل قائم أو أي جهة أخرى.',
    'fin.paymentTitle': 'سند صرف جديد',
    'fin.paymentDesc': 'مبلغ مدفوع — لمورد قائم أو أي جهة أخرى.',
    'fin.radioExisting': 'طرف قائم',
    'fin.radioOther': 'جهة أخرى',
    'fin.pickCustomer': 'اختر عميلاً…',
    'fin.pickSupplier': 'اختر موردًا…',
    'fin.otherNamePh': 'اسم الجهة (مثال: شركة الكهرباء)…',
    'fin.dueBadgeCustomer': 'مدين الآن',
    'fin.dueBadgeSupplier': 'علينا له',
    'fin.linkInvoiceToggle': 'ربط بفاتورة',
    'fin.pickInvoicePh': 'اختر الفاتورة…',
    'fin.invoiceOption': '#{n} · متبقٍ {rem}',
    'fin.noOpenInvoices': 'لا توجد فواتير مفتوحة لهذا الطرف',
    'fin.amountLabel': 'المبلغ',
    'fin.dateLabel': 'التاريخ',
    'fin.dateEmptyHint': 'اتركه فارغاً لليوم',
    'fin.notePh': 'وصف مختصر (اختياري)…',
    'fin.errAmount': 'أدخل مبلغاً أكبر من صفر',
    'fin.errParty': 'اختر طرفاً أو أدخل اسم الجهة الأخرى',
    'fin.saveVoucher': 'حفظ السند',
    'fin.receiptDone': 'تم تسجيل سند القبض رقم {n}',
    'fin.paymentDone': 'تم تسجيل سند الصرف رقم {n}',
    'fin.donePhaseTitle': 'تم حفظ السند ✓',
    'fin.donePhaseHint': 'أُسند للسند رقم ويمكن البحث عنه؛ اطبعه الآن أو أغلق النافذة.',
    'fin.print80': 'طباعة · رول ٨٠ مم',
    'fin.printA4': 'طباعة · A4',
    'fin.mismatch': 'تعذّر الربط: نوع السند لا يطابق نوع الفاتورة (قبض↔بيع، صرف↔شراء).',

    // ---------- تنبيه المستحقات ----------
    'fin.payablesTipTitle': 'كيف تعمل سندات الصرف؟',
    'fin.payablesTip':
      'كل سند صرف يقلّل رصيد المورد المستحق، وإذا رُبط بفاتورة مشتريات أكمل المسدد فيها أيضاً. وينقص رصيد الصندوق بمقدار كل مصروف/صرف.',

    // ---------- حذف السندات ----------
    'fin.delRcvTitle': 'حذف سند القبض هذا؟',
    'fin.delPmtTitle': 'حذف سند الصرف هذا؟',
    'fin.voucherDelWarn':
      'الحذف يعكس أثر السند: إذا كان مرتبطاً بفاتورة سيُخصم مبلغه من المسدد في تلك الفاتورة. لا يمكن التراجع عن هذه الخطوة.',
    'fin.voucherDeleted': 'تم حذف السند وعكس أثره على الحسابات',

    // ---------- المصروفات ----------
    'fin.expenseTitle': 'إضافة مصروف',
    'fin.expenseDesc': 'تكاليف تشغيلية يومية خارج نطاق الفواتير.',
    'fin.expenseCatLabel': 'التصنيف',
    'fin.expenseCatPh': 'مثال: إيجار، كهرباء…',
    'fin.expenseCatHint': 'اختر من التصنيفات السابقة أو اكتب تصنيفاً جديداً',
    'fin.expenseSaved': 'تم تسجيل المصروف بنجاح',
    'fin.delExpTitle': 'حذف هذا المصروف؟',
    'fin.delExpWarn': 'سيُحذف السجل نهائياً من دفاترك.',
    'fin.expenseDeleted': 'تم حذف المصروف',
  },
}
