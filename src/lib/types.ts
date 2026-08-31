// Shared TypeScript contracts used by both API routes and frontend views.

export interface SessionUser {
  id: string
  orgId: string
  email: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'SUPERADMIN'
}

export interface OrgDTO {
  id: string
  name: string
  currencyCode: string
  taxPercent: number
  phone: string | null
  address: string | null
  logo: string | null
  // Tenant lifecycle (bootstrap/login payloads only; optional so stale
  // offline caches keep decoding without a migration).
  status?: 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED'
  trialEndsAt?: string | null
}

export interface LevelDTO {
  warehouseId: string
  qty: number
}

export interface ProductDTO {
  id: string
  sku: string | null
  barcode: string | null
  name: string
  nameEn: string | null
  categoryId: string | null
  unitId: string | null
  cost: number
  price: number
  minQty: number
  trackStock: boolean
  imageUrl: string | null
  notes: string | null
  active: boolean
  levels: LevelDTO[]
  stock?: number // computed total across warehouses (bootstrap only)
}

export interface CategoryDTO { id: string; name: string; sort: number }
export interface UnitDTO { id: string; name: string; shortName: string }

export interface WarehouseDTO {
  id: string
  name: string
  location: string | null
  isDefault: boolean
  phone: string | null
}

export interface CustomerDTO {
  id: string
  name: string
  phone: string | null
  address: string | null
  openingBalance: number
  notes: string | null
}

export interface SupplierDTO {
  id: string
  name: string
  phone: string | null
  address: string | null
  openingBalance: number
  notes: string | null
}

export type InvoiceType = 'SALE' | 'PURCHASE'
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED'
export type PaperKind = 'A4' | '58mm' | '80mm'

export interface InvoiceItemInput {
  productId: string
  qty: number
  price?: number // optional override; defaults to product price (sale) or cost (purchase)
  discount?: number
}

export interface InvoiceItemDTO {
  id: string
  productId: string
  nameSnap: string
  unitSnap: string | null
  barcodeSnap: string | null
  qty: number
  price: number
  costAtSale: number
  total: number
}

export interface InvoiceListRow {
  id: string
  number: number
  type: InvoiceType
  status: InvoiceStatus
  date: string
  partyName: string | null
  warehouseName?: string | null
  total: number
  paidAmount: number
  itemCount?: number
}

export interface InvoiceDetail extends InvoiceListRow {
  subtotal: number
  discount: number
  taxPercent: number
  taxAmount: number
  costTotal: number
  notes: string | null
  dueDate: string | null
  customerPhone?: string | null
  supplierPhone?: string | null
  createdBy: string | null
  items: InvoiceItemDTO[]
  vouchers: Array<{ id: string; number: number; amount: number; method: string; date: string }>
}

export type VoucherType = 'RECEIPT' | 'PAYMENT'
export type PayMethod = 'CASH' | 'BANK' | 'CARD' | 'WALLET'

export interface VoucherDTO {
  id: string
  number: number
  type: VoucherType
  method: PayMethod
  amount: number
  partyType: 'CUSTOMER' | 'SUPPLIER' | 'OTHER'
  partyName: string | null
  customerId: string | null
  supplierId: string | null
  invoiceId: string | null
  invoiceNumber?: number | null
  note: string | null
  date: string
}

export interface ExpenseDTO {
  id: string
  category: string
  amount: number
  method: PayMethod
  note: string | null
  date: string
}

export interface TransferDTO {
  id: string
  number: number
  fromWarehouseId: string
  toWarehouseId: string
  fromName?: string
  toName?: string
  note: string | null
  date: string
  items: Array<{ productId: string; productName: string; qty: number }>
}

export interface MovementDTO {
  id: string
  productId: string
  productName: string
  warehouseId: string
  warehouseName?: string
  qty: number
  kind: string
  refType: string | null
  refId: string | null
  note: string | null
  createdAt: string
}

// ---------- Reports ----------
export interface DashboardKPIs {
  todaySales: number
  todayInvoices: number
  weekSales: number
  monthSales: number
  monthPurchases: number
  monthProfit: number
  monthExpenses: number
  cashInHand: number // RECEIPTs - PAYMENTs - EXPENSEs, all time
  counts: { products: number; customers: number; suppliers: number }
  lowStockCount: number
  receivables: number
  payables: number
}

export interface ChartPoint { label: string; value: number; secondary?: number; count?: number }
export interface ChartsResponse {
  salesSeries: ChartPoint[]      // value=sales, secondary=profit per day/week/month bucket
  purchasesSeries: ChartPoint[]
  expenseSeries: ChartPoint[]    // daily expense totals in range
  topProducts: ChartPoint[]      // by revenue in range
  topCategories: ChartPoint[]
  topCustomers: ChartPoint[]     // top 5 customers by revenue in range
  valuation: number              // stock cost value all warehouses
  lowStock: Array<{ id: string; name: string; barcode: string | null; qty: number; minQty: number; warehouseNames: string }>
  rangeDays: number
}

export interface BalanceRow { id: string; name: string; phone: string | null; owed: number }

// ---------- Invoice template designer ----------
export interface InvoiceTemplateData {
  a4: {
    showLogo: boolean
    title: string          // e.g. فاتورة ضريبية مبسطة
    headerNote: string     // شكراً لتعاملكم معنا ... custom footer thank you
    accent: string         // hex color for accents/table head
    fontFamily: string     // 'cairo' | 'system'
    fontSize: number       // base pt
    columns: { barcode: boolean; unit: boolean; itemPrice: boolean; itemTotal: boolean }
    showTaxRow: boolean
    showDiscountRow: boolean
    watermark: boolean
    signatureLines: boolean
    showBarcodeFooter: boolean
  }
  thermal: {
    defaultWidth: '58mm' | '80mm'
    showLogoText: boolean  // print org name as ASCII banner instead of image
    showQr: boolean
    footerMsg: string
    cutLine: boolean
  }
}
