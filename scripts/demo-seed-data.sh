#!/bin/bash
# Seed shooting data into demo org (بقالة الوفاء) on production.
set -uo pipefail
B=https://hamd-erp.vercel.app
J=/home/z/my-project/assets-video/shots/cookies
C="$J/demo.txt"

api() { curl -s -b "$C" -X POST "$B/api/$1" -H 'Content-Type: application/json' -d "$2"; }

echo "=== categories ==="
api categories '{"name":"مواد غذائية"}'; echo
api categories '{"name":"مشروبات"}'; echo
api categories '{"name":"منظفات"}'; echo

CATS=$(curl -s -b "$C" "$B/api/categories" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
m={c['name']:c['id'] for c in d}
print(m['مواد غذائية'], m['مشروبات'], m['منظفات'])")
read -r FOOD DRINK CLEAN <<< "$CATS"
echo "cats: $FOOD $DRINK $CLEAN"

UNITS=$(curl -s -b "$C" "$B/api/units" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
m={u['shortName']:u['id'] for u in d}
print(m['pcs'], m['kg'])")
read -r PCS KG <<< "$UNITS"

WH=$(curl -s -b "$C" "$B/api/warehouses" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print(d[0]['id'])")
echo "unit pcs=$PCS kg=$KG  wh=$WH"

echo "=== products ==="
mk() { api products "{\"name\":\"$1\",\"categoryId\":\"$2\",\"unitId\":\"$3\",\"cost\":$4,\"price\":$5,\"minQty\":$6,\"openingQty\":[{\"warehouseId\":\"$WH\",\"qty\":$7}]}" | head -c 80; echo; }
mk "أرز ٥ كجم" "$FOOD" "$KG" 130 180 10 40
mk "سكر ١ كجم" "$FOOD" "$KG" 18 25 5 60
mk "زيت طعام ١ لتر" "$FOOD" "$PCS" 55 70 6 35
mk "شاي ١٠٠ فتلة" "$FOOD" "$PCS" 24 30 5 45
mk "مياه معدنية ١.٥ لتر" "$DRINK" "$PCS" 6 10 12 90
mk "عصير مانجو ١ لتر" "$DRINK" "$PCS" 16 22 6 30
mk "سائل غسيل الأطباق" "$CLEAN" "$PCS" 28 40 4 25
mk "مسحوق تنظيف" "$CLEAN" "$PCS" 35 48 3 20

echo "=== customers ==="
api customers '{"name":"أحمد محمد","phone":"01012345678","openingBalance":0}' | head -c 100; echo
api customers '{"name":"شركة النصر للتجارة","phone":"01198765432","openingBalance":1500,"notes":"عميل جملة"}' | head -c 100; echo
api customers '{"name":"فاطمة سعيد","phone":"01234567890","openingBalance":0}' | head -c 100; echo

echo "=== suppliers ==="
api suppliers '{"name":"شركة التوزيع المتحدة","phone":"01555667788","openingBalance":800}' | head -c 100; echo
api suppliers '{"name":"مصنع النور للأغذية","phone":"01666778899","openingBalance":0}' | head -c 100; echo

echo "=== verify counts ==="
for r in products customers suppliers; do
  N=$(curl -s -b "$C" "$B/api/$r" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")
  echo "$r: $N"
done
