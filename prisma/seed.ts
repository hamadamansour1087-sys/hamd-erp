/**
 * Seed script — demo tenant with realistic data.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20240915)
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const between = (a: number, b: number) => a + rand() * (b - a)

async function main() {
  console.log('🌱 Seeding demo tenant…')

  // Fresh database — clear everything
  await db.$transaction([
    db.stockMovement.deleteMany(),
    db.transferItem.deleteMany(),
    db.transfer.deleteMany(),
    db.voucher.deleteMany(),
    db.invoiceItem.deleteMany(),
    db.invoice.deleteMany(),
    db.expense.deleteMany(),
    db.stockLevel.deleteMany(),
    db.product.deleteMany(),
    db.category.deleteMany(),
    db.unit.deleteMany(),
    db.warehouse.deleteMany(),
    db.customer.deleteMany(),
    db.supplier.deleteMany(),
    db.counter.deleteMany(),
    db.user.deleteMany(),
    db.org.deleteMany(),
  ])

  const org = await db.org.create({
    data: {
      name: 'سوبر ماركت النور',
      currencyCode: 'EGP',
      taxPercent: 14,
      phone: '01012345678',
      address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
    },
  })

  await db.user.create({
    data: {
      orgId: org.id,
      name: 'أحمد مدير المتجر',
      email: 'admin@tijara.app',
      passwordHash: hashPassword('123456'),
      role: 'ADMIN',
    },
  })
  await db.user.create({
    data: {
      orgId: org.id,
      name: 'سارة الكاشير',
      email: 'cashier@tijara.app',
      passwordHash: hashPassword('123456'),
      role: 'CASHIER',
    },
  })

  const whMain = await db.warehouse.create({ data: { orgId: org.id, name: 'المخزن الرئيسي', isDefault: true, location: 'مدينة نصر' } })
  const whBranch = await db.warehouse.create({ data: { orgId: org.id, name: 'مخزن فرع المعادي', location: 'المعادي' } })
  const warehouses = [whMain, whBranch]

  const catDefs = ['مواد غذائية', 'مشروبات', 'ألبان وأجبان', 'منظفات', 'أدوات منزلية', 'عناية شخصية', 'قرطاسية', 'إلكترونيات صغيرة']
  const cats = [] as { id: string; name: string }[]
  for (let i = 0; i < catDefs.length; i++) {
    cats.push(await db.category.create({ data: { orgId: org.id, name: catDefs[i], sort: i } }))
  }

  const unitDefs = [
    ['قطعة', 'pcs'], ['كيلوجرام', 'kg'], ['لتر', 'ltr'], ['علبة', 'box'], ['كرتونة', 'ctn'],
  ]
  const units = [] as { id: string; shortName: string }[]
  for (const [name, short] of unitDefs) {
    units.push(await db.unit.create({ data: { orgId: org.id, name, shortName: short } }))
  }
  const [uPiece, uKg, uLtr, uBox] = units

  interface PDef { name: string; en: string; cat: number; cost: number; price: number; unit: { id: string }; minQty: number }
  const pdefs: PDef[] = [
    { name: 'أرز مصري فاخر', en: 'Egyptian Rice Premium', cat: 0, cost: 24, price: 32, unit: uKg, minQty: 20 },
    { name: 'سكر أبيض ناعم', en: 'White Sugar Fine', cat: 0, cost: 22, price: 28, unit: uKg, minQty: 25 },
    { name: 'زيت عافية ذرة', en: 'Afia Corn Oil', cat: 0, cost: 68, price: 85, unit: uLtr, minQty: 12 },
    { name: 'مكرونة الملكة سباجتي', en: 'Regina Spaghetti', cat: 0, cost: 8.5, price: 12, unit: uBox, minQty: 30 },
    { name: 'شاي العروسة 250جم', en: 'El Arosa Tea 250g', cat: 1, cost: 30, price: 40, unit: uBox, minQty: 15 },
    { name: 'نسكافيه جولد', en: 'Nescafé Gold', cat: 1, cost: 180, price: 225, unit: uBox, minQty: 6 },
    { name: 'كوكاكولا 1 لتر', en: 'Coca-Cola 1L', cat: 1, cost: 11, price: 16, unit: uLtr, minQty: 48 },
    { name: 'عصير جهينة برتقال', en: 'Juhayna Orange Juice', cat: 1, cost: 14, price: 20, unit: uLtr, minQty: 24 },
    { name: 'لبن جهينة كامل الدسم', en: 'Juhayna Full Milk', cat: 2, cost: 26, price: 34, unit: uLtr, minQty: 24 },
    { name: 'جبنة رومي بلدي', en: 'Roumy Cheese', cat: 2, cost: 130, price: 165, unit: uKg, minQty: 10 },
    { name: 'زبادي دانون', en: 'Danone Yoghurt', cat: 2, cost: 7, price: 10, unit: uPiece, minQty: 36 },
    { name: 'بيض بلدي طبق 30', en: 'Baladi Eggs Tray 30', cat: 2, cost: 95, price: 120, unit: uBox, minQty: 10 },
    { name: 'مسحوق بريل للغسيل', en: 'Pril Dish Powder', cat: 3, cost: 42, price: 55, unit: uBox, minQty: 15 },
    { name: 'كلوركس مطهر 1ل', en: 'Clorox 1L', cat: 3, cost: 18, price: 25, unit: uLtr, minQty: 20 },
    { name: 'فلاش منظف أرضيات', en: 'Flash Floor Cleaner', cat: 3, cost: 33, price: 45, unit: uLtr, minQty: 12 },
    { name: 'مناشف مطبخ فيسكو', en: 'Visco Kitchen Towels', cat: 3, cost: 21, price: 30, unit: uBox, minQty: 18 },
    { name: 'طقم صحون بورسلين', en: 'Porcelain Plates Set', cat: 4, cost: 210, price: 290, unit: uBox, minQty: 4 },
    { name: 'حلة تفلون 28 سم', en: 'Teflon Pot 28cm', cat: 4, cost: 150, price: 210, unit: uPiece, minQty: 5 },
    { name: 'كوب زجاج مقاوم', en: 'Tempered Glass Cup', cat: 4, cost: 22, price: 35, unit: uPiece, minQty: 24 },
    { name: 'مقص مطبخ ستانلس', en: 'Stainless Kitchen Scissors', cat: 4, cost: 35, price: 50, unit: uPiece, minQty: 8 },
    { name: 'شامبو هيد اند شولدرز', en: 'Head & Shoulders Shampoo', cat: 5, cost: 120, price: 155, unit: uBox, minQty: 10 },
    { name: 'معجون سيجنال', en: 'Signal Toothpaste', cat: 5, cost: 24, price: 35, unit: uBox, minQty: 20 },
    { name: 'صابون لوكس', en: 'Lux Soap', cat: 5, cost: 9, price: 14, unit: uPiece, minQty: 40 },
    { name: 'شفرات جيليت', en: 'Gillette Blades', cat: 5, cost: 65, price: 90, unit: uBox, minQty: 8 },
    { name: 'دفتر 100 ورقة', en: 'Notebook 100 Sheets', cat: 6, cost: 12, price: 18, unit: uPiece, minQty: 30 },
    { name: 'قلم حبر أزرق', en: 'Blue Pen', cat: 6, cost: 3.5, price: 6, unit: uPiece, minQty: 60 },
    { name: 'ملف مستندات', en: 'Documents Folder', cat: 6, cost: 8, price: 13, unit: uPiece, minQty: 20 },
    { name: 'ورق طباعة A4', en: 'A4 Printing Paper', cat: 6, cost: 140, price: 185, unit: uBox, minQty: 6 },
    { name: 'باور بانك 10000 مللي', en: 'Power Bank 10000mAh', cat: 7, cost: 320, price: 450, unit: uPiece, minQty: 3 },
    { name: 'سماعات بلوتوث', en: 'Bluetooth Earbuds', cat: 7, cost: 260, price: 380, unit: uPiece, minQty: 4 },
    { name: 'كابل شحن Type-C', en: 'Type-C Charging Cable', cat: 7, cost: 30, price: 55, unit: uPiece, minQty: 20 },
    { name: 'لمبة LED موفر 12 واط', en: 'LED Bulb 12W', cat: 7, cost: 38, price: 60, unit: uPiece, minQty: 15 },
    { name: 'دقيق فاخر 1 كجم', en: 'Premium Flour 1kg', cat: 0, cost: 17, price: 23, unit: uKg, minQty: 25 },
    { name: 'عدس أصفر', en: 'Yellow Lentils', cat: 0, cost: 36, price: 48, unit: uKg, minQty: 12 },
    { name: 'فول مدمس معلب', en: 'Canned Fava Beans', cat: 0, cost: 13, price: 19, unit: uPiece, minQty: 30 },
    { name: 'تونة قطع في الزيت', en: 'Tuna Chunks in Oil', cat: 0, cost: 52, price: 70, unit: uPiece, minQty: 20 },
  ]

  const products: Array<{ id: string; name: string; cost: number; price: number }> = []
  for (let i = 0; i < pdefs.length; i++) {
    const d = pdefs[i]
    const p = await db.product.create({
      data: {
        orgId: org.id,
        name: d.name,
        nameEn: d.en,
        barcode: `62${String(3100000 + i * 137).padStart(11, '0')}`,
        sku: `SKU-${String(i + 1).padStart(4, '0')}`,
        categoryId: cats[d.cat].id,
        unitId: d.unit.id,
        cost: d.cost,
        price: d.price,
        minQty: d.minQty,
        trackStock: true,
      },
      select: { id: true, name: true, cost: true, price: true },
    })
    products.push({ ...p, cost: Number(p.cost), price: Number(p.price) })
  }

  // ---- Purchase invoices first (stock arrives), then sales history ----
  const now = Date.now()
  const dayMs = 86_400_000

  async function createInvoice(opts: {
    type: 'SALE' | 'PURCHASE'
    daysAgo: number
    hour?: number
    customer?: string | null
    supplier?: string | null
    warehouseId: string
    itemIdxs: number[]
    qtyFactor?: number
    status?: 'PAID' | 'PARTIAL' | 'UNPAID'
    userRole?: 'ADMIN' | 'CASHIER'
  }) {
    const date = new Date(now - opts.daysAgo * dayMs)
    date.setHours(Math.floor(between(9, 21)), Math.floor(between(0, 59)), 0, 0)

    const itemsData = opts.itemIdxs.map((idx) => {
      const p = products[idx]
      const def = pdefs[idx]
      if (opts.type === 'SALE') {
        const margin = def.price / def.cost
        return {
          productId: p.id,
          qty: Math.max(1, Math.round(between(1, 4) * (opts.qtyFactor ?? 1))),
          price: round2(p.price * between(0.98, 1.02)),
          costAtSale: p.cost,
          targetMargin: margin,
        }
      }
      return { productId: p.id, qty: Math.max(20, Math.round(between(30, 80))), price: round2(def.cost * between(0.94, 1)), costAtSale: round2(def.cost * between(0.94, 1)) }
    })

    let subtotal = 0
    let costTotal = 0
    for (const it of itemsData) {
      subtotal += it.qty * it.price
      costTotal += it.qty * it.costAtSale
    }
    subtotal = round2(subtotal)
    costTotal = round2(costTotal)
    const discount = rand() < 0.18 ? round2(subtotal * between(0.01, 0.05)) : 0
    const taxPercent = 14
    const taxAmount = round2(((subtotal - discount) * taxPercent) / 100)
    const total = round2(subtotal - discount + taxAmount)

    let status = opts.status ?? 'PAID'
    let paidAmount = total
    if (!opts.status) {
      const r = rand()
      status = r < 0.72 ? 'PAID' : r < 0.88 ? 'PARTIAL' : 'UNPAID'
      paidAmount = status === 'PAID' ? total : status === 'PARTIAL' ? round2(total * between(0.3, 0.6)) : 0
    }

    const docKey = opts.type === 'SALE' ? 'INV' : 'PUR'
    const counter = await db.counter.upsert({
      where: { orgId_docKey: { orgId: org.id, docKey } },
      create: { orgId: org.id, docKey, next: 2 },
      update: { next: { increment: 1 } },
    })
    const number = counter.next - 1 || 1

    const invoice = await db.invoice.create({
      data: {
        orgId: org.id,
        number,
        type: opts.type,
        status,
        customerId: opts.type === 'SALE' ? opts.customer ?? null : null,
        supplierId: opts.type === 'PURCHASE' ? opts.supplier ?? null : null,
        warehouseId: opts.warehouseId,
        date,
        subtotal,
        discount,
        taxPercent,
        taxAmount,
        total,
        paidAmount,
        costTotal,
        userId: sAdmin,
      },
    })

    for (const it of itemsData) {
      const productRow = await db.product.findUniqueOrThrow({
        where: { id: it.productId },
        include: { unit: true },
      })
      await db.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: it.productId,
          nameSnap: productRow.name,
          unitSnap: productRow.unit?.shortName ?? null,
          barcodeSnap: productRow.barcode,
          qty: it.qty,
          price: it.price,
          costAtSale: it.costAtSale,
          total: round2(it.qty * it.price),
        },
      })
      const delta = opts.type === 'SALE' ? -it.qty : it.qty
      await db.stockLevel.upsert({
        where: { productId_warehouseId: { productId: it.productId, warehouseId: opts.warehouseId } },
        create: { productId: it.productId, warehouseId: opts.warehouseId, qty: delta },
        update: { qty: { increment: delta } },
      })
      await db.stockMovement.create({
        data: {
          orgId: org.id,
          productId: it.productId,
          warehouseId: opts.warehouseId,
          qty: delta,
          kind: opts.type,
          refType: 'INVOICE',
          refId: invoice.id,
          userId: sAdmin,
        },
      })
    }

    // auto payment voucher when money moved at creation time
    if (paidAmount > 0) {
      const vKey = opts.type === 'SALE' ? 'RCV' : 'PMT'
      const vc = await db.counter.upsert({
        where: { orgId_docKey: { orgId: org.id, docKey: vKey } },
        create: { orgId: org.id, docKey: vKey, next: 2 },
        update: { next: { increment: 1 } },
      })
      const party = opts.type === 'SALE'
        ? customers.find((c) => c.id === opts.customer)?.name ?? 'عميل نقدي'
        : suppliers.find((sp) => sp.id === opts.supplier)?.name ?? 'مورد'
      await db.voucher.create({
        data: {
          orgId: org.id,
          number: vc.next - 1 || 1,
          type: opts.type === 'SALE' ? 'RECEIPT' : 'PAYMENT',
          method: rand() < 0.78 ? 'CASH' : pick(['CARD', 'BANK', 'WALLET'] as const),
          amount: paidAmount,
          partyType: opts.type === 'SALE' ? (opts.customer ? 'CUSTOMER' : 'OTHER') : (opts.supplier ? 'SUPPLIER' : 'OTHER'),
          partyName: party,
          customerId: opts.type === 'SALE' ? opts.customer ?? null : null,
          supplierId: opts.type === 'PURCHASE' ? opts.supplier ?? null : null,
          invoiceId: invoice.id,
          note: `${opts.type === 'SALE' ? 'دفعة على الفاتورة' : 'سداد للفاتورة'} رقم ${number}`,
          userId: sAdmin,
          date,
        },
      })
    }
    return invoice
  }

  const customersDef = [
    ['محمد عبد الله', '01011112222'], ['فاطمة السيد', '01222233344'],
    ['أحمر مؤسسة التوريدات', '01133334455'], ['نورا إبراهيم', '01044445566'],
    ['كريم منصور', '01255556677'], ['هالة يوسف', '01066667788'],
    ['شركة الأمل للتجهيزات', '01177778899'], ['مصطفى كامل', '01288889900'],
    ['سعاد حسن', '01099990001'], ['عميل نقدي دائم', '01100001122'],
  ]
  const customers = [] as { id: string; name: string }[]
  for (const [name, phone] of customersDef) {
    customers.push(
      await db.customer.create({
        data: { orgId: org.id, name, phone, openingBalance: rand() < 0.3 ? round2(between(50, 500)) : 0 },
      })
    )
  }

  const suppliersDef = [
    ['شركة الوفاء للتوزيع', '01212121212'], ['مؤسسة الغذاء الصحي', '01515151515'],
    ['الشرق للأجهزة المنزلية', '01010101010'], ['الفارس للتجميليات', '01111111111'],
    ['مكتبة المستقبل', '01213141516'], ['النور للالكترونيات', '01098765432'],
  ]
  const suppliers = [] as { id: string; name: string }[]
  for (const [name, phone] of suppliersDef) {
    suppliers.push(await db.supplier.create({ data: { orgId: org.id, name, phone, openingBalance: rand() < 0.4 ? round2(between(300, 3000)) : 0 } }))
  }

  const adminUser = await db.user.findFirstOrThrow({ where: { orgId: org.id, role: 'ADMIN' }, select: { id: true } })
  const sAdmin = adminUser.id

  // Opening purchases 46-43 days ago into main + branch
  for (const w of warehouses) {
    for (let k = 0; k < 4; k++) {
      const idxs = Array.from(new Set(Array.from({ length: 12 }, () => Math.floor(rand() * products.length))))
      await createInvoice({
        type: 'PURCHASE',
        daysAgo: 46 - k,
        supplier: pick(suppliers).id,
        warehouseId: w.id,
        itemIdxs: idxs,
        status: rand() < 0.7 ? 'PAID' : rand() < 0.5 ? 'PARTIAL' : 'UNPAID',
      })
    }
  }

  // Top-up purchase every ~10 days
  for (let d = 40; d >= 5; d -= 10) {
    const idxs = Array.from(new Set(Array.from({ length: 8 }, () => Math.floor(rand() * products.length))))
    await createInvoice({
      type: 'PURCHASE',
      daysAgo: d,
      supplier: pick(suppliers).id,
      warehouseId: whMain.id,
      itemIdxs: idxs,
      status: rand() < 0.75 ? 'PAID' : 'PARTIAL',
    })
  }

  // Daily sales for 45 days (more recent → more sales to render a nice trend)
  for (let d = 45; d >= 0; d--) {
    const volume = d < 7 ? Math.floor(between(3, 7)) : Math.floor(between(1, 5))
    for (let v = 0; v < volume; v++) {
      const itemCount = Math.floor(between(1, 6))
      const idxs = Array.from({ length: itemCount }, () => Math.floor(rand() * products.length))
      await createInvoice({
        type: 'SALE',
        daysAgo: d,
        customer: rand() < 0.3 ? pick(customers).id : null,
        warehouseId: rand() < 0.72 ? whMain.id : whBranch.id,
        itemIdxs: idxs,
        qtyFactor: 1,
      })
    }
  }

  // A couple of cancels in history
  const recentSales = await db.invoice.findMany({
    where: { orgId: org.id, type: 'SALE', status: { not: 'CANCELLED' } },
    orderBy: { date: 'desc' },
    take: 60,
    select: { id: true },
  })
  if (recentSales.length > 10) {
    await db.invoice.update({
      where: { id: recentSales[5].id },
      data: { status: 'CANCELLED' },
    })
  }

  // Expenses across the period
  const expenseDefs: Array<[string, number]> = [
    ['إيجار المحل', 8000], ['فاتورة كهرباء', 1250], ['رواتب الموظفين', 6500],
    ['إنترنت وتليفون', 700], ['صيانة ثلاجات', 1500], ['نثريات وضيافة', 300],
  ]
  for (let m = 0; m < 2; m++) {
    for (const [cat, amount] of expenseDefs) {
      const date = new Date(now - (m * 30 + Math.floor(between(1, 26))) * dayMs)
      await db.expense.create({
        data: {
          orgId: org.id,
          category: cat,
          amount,
          method: rand() < 0.8 ? 'CASH' : 'BANK',
          note: null,
          userId: sAdmin,
          date,
        },
      })
    }
  }

  // Standalone receipts & payments (غير مرتبطة بفواتير)
  for (const cust of customers.slice(0, 3)) {
    const vc = await db.counter.upsert({
      where: { orgId_docKey: { orgId: org.id, docKey: 'RCV' } },
      create: { orgId: org.id, docKey: 'RCV', next: 2 },
      update: { next: { increment: 1 } },
    })
    await db.voucher.create({
      data: {
        orgId: org.id, number: vc.next - 1 || 1, type: 'RECEIPT', method: 'CASH',
        amount: round2(between(200, 1200)),
        partyType: 'CUSTOMER', partyName: cust.name, customerId: cust.id,
        note: 'دفعة على الحساب', userId: sAdmin, date: new Date(now - Math.floor(between(2, 25)) * dayMs),
      },
    })
  }
  for (const sup of suppliers.slice(0, 2)) {
    const vc = await db.counter.upsert({
      where: { orgId_docKey: { orgId: org.id, docKey: 'PMT' } },
      create: { orgId: org.id, docKey: 'PMT', next: 2 },
      update: { next: { increment: 1 } },
    })
    await db.voucher.create({
      data: {
        orgId: org.id, number: vc.next - 1 || 1, type: 'PAYMENT', method: 'BANK',
        amount: round2(between(1000, 6000)),
        partyType: 'SUPPLIER', partyName: sup.name, supplierId: sup.id,
        note: 'سداد جزئي للمورد', userId: sAdmin, date: new Date(now - Math.floor(between(2, 25)) * dayMs),
      },
    })
  }

  // One sample transfer between warehouses
  const trfItems = products.slice(0, 3).map((p) => ({ productId: p.id, productName: p.name, qty: Math.floor(between(2, 8)) }))
  const trfCounter = await db.counter.upsert({
    where: { orgId_docKey: { orgId: org.id, docKey: 'TRF' } },
    create: { orgId: org.id, docKey: 'TRF', next: 2 },
    update: { next: { increment: 1 } },
  })
  const transfer = await db.transfer.create({
    data: {
      orgId: org.id,
      number: trfCounter.next - 1 || 1,
      fromWarehouseId: whMain.id,
      toWarehouseId: whBranch.id,
      note: 'طلب تغذية الفرع',
      userId: sAdmin,
      items: { create: trfItems },
    },
  })
  for (const it of trfItems) {
    const pl = await db.stockLevel.upsert({
      where: { productId_warehouseId: { productId: it.productId, warehouseId: whMain.id } },
      create: { productId: it.productId, warehouseId: whMain.id, qty: 0 },
      update: {},
    }).catch(() => null)
    void pl
    await db.stockLevel.upsert({
      where: { productId_warehouseId: { productId: it.productId, warehouseId: whMain.id } },
      create: { productId: it.productId, warehouseId: whMain.id, qty: -it.qty },
      update: { qty: { decrement: it.qty } },
    })
    await db.stockLevel.upsert({
      where: { productId_warehouseId: { productId: it.productId, warehouseId: whBranch.id } },
      create: { productId: it.productId, warehouseId: whBranch.id, qty: it.qty },
      update: { qty: { increment: it.qty } },
    })
    await db.stockMovement.createMany({
      data: [
        { orgId: org.id, productId: it.productId, warehouseId: whMain.id, qty: -it.qty, kind: 'TRANSFER_OUT', refType: 'TRANSFER', refId: transfer.id, userId: sAdmin },
        { orgId: org.id, productId: it.productId, warehouseId: whBranch.id, qty: it.qty, kind: 'TRANSFER_IN', refType: 'TRANSFER', refId: transfer.id, userId: sAdmin },
      ],
    })
  }

  const counts = {
    invoices: await db.invoice.count({ where: { orgId: org.id } }),
    items: await db.invoiceItem.count({ where: { invoice: { orgId: org.id } } }),
    vouchers: await db.voucher.count({ where: { orgId: org.id } }),
    expenses: await db.expense.count({ where: { orgId: org.id } }),
    movements: await db.stockMovement.count({ where: { orgId: org.id } }),
  }

  console.log('✅ Demo tenant ready:', org.name)
  console.log('   login → admin@tijara.app / 123456')
  console.log('   counts:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
