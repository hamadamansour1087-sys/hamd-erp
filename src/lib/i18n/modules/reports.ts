// Module dictionary for 'reports' (التقارير) — owned exclusively by Task 5-a.
import type { LangDict } from '../root-dict'

export const reportsDict: LangDict = {
  en: {
    // ---------- Header / guard ----------
    'rpt.title': 'Reports & insights',
    'rpt.sub': 'A deep read of sales, purchases, inventory and party balances',
    'rpt.locked': 'Reports are available to managers only',
    'rpt.lockedHint': 'Your cashier account does not include financial reports. Ask an administrator for manager access if you need it.',

    // ---------- Tabs ----------
    'rpt.tabOverview': 'Overview',
    'rpt.tabProducts': 'Products & categories',
    'rpt.tabStock': 'Inventory',
    'rpt.tabBalances': 'Balances',

    // ---------- Range controls ----------
    'rpt.rangeLabel': 'Date range',
    'rpt.range7Days': 'Last 7 days',
    'rpt.range30Days': 'Last 30 days',
    'rpt.range90Days': 'Last 90 days',
    'rpt.range180Days': 'Last 180 days',
    'rpt.exportJson': 'Export JSON',
    'rpt.exportCsv': 'Export CSV',

    // ---------- Exports (varied) ----------
    'rpt.exportMenu': 'Export',
    'rpt.exportDailyCsv': 'CSV — daily summary',
    'rpt.exportProductsCsv': 'CSV — top products',
    'rpt.exportCategoriesCsv': 'CSV — categories',
    'rpt.exportCustomersCsv': 'CSV — customers balances',
    'rpt.exportSuppliersCsv': 'CSV — suppliers balances',
    'rpt.exportPrint': 'Print / PDF (browser)',
    'rpt.printBlocked': 'The browser blocked the print window — allow popups and try again',
    'rpt.exportExcel': 'Excel (styled, with letterhead)',
    'rpt.exportPdf': 'PDF (direct download)',
    'rpt.exporting': 'Preparing the file…',
    'rpt.exportExcelDone': 'Excel file downloaded — open it in Excel',
    'rpt.exportPdfDone': 'PDF file downloaded',
    'rpt.exportFailed': 'Could not create the file — try again',
    'rpt.colDay': 'Day',
    'rpt.colInvoices': 'Invoices',
    'rpt.colRevenue': 'Revenue',
    'rpt.colShare': 'Share',
    'rpt.colCustomer': 'Customer',
    'rpt.colOwed': 'Balance owed',
    'rpt.colPhone': 'Phone',
    'rpt.colCategory': 'Category',
    'rpt.colQtySold': 'Qty sold',
    'rpt.rowTotal': 'Total',

    // ---------- Overview KPIs + new cards ----------
    'rpt.kpiSales': 'Total sales',
    'rpt.kpiProfit': 'Gross profit',
    'rpt.kpiExpenses': 'Expenses',
    'rpt.kpiNet': 'Net profit (after expenses)',
    'rpt.expensesTrend': 'Expenses',
    'rpt.expensesHint': 'Daily expense totals over the chosen range',
    'rpt.topCustomers': 'Top customers',
    'rpt.topCustomersHint': 'Highest-spending customers in the range',
    'rpt.noCustomerData': 'No customer sales in this range yet',

    // ---------- Charts (overview) ----------
    'rpt.salesTrend': 'Sales & profit',
    'rpt.purchasesTrend': 'Purchases',
    'rpt.salesOnly': 'Sales',
    'rpt.profitOnly': 'Profit',
    'rpt.avgPurchases': 'Average {v}',
    'rpt.periodTotal': 'Range total: {v}',

    // ---------- Products & categories tab ----------
    'rpt.topProducts': 'Top products by revenue',
    'rpt.topProductsHint': 'Ranked by net sales across the chosen range — up to 8 products.',
    'rpt.qtySold': '{n} sold',
    'rpt.showingTopN': 'Showing top {n}',
    'rpt.topCategories': 'Revenue share by category',
    'rpt.topCategoriesHint': 'Share of each category out of the total range revenue.',
    'rpt.catShare': '{pct}% of revenue',
    'rpt.noProdData': 'No product movement in this range yet',
    'rpt.noCatData': 'No category movement in this range yet',

    // ---------- Inventory tab ----------
    'rpt.valuation': 'Current stock value',
    'rpt.valuationHint': 'Cost basis across all warehouses',
    'rpt.lowsCount': 'Shortage alerts',
    'rpt.lowsCountSub': '{n} items at or below their minimum level',
    'rpt.allGood': 'No shortages right now — well kept ✅',
    'rpt.allGoodHint': 'Every tracked product is above its minimum quantity.',
    'rpt.colProduct': 'Product',
    'rpt.colAvailable': 'Available',
    'rpt.colMin': 'Minimum',
    'rpt.colStatus': 'Coverage',
    'rpt.colWarehouses': 'Warehouses',
    'rpt.coverageHint': 'available ÷ minimum × 100',
    'rpt.noneRecorded': '— none recorded —',

    // ---------- Balances tab ----------
    'rpt.receivablesTitle': 'Customers owing you',
    'rpt.receivablesSub': 'Sorted largest first — collect these to strengthen your cash position.',
    'rpt.payablesTitle': 'Suppliers you owe',
    'rpt.payablesSub': 'Settle on time to keep your supply chain healthy.',
    'rpt.totalReceivables': 'Total receivables',
    'rpt.totalPayables': 'Total payables',
    'rpt.netPosition': 'Net cash cycle (receivable − payable)',
    'rpt.creditInFavor': 'credit in your favor',
    'rpt.copyPhone': 'Copy phone number',
    'rpt.noDebtors': 'No outstanding customer balances 🎉',
    'rpt.noDebtorsHint': 'All customers are fully settled.',
    'rpt.noCreditors': 'No outstanding supplier dues 🎉',
    'rpt.noCreditorsHint': 'All suppliers are fully paid.',

    // ---------- States ----------
    'rpt.loadFail': 'Could not load this section',
  },
  ar: {
    // ---------- الترويسة والحارس ----------
    'rpt.title': 'التقارير والتحليلات',
    'rpt.sub': 'قراءة معمّقة في المبيعات والمشتريات والمخزون وأرصدة العملاء والموردين',
    'rpt.locked': 'التقارير متاحة لمسؤولي الإدارة فقط',
    'rpt.lockedHint': 'حساب الكاشير لا يشمل التقارير المالية. تواصل مع مدير النظام لمنحك صلاحيات أوسع إن احتجت إليها.',

    // ---------- التبويبات ----------
    'rpt.tabOverview': 'نظرة عامة',
    'rpt.tabProducts': 'المنتجات والتصنيفات',
    'rpt.tabStock': 'المخزون',
    'rpt.tabBalances': 'الأرصدة',

    // ---------- أدوات المدى الزمني ----------
    'rpt.rangeLabel': 'النطاق الزمني',
    'rpt.range7Days': 'آخر ٧ أيام',
    'rpt.range30Days': 'آخر ٣٠ يوماً',
    'rpt.range90Days': 'آخر ٩٠ يوماً',
    'rpt.range180Days': 'آخر ١٨٠ يوماً',
    'rpt.exportJson': 'تصدير JSON',
    'rpt.exportCsv': 'تصدير CSV',

    // ---------- التصدير المتنوع ----------
    'rpt.exportMenu': 'تصدير',
    'rpt.exportDailyCsv': 'CSV — ملخص يومي',
    'rpt.exportProductsCsv': 'CSV — أفضل المنتجات',
    'rpt.exportCategoriesCsv': 'CSV — التصنيفات',
    'rpt.exportCustomersCsv': 'CSV — أرصدة العملاء',
    'rpt.exportSuppliersCsv': 'CSV — أرصدة الموردين',
    'rpt.exportPrint': 'طباعة / PDF (المتصفح)',
    'rpt.printBlocked': 'المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وحاول مجدداً',
    'rpt.exportExcel': 'Excel منسّق (بترويسة الشركة)',
    'rpt.exportPdf': 'PDF (تنزيل مباشر)',
    'rpt.exporting': 'جارٍ تجهيز الملف…',
    'rpt.exportExcelDone': 'تم تنزيل ملف Excel بنجاح',
    'rpt.exportPdfDone': 'تم تنزيل ملف PDF بنجاح',
    'rpt.exportFailed': 'تعذر إنشاء الملف — حاول مرة أخرى',
    'rpt.colDay': 'اليوم',
    'rpt.colInvoices': 'عدد الفواتير',
    'rpt.colRevenue': 'الإيراد',
    'rpt.colShare': 'الحصة',
    'rpt.colCustomer': 'العميل',
    'rpt.colOwed': 'الرصيد المستحق',
    'rpt.colPhone': 'الهاتف',
    'rpt.colCategory': 'التصنيف',
    'rpt.colQtySold': 'الكمية المبيعة',
    'rpt.rowTotal': 'الإجمالي',

    // ---------- مؤشرات النظرة العامة + البطاقات الجديدة ----------
    'rpt.kpiSales': 'إجمالي المبيعات',
    'rpt.kpiProfit': 'الربح الإجمالي',
    'rpt.kpiExpenses': 'المصروفات',
    'rpt.kpiNet': 'صافي الربح (بعد المصروفات)',
    'rpt.expensesTrend': 'المصروفات',
    'rpt.expensesHint': 'إجمالي المصروفات اليومية خلال المدى المختار',
    'rpt.topCustomers': 'أفضل العملاء',
    'rpt.topCustomersHint': 'أعلى العملاء إنفاقاً خلال المدى الزمني',
    'rpt.noCustomerData': 'لا مبيعات على عملاء في هذا المدى بعد',

    // ---------- الرسوم (نظرة عامة) ----------
    'rpt.salesTrend': 'المبيعات والأرباح',
    'rpt.purchasesTrend': 'المشتريات',
    'rpt.salesOnly': 'المبيعات',
    'rpt.profitOnly': 'الأرباح',
    'rpt.avgPurchases': 'المتوسط {v}',
    'rpt.periodTotal': 'إجمالي المدى: {v}',

    // ---------- تبويب المنتجات والتصنيفات ----------
    'rpt.topProducts': 'أعلى المنتجات إيراداً',
    'rpt.topProductsHint': 'مرتبة تنازلياً حسب صافي المبيعات خلال المدى المختار — حتى ٨ منتجات.',
    'rpt.qtySold': 'كمية {n}',
    'rpt.showingTopN': 'يُعرض الأفضل {n}',
    'rpt.topCategories': 'الحصة الإيرادية لكل تصنيف',
    'rpt.topCategoriesHint': 'نسبة كل تصنيف من إجمالي إيرادات المدى الزمني المحدد.',
    'rpt.catShare': '{pct}% من الإيرادات',
    'rpt.noProdData': 'لا حركة على المنتجات في هذا المدى بعد',
    'rpt.noCatData': 'لا حركة على التصنيفات في هذا المدى بعد',

    // ---------- تبويب المخزون ----------
    'rpt.valuation': 'قيمة المخزون الحالية',
    'rpt.valuationHint': 'محسوبة بسعر التكلفة عبر جميع المخازن',
    'rpt.lowsCount': 'تنبيهات النقص',
    'rpt.lowsCountSub': '{n} صنفاً عند الحد الأدنى أو دونه',
    'rpt.allGood': 'لا نواقص حالياً — مخزونك تحت السيطرة ✅',
    'rpt.allGoodHint': 'كل المنتجات المتتبعة أعلى من كميتها الدنيا المحددة.',
    'rpt.colProduct': 'المنتج',
    'rpt.colAvailable': 'المتاح',
    'rpt.colMin': 'الحد الأدنى',
    'rpt.colStatus': 'الحالة',
    'rpt.colWarehouses': 'المخازن',
    'rpt.coverageHint': 'المتاح ÷ الحد الأدنى × ١٠٠',
    'rpt.noneRecorded': '— غير مسجل —',

    // ---------- تبويب الأرصدة ----------
    'rpt.receivablesTitle': 'عملاء عليهم مديونية',
    'rpt.receivablesSub': 'مرتبة من الأكبر إلى الأصغر — تحصيلها يقوّي وضعك النقدي.',
    'rpt.payablesTitle': 'موردون لهم مستحقات',
    'rpt.payablesSub': 'السداد في وقته يحافظ على استمرارية سلسلة التوريد الخاصة بك.',
    'rpt.totalReceivables': 'إجمالي المديونيات',
    'rpt.totalPayables': 'إجمالي المستحقات للموردين',
    'rpt.netPosition': 'الدورة النقدية الصافية (متحصلات − مستحقات)',
    'rpt.creditInFavor': 'رصيد دائن لصالحك',
    'rpt.copyPhone': 'نسخ رقم الهاتف',
    'rpt.noDebtors': 'لا مديونيات قائمة على العملاء 🎉',
    'rpt.noDebtorsHint': 'جميع عملائك مسددون بالكامل.',
    'rpt.noCreditors': 'لا مستحقات قائمة للموردين 🎉',
    'rpt.noCreditorsHint': 'جميع موردوك مدفوعون بالكامل.',

    // ---------- الحالات ----------
    'rpt.loadFail': 'تعذّر تحميل هذا القسم',
  },
}
