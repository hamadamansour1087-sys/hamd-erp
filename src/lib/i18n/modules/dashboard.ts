// Module dictionary for 'dashboard' (لوحة التحكم) — owned exclusively by Task 5-a.
import type { LangDict } from '../root-dict'

export const dashboardDict: LangDict = {
  en: {
    // ---------- Greeting header ----------
    'dash.welcomeMorning': 'Good morning, {name} 👋',
    'dash.welcomeEvening': 'Good evening, {name} 👋',
    'dash.greetSub': "Here's what's happening in your store today",

    // ---------- KPI cards ----------
    'dash.kpiTodaySales': "Today's sales",
    'dash.kpiTodayInvoices': '{n} invoice today',
    'dash.kpiMonthProfit': 'This month profit',
    'dash.kpiMonthSales': 'This month sales',
    'dash.kpiMonthExpenses': 'This month expenses',
    'dash.kpiCashInHand': 'Net cash flow',
    'dash.cashFormula': 'Receipts {r} − Payments {p} − Expenses {e}',
    'dash.kpiReceivables': 'Customer dues',
    'dash.receivablesHint': 'Tap to open balances report',
    'dash.kpiPayables': 'Supplier payables',
    'dash.payablesHint': 'Tap to open balances report',
    'dash.kpiLowStock': 'Low stock alerts',
    'dash.lowStockHint': 'Tap to review inventory',
    'dash.countsLine': '{p} products · {c} customers · {s} suppliers',

    // ---------- Sales trend chart ----------
    'dash.trendTitle': 'Sales & profit trend',
    'dash.weekChip': 'This week: {v}',
    'dash.r7': '7 days',
    'dash.r30': '30 days',
    'dash.r90': '90 days',
    'dash.legendSales': 'Sales',
    'dash.legendProfit': 'Profit',

    // ---------- Side panels ----------
    'dash.topProducts': 'Best sellers',
    'dash.topProductsSub': 'By revenue in the selected range',
    'dash.viewAllReports': 'All reports',
    'dash.emptyTop': 'No sales recorded in this range yet',
    'dash.lowStockTitle': 'Stock shortages',
    'dash.qtyOfMin': '{q} / min {m}',
    'dash.atWarehouses': 'In: {w}',
    'dash.noLow': 'Your stock is in great shape ✅',
    'dash.noLowHint': 'Every tracked product is above its minimum level.',

    // ---------- Quick actions ----------
    'dash.quickActions': 'Quick actions',
    'dash.qkPos': 'Quick sale',
    'dash.qkPurchase': 'Purchase invoice',
    'dash.qkProduct': 'New product',
    'dash.qkReceipt': 'Receipt voucher',

    // ---------- States ----------
    'dash.loadFail': 'Could not load the dashboard data',
  },
  ar: {
    // ---------- ترويسة الترحيب ----------
    'dash.welcomeMorning': 'صباح الخير يا {name} 👋',
    'dash.welcomeEvening': 'مساء الخير يا {name} 👋',
    'dash.greetSub': 'هذه صورة متجرك اليوم — مبيعات وأرباح وحركة المخزون في لمحة واحدة',

    // ---------- بطاقات المؤشرات ----------
    'dash.kpiTodaySales': 'مبيعات اليوم',
    'dash.kpiTodayInvoices': '{n} فاتورة اليوم',
    'dash.kpiMonthProfit': 'أرباح هذا الشهر',
    'dash.kpiMonthSales': 'مبيعات هذا الشهر',
    'dash.kpiMonthExpenses': 'مصروفات هذا الشهر',
    'dash.kpiCashInHand': 'صافي التدفق النقدي',
    'dash.cashFormula': 'قبض {r} − صرف {p} − مصروفات {e}',
    'dash.kpiReceivables': 'متحصلات العملاء',
    'dash.receivablesHint': 'اضغط لفتح تقرير الأرصدة',
    'dash.kpiPayables': 'دفعات للموردين',
    'dash.payablesHint': 'اضغط لفتح تقرير الأرصدة',
    'dash.kpiLowStock': 'تنبيه نقص المخزون',
    'dash.lowStockHint': 'اضغط لمراجعة المخزون الآن',
    'dash.countsLine': '{p} منتج · {c} عميل · {s} مورد',

    // ---------- رسم المبيعات ----------
    'dash.trendTitle': 'حركة المبيعات والأرباح',
    'dash.weekChip': 'هذا الأسبوع: {v}',
    'dash.r7': '٧ أيام',
    'dash.r30': '٣٠ يوم',
    'dash.r90': '٩٠ يوم',
    'dash.legendSales': 'المبيعات',
    'dash.legendProfit': 'الأرباح',

    // ---------- اللوحات الجانبية ----------
    'dash.topProducts': 'الأكثر مبيعاً',
    'dash.topProductsSub': 'مرتبة حسب الإيرادات خلال المدى المحدد',
    'dash.viewAllReports': 'كل التقارير',
    'dash.emptyTop': 'لا توجد مبيعات مسجلة في هذا المدى بعد',
    'dash.lowStockTitle': 'نواقص المخزون',
    'dash.qtyOfMin': '{q} من حد {m}',
    'dash.atWarehouses': 'متوفر في: {w}',
    'dash.noLow': 'مخزونك بصحة ممتازة ✅',
    'dash.noLowHint': 'جميع المنتجات المتتبعة أعلى من الحد الأدنى المحدد لها.',

    // ---------- إجراءات سريعة ----------
    'dash.quickActions': 'إجراءات سريعة',
    'dash.qkPos': 'بيع سريع',
    'dash.qkPurchase': 'فاتورة شراء',
    'dash.qkProduct': 'منتج جديد',
    'dash.qkReceipt': 'سند قبض',

    // ---------- الحالات ----------
    'dash.loadFail': 'تعذّر تحميل بيانات لوحة التحكم',
  },
}
