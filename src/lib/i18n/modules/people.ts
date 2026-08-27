// Module dictionary for 'people' (Customers + Suppliers screens) — owned exclusively by Task 2-b.
import type { LangDict } from '../root-dict'

export const peopleDict: LangDict = {
  en: {
    // ---------- Page headers / subtitles ----------
    'people.customersSub': 'Your customer directory — balances, statements and receipts',
    'people.suppliersSub': 'Your supplier directory — dues, statements and payments',

    // ---------- Stat cards ----------
    'people.statTotalCustomers': 'Total customers',
    'people.statTotalSuppliers': 'Total suppliers',
    'people.statReceivables': 'Total receivables',
    'people.statPayables': 'Total payables',
    'people.statDebtors': 'Customers in debt',
    'people.statCreditors': 'Suppliers with dues',

    // ---------- Toolbar ----------
    'people.searchCustomers': 'Search by name or phone…',
    'people.searchSuppliers': 'Search by name or phone…',
    'people.addCustomer': 'Add customer',
    'people.addSupplier': 'Add supplier',
    'people.editCustomer': 'Edit customer',
    'people.editSupplier': 'Edit supplier',
    'people.deleteCustomerTitle': 'Delete this customer?',
    'people.deleteSupplierTitle': 'Delete this supplier?',

    // ---------- Table ----------
    'people.colBalance': 'Current balance',
    'people.legendOwedYou':
      'Positive = the customer owes you · Negative = credit in their favor',
    'people.legendYouOwe':
      'Positive = you owe the supplier · Negative = credit in your favor',

    // ---------- Balance chips ----------
    'people.chipOwes': 'In debt',
    'people.chipCredit': 'Credit balance',
    'people.chipSettledCust': 'Settled up',
    'people.chipWeOwe': 'We owe them',
    'people.chipSupplierCredit': 'Credit for us',
    'people.chipSettledSupp': 'Fully paid',

    // ---------- Empty states ----------
    'people.emptyCustomers': 'No customers yet',
    'people.emptyCustomersHint': 'Add your first customer to start tracking receivables and statements.',
    'people.emptySuppliers': 'No suppliers yet',
    'people.emptySuppliersHint': 'Add your first supplier to start tracking payables and purchase invoices.',
    'people.noResults': 'No matching results',
    'people.noResultsHint': 'Try a different name or phone number.',

    // ---------- Add/Edit form ----------
    'people.openingHint':
      'The balance this party starts with before any invoices. Positive = they owe you (customer) or you owe them (supplier). You can put 0 for now.',
    'people.notesPh': 'Optional notes about this party…',
    'people.custSaved': 'Customer saved successfully',
    'people.suppSaved': 'Supplier saved successfully',

    // ---------- Delete ----------
    'people.deleteBlockedCust': "Can't delete: this customer is linked to existing invoices",
    'people.deleteBlockedSupp': "Can't delete: this supplier is linked to existing purchase invoices",

    // ---------- Statement sheet ----------
    'people.statementTitle': 'Account statement',
    'people.netBalance': 'Net due',
    'people.statementFormulaCust':
      'Opening balance + unpaid invoice dues − standalone receipts',
    'people.statementFormulaSupp':
      'Opening balance + unpaid purchase dues − standalone payments',
    'people.currentDueCust': 'Current debt on this customer',
    'people.currentDueSupp': 'What we currently owe this supplier',
    'people.inFavorCust': 'Credit in the customer’s favor',
    'people.inFavorSupp': 'This supplier is settled — credit on our side',
    'people.recentInvoicesCust': 'Recent sales invoices',
    'people.recentInvoicesSupp': 'Recent purchase invoices',
    'people.noInvoices': 'No invoices recorded on this account yet',
    'people.standaloneReceiptsLine': 'Standalone receipts (not linked to an invoice)',
    'people.standalonePaymentsLine': 'Standalone payments (not linked to an invoice)',
    'people.colInvoice': 'Invoice',
    'people.recordVoucherHere': 'Record a voucher',

    // ---------- Voucher dialog ----------
    'people.receiptTitle': 'Receipt voucher',
    'people.paymentTitle': 'Payment voucher',
    'people.receiptDesc': 'Money received from the party below, independent of any invoice.',
    'people.paymentDesc': 'Money paid to the party below, independent of any invoice.',
    'people.amountRequired': 'Enter an amount greater than zero',
    'people.voucherDatePh': 'Leave empty for today',
    'people.voucherNotePh': 'Short description of the voucher (optional)',
    'people.clearDate': 'Clear date',
    'people.recordVoucher': 'Record voucher',
    'people.receiptDone': 'Receipt voucher #{n} recorded successfully',
    'people.paymentDone': 'Payment voucher #{n} recorded successfully',
  },
  ar: {
    // ---------- ترويسة الصفحة ----------
    'people.customersSub': 'دليل عملائك — الأرصدة وكشوف الحسابات وسندات القبض',
    'people.suppliersSub': 'دليل مورديك — المستحقات وكشوف الحسابات وسندات الصرف',

    // ---------- بطاقات الإحصاءات ----------
    'people.statTotalCustomers': 'إجمالي العملاء',
    'people.statTotalSuppliers': 'إجمالي الموردين',
    'people.statReceivables': 'إجمالي المديونيات',
    'people.statPayables': 'إجمالي المستحقات للموردين',
    'people.statDebtors': 'عدد المدينين',
    'people.statCreditors': 'موردون لهم مستحقات',

    // ---------- شريط الأدوات ----------
    'people.searchCustomers': 'ابحث بالاسم أو رقم الهاتف…',
    'people.searchSuppliers': 'ابحث بالاسم أو رقم الهاتف…',
    'people.addCustomer': 'إضافة عميل',
    'people.addSupplier': 'إضافة مورد',
    'people.editCustomer': 'تعديل بيانات العميل',
    'people.editSupplier': 'تعديل بيانات المورد',
    'people.deleteCustomerTitle': 'حذف هذا العميل؟',
    'people.deleteSupplierTitle': 'حذف هذا المورد؟',

    // ---------- الجدول ----------
    'people.colBalance': 'الرصيد الحالي',
    'people.legendOwedYou': 'موجب = العميل مدين لك · سالب = رصيد له عندك',
    'people.legendYouOwe': 'موجب = أنت مدين للمورد · سالب = رصيد دائن لصالحك',

    // ---------- شرائح الرصيد ----------
    'people.chipOwes': 'مدين',
    'people.chipCredit': 'رصيد له',
    'people.chipSettledCust': 'أخلص',
    'people.chipWeOwe': 'نحن مدينون له',
    'people.chipSupplierCredit': 'رصيد لنا لديه',
    'people.chipSettledSupp': 'مسدد',

    // ---------- حالات الفراغ ----------
    'people.emptyCustomers': 'لا يوجد عملاء بعد',
    'people.emptyCustomersHint': 'أضف أول عميل لتبدأ في متابعة المديونيات وكشوف الحسابات.',
    'people.emptySuppliers': 'لا يوجد موردون بعد',
    'people.emptySuppliersHint': 'أضف أول مورد لتبدأ في متابعة المستحقات وفواتير المشتريات.',
    'people.noResults': 'لا نتائج مطابقة',
    'people.noResultsHint': 'جرّب اسماً آخر أو رقم هاتف مختلفاً.',

    // ---------- نموذج الإضافة/التعديل ----------
    'people.openingHint':
      'الرصيد الذي يبدأ به هذا الطرف قبل أي فواتير؛ موجب = مدين لك (عميل) أو عليك (مورد). يمكنك تركه صفراً الآن.',
    'people.notesPh': 'ملاحظات اختيارية عن هذا الطرف…',
    'people.custSaved': 'تم حفظ بيانات العميل بنجاح',
    'people.suppSaved': 'تم حفظ بيانات المورد بنجاح',

    // ---------- الحذف ----------
    'people.deleteBlockedCust': 'تعذّر الحذف: هذا العميل مرتبط بفواتير قائمة',
    'people.deleteBlockedSupp': 'تعذّر الحذف: هذا المورد مرتبط بفواتير مشتريات قائمة',

    // ---------- كشف الحساب ----------
    'people.statementTitle': 'كشف حساب',
    'people.netBalance': 'الصافي المستحق',
    'people.statementFormulaCust': 'رصيد افتتاحي + مستحق فواتير غير مسددة − سندات قبض مستقلة',
    'people.statementFormulaSupp': 'رصيد افتتاحي + مستحق فواتير مشتريات − سندات صرف مستقلة',
    'people.currentDueCust': 'المديونية الحالية على هذا العميل',
    'people.currentDueSupp': 'ما يعلمنا استحقه هذا المورد الآن',
    'people.inFavorCust': 'رصيد دائن في محاباة العميل',
    'people.inFavorSupp': 'هذا المورد مسدد — وله رصيداً عندنا',
    'people.recentInvoicesCust': 'آخر فواتير البيع',
    'people.recentInvoicesSupp': 'آخر فواتير المشتريات',
    'people.noInvoices': 'لا توجد فواتير مسجلة على هذا الحساب بعد',
    'people.standaloneReceiptsLine': 'إجمالي سندات القبض المستقلة (غير المرتبطة بفاتورة)',
    'people.standalonePaymentsLine': 'إجمالي سندات الصرف المستقلة (غير المرتبطة بفاتورة)',
    'people.colInvoice': 'الفاتورة',
    'people.recordVoucherHere': 'تسجيل سند',

    // ---------- حوار السند ----------
    'people.receiptTitle': 'سند قبض',
    'people.paymentTitle': 'سند صرف',
    'people.receiptDesc': 'مبلغ مستلم من الطرف أدناه، بمعزل عن أي فاتورة.',
    'people.paymentDesc': 'مبلغ مدفوع للطرف أدناه، بمعزل عن أي فاتورة.',
    'people.amountRequired': 'أدخل مبلغاً أكبر من صفر',
    'people.voucherDatePh': 'اتركه فارغاً لليوم',
    'people.voucherNotePh': 'وصف مختصر للسند (اختياري)',
    'people.clearDate': 'مسح التاريخ',
    'people.recordVoucher': 'تسجيل السند',
    'people.receiptDone': 'تم تسجيل سند القبض رقم {n}',
    'people.paymentDone': 'تم تسجيل سند الصرف رقم {n}',
  },
}
