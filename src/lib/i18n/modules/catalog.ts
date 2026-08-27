// Module dictionary for 'catalog' — owned exclusively by Task 2-a (CatalogAgent).
// Every user-facing string of the Catalog/Products screen lives here, en + ar.
import type { LangDict } from '../root-dict'

export const catalogDict: LangDict = {
  en: {
    // ---------- Header & stats ----------
    'catalog.headerSub': 'Manage your product catalog, prices, and low-stock alerts.',
    'catalog.statProducts': 'Products',
    'catalog.statStockValue': 'Inventory value',
    'catalog.statLowAlert': 'Low-stock alerts',

    // ---------- Toolbar ----------
    'catalog.searchPlaceholder': 'Search by name, barcode or code…',
    'catalog.allCategories': 'All categories',
    'catalog.statusAll': 'All statuses',
    'catalog.managerBtn': 'Categories & units',
    'catalog.addProduct': 'Add product',
    'catalog.prev': 'Previous page',
    'catalog.next': 'Next page',

    // ---------- Table ----------
    'catalog.col.product': 'Product',
    'catalog.col.available': 'Available',
    'catalog.active': 'Active',
    'catalog.inactive': 'Inactive',
    'catalog.serviceItem': 'Service',
    'catalog.noCategory': 'Uncategorized',

    // ---------- Row actions ----------
    'catalog.deleteConfirmTitle': 'Delete product',
    'catalog.deleteConfirmDesc':
      'You are about to delete “{name}”. If it was already used in invoices it will be deactivated instead of deleted.',
    'catalog.deletedSoft': 'Product is used in invoices — it was deactivated instead of deleted.',

    // ---------- States ----------
    'catalog.emptyTitle': 'No products found',
    'catalog.emptyHint': 'Try different filters, or add your first product to start selling.',
    'catalog.loadFailed': 'Could not load products',

    // ---------- Add / Edit dialog ----------
    'catalog.newTitle': 'New product',
    'catalog.editTitle': 'Edit product',
    'catalog.fieldName': 'Name *',
    'catalog.fieldNameEn': 'English name',
    'catalog.fieldCost': 'Purchase price *',
    'catalog.fieldPrice': 'Selling price *',
    'catalog.fieldMinQty': 'Low-stock threshold',
    'catalog.trackStock': 'Track stock',
    'catalog.trackStockHint': 'Turn off to treat this item as a service with no stock.',
    'catalog.fieldImage': 'Image URL',
    'catalog.nameRequired': 'Product name is required',
    'catalog.invalidAmount': 'Enter a valid amount (0 or more)',
    'catalog.genBarcode': 'Generate barcode',

    // ---------- Opening balances (create mode) ----------
    'catalog.openingTitle': 'Opening balances',
    'catalog.openingHint': 'Leave a warehouse blank to skip it.',

    // ---------- Inline add (category/unit) ----------
    'catalog.addCategory': 'New category',
    'catalog.addUnit': 'New unit',
    'catalog.unitShortLabel': 'Short label (e.g. pc)',
    'catalog.shortPlaceholder': 'Short label',

    // ---------- Manager dialog ----------
    'catalog.tabCategories': 'Categories',
    'catalog.tabUnits': 'Units',
    'catalog.mgrSubtitle': 'Add and organize the categories and units used across the system.',
    'catalog.newItemPlaceholder': 'New name…',
    'catalog.delCatTitle': 'Delete category',
    'catalog.delCatDesc':
      'Are you sure you want to delete this category? Products will remain but become uncategorized.',
    'catalog.delUnitTitle': 'Delete unit',
    'catalog.delUnitDesc': 'Are you sure you want to delete this unit?',
    'catalog.categoryInUse': 'This category still has products and cannot be deleted.',

    // ---------- Errors ----------
    'catalog.errDefault': 'Operation failed — please try again.',
  },
  ar: {
    // ---------- الترويسة والإحصائيات ----------
    'catalog.headerSub': 'إدارة منتجاتك وأسعارها وتنبيهات نقص المخزون.',
    'catalog.statProducts': 'عدد المنتجات',
    'catalog.statStockValue': 'قيمة المخزون',
    'catalog.statLowAlert': 'تنبيه نقص',

    // ---------- شريط الأدوات ----------
    'catalog.searchPlaceholder': 'ابحث بالاسم أو الباركود أو الكود…',
    'catalog.allCategories': 'كل التصنيفات',
    'catalog.statusAll': 'كل الحالات',
    'catalog.managerBtn': 'التصنيفات والوحدات',
    'catalog.addProduct': 'إضافة منتج',
    'catalog.prev': 'الصفحة السابقة',
    'catalog.next': 'الصفحة التالية',

    // ---------- الجدول ----------
    'catalog.col.product': 'المنتج',
    'catalog.col.available': 'المتاح',
    'catalog.active': 'نشط',
    'catalog.inactive': 'موقوف',
    'catalog.serviceItem': 'خدمي',
    'catalog.noCategory': 'بدون تصنيف',

    // ---------- إجراءات الصف ----------
    'catalog.deleteConfirmTitle': 'حذف المنتج',
    'catalog.deleteConfirmDesc':
      'أنت على وشك حذف «{name}». إذا كان مستخدَماً في فواتير سابقة فسيتم إيقافه بدلاً من حذفه.',
    'catalog.deletedSoft': 'المنتج مستخدم في فواتير — تم إيقافه بدلاً من حذفه.',

    // ---------- الحالات ----------
    'catalog.emptyTitle': 'لا توجد منتجات',
    'catalog.emptyHint': 'جرّب تغيير عوامل التصفية، أو أضِف أول منتج لتبدأ البيع.',
    'catalog.loadFailed': 'تعذر تحميل المنتجات',

    // ---------- نافذة الإضافة والتعديل ----------
    'catalog.newTitle': 'منتج جديد',
    'catalog.editTitle': 'تعديل المنتج',
    'catalog.fieldName': 'الاسم *',
    'catalog.fieldNameEn': 'الاسم بالإنجليزية',
    'catalog.fieldCost': 'سعر الشراء *',
    'catalog.fieldPrice': 'سعر البيع *',
    'catalog.fieldMinQty': 'حد التنبيه',
    'catalog.trackStock': 'تتبع المخزون',
    'catalog.trackStockHint': 'أوقفه ليعمل العنصر كخدمة بلا مخزون.',
    'catalog.fieldImage': 'رابط الصورة',
    'catalog.nameRequired': 'اسم المنتج مطلوب',
    'catalog.invalidAmount': 'أدخل قيمة صحيحة (صفر أو أكثر)',
    'catalog.genBarcode': 'توليد باركود',

    // ---------- الأرصدة الافتتاحية (وضع الإنشاء) ----------
    'catalog.openingTitle': 'أرصدة افتتاحية',
    'catalog.openingHint': 'اترك خانة أي مخزن فارغة لتخطيه.',

    // ---------- الإضافة السريعة (تصنيف / وحدة) ----------
    'catalog.addCategory': 'تصنيف جديد',
    'catalog.addUnit': 'وحدة جديدة',
    'catalog.unitShortLabel': 'اختصار (مثل: حبة)',
    'catalog.shortPlaceholder': 'الاختصار',

    // ---------- نافذة إدارة التصنيفات والوحدات ----------
    'catalog.tabCategories': 'التصنيفات',
    'catalog.tabUnits': 'الوحدات',
    'catalog.mgrSubtitle': 'أضف ونظّم التصنيفات والوحدات المستخدمة في النظام كله.',
    'catalog.newItemPlaceholder': 'اسم جديد…',
    'catalog.delCatTitle': 'حذف التصنيف',
    'catalog.delCatDesc': 'هل أنت متأكد من حذف هذا التصنيف؟ ستبقى المنتجات موجودة لكن بدون تصنيف.',
    'catalog.delUnitTitle': 'حذف الوحدة',
    'catalog.delUnitDesc': 'هل أنت متأكد من حذف هذه الوحدة؟',
    'catalog.categoryInUse': 'هذا التصنيف عليه منتجات ولا يمكن حذفه.',

    // ---------- الأخطاء ----------
    'catalog.errDefault': 'تعذّر تنفيذ العملية — حاول مرة أخرى.',
  },
}
