# Money Representation Audit — H.A.M.D ERP

> الرمز هو مصدر الحقيقة: هذه الوثيقة نتاج تدقيق فعلي للكود (commit بعد `c52b8fb`).
> التاريخ: 2026-08-27 · الأداة الحالية: Float + `round2()` في كل حدّ مالي.

## 1) أين تُخزَّن الأموال؟ (Prisma/SQLite `Float` = IEEE-754 double)

| Model.field | النوع | ملاحظة |
|---|---|---|
| `Org.taxPercent` | Float | نسبة 0–100 (ليست مالاً) |
| `Product.cost` / `Product.price` / `Product.minQty` | Float | تُكتب عبر `round2(money(v))` |
| `Customer.openingBalance` / `Supplier.openingBalance` | Float | موقّعة؛ تُكتب عبر `round2(signedMoney(v))` |
| `Invoice.subtotal / discount / taxAmount / total / paidAmount / costTotal` | Float | تُحسب وتُكتب بـ `round2` دائمًا |
| `InvoiceItem.qty / price / costAtSale / total` | Float | `price/qty` مُدوّرة، `total = round2(qty*price)` |
| `Voucher.amount` | Float | `round2(money(...))` في POST |
| `Expense.amount` | Float | `round2(money(...))` في POST |
| `StockLevel.qty` / `StockMovement.qty` | Float | كميات (ليست مالاً) — تقريب 2dp للمدخلات |

## 2) نقاط الدخول والتحويل (أين `money()` / `round2()` / حيث يمكن أن يمرّ رقم غير مُدوّر)

| المسار | الحقل | المعالجة | الحالة |
|---|---|---|---|
| `POST /api/invoices` | كل المجاميع | `round2` على subtotal/tax/total/costTotal + عناصر | ✅ مُدوّر |
| `POST /api/vouchers` | amount | `round2(money(...))` + CAS retry على paidAmount | ✅ مُدوّر |
| `POST /api/expenses` | amount | `round2(money(...))` | ✅ مُدوّر |
| `POST/PUT /api/products` | cost/price/minQty | `round2(money(...))` (كانت `num()` — أُصلحت) | ✅ مُدوّر |
| `POST/PUT /api/customers\|suppliers` | openingBalance | `round2(signedMoney(...))` (كانت `num()` — أُصلحت) | ✅ مُدوّر |
| `POST /api/invoices` (أثناء الإنشاء فقط) | `it.price * it.qty` | تُجمع في `subtotal` ثم `round2` للمجموع | ✅ |
| التقارير (`reports-utils.ts`) | مجاميع SQL `_sum` | تُجمَّع كاملةً ثم `round2` على الناتج | ✅ |
| `withIdempotency` replay | — | يعيد resultId، لا يلمس أرقامًا | ✅ |

الخلاصة: **لا يوجد مسار يخزّن مبلغًا بأكثر من منزلتين عشريتين** بعد هذا الـ commit،
لكن التخزين نفسه يبقى Float (انظر الخطة أدناه).

## 3) لماذا Float + round2 كافٍ *حاليًا* وليس كافيًا *نهائيًا*؟

- كل عملية جمع/ضرب تمر بـ `round2` عند الحفظ، فلا تتراكم الأخطاء بين المستندات.
- خطأ التمثيل (مثل `0.1+0.2 = 0.30000000000000004`) يُصحّح عند التدوير ويُختبر في
  `tests/security/security.test.ts` (حالات 0.1+0.2، 99.99، 100.01، 368.75، 19.99×3، 1e8+0.005).
- **الخطر المتبقي**: قيم كبيرة جدًا (> 2^53 / 100 ≈ 9e13 وحدة) أو تراكم عبر ملايين
  العمليات في الذاكرة قد يُظهر فروقًا من الرتبة 1e-9 — غير مُحقّق حسابيًا (not exact decimal).

## 4) خطة الترحيل المستقبلية (Migration Plan)

**الهدف النهائي:** حساب عشري دقيق. خياران بالترتيب المفضّل:

1. **PostgreSQL + `Decimal(14,2)`** (الخيار الأنظف عند الانتقال لاستضافة أقوى):
   - تغيير `datasource` إلى postgres، تحويل كل حقول المال إلى `Decimal @db.Decimal(14,2)`.
   - قراءة `Prisma.Decimal` في الكود بدل `number` للمجاميع الحرجة، والعرض يبقى `round2`.
2. **البقاء على SQLite لكن بوحدات صغرى (integer minor units — قروش/piasters)**:
   - إضافة أعمدة `Int` جديدة (مثل `totalCents`) بجانب القديمة، كتابة مزدوجة (dual-write)
     لفترة انتقالية، ثم القراءة من الجديدة وترحيل القديمة بـ `round2(x*100)`، ثم الإسقاط.

**قواعد إلزامية أثناء الترحيل:**
- `prisma migrate deploy` فقط (ممنوع `db push --accept-data-loss` في الإنتاج).
- لا تبديل قراءة الأعمدة الجديدة قبل اكتمال backfill وتطابق `round2` بين المصدرين.
- كل مسار جديد يُضاف للمستقبل يمرّ على `round2(money())` ويُضاف له اختبار في `tests/security`.
