#!/bin/bash
# Video 4 frames v2 — defensive with verification loops
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v4
mkdir -p assets-video/frames/v4

verify_text() { agent-browser snapshot -c 2>/dev/null | grep -qF "$1"; }
wait_text() { # <text> <tries>
  local t=$1 n=${2:-4}
  for ((i=1;i<=n;i++)); do verify_text "$t" && return 0; agent-browser wait 1600 >/dev/null; done
  return 1
}
open_product_form() { # retry until 9 inputs visible
  for ((i=1;i<=3;i++)); do
    real_click 'button "إضافة منتج"'
    agent-browser wait 2000 >/dev/null; attach
    local n=$(jcount_inputs)
    [ "$n" -ge 9 ] 2>/dev/null && return 0
  done
  return 1
}

# fresh login as بقالة الأمانة
agent-browser cookies clear >/dev/null; agent-browser storage local clear >/dev/null
goto https://hamd-erp.vercel.app
real_click 'button "تسجيل الدخول"'
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2400 >/dev/null; attach
jfill 0 "video.demo2@hamd.app"
jfill 1 "Demo@Video2026"
shot $D 01-login-filled
real_click 'button "تسجيل الدخول"'
wait_text "نقطة البيع" 6 >/dev/null; agent-browser wait 1500 >/dev/null; attach
shot $D 02-dashboard

# settings
real_click 'button "الإعدادات"'
agent-browser wait 3200 >/dev/null; attach
shot $D 03-settings

# products empty
real_click 'button "المنتجات"'
agent-browser wait 3000 >/dev/null; attach
shot $D 04-products-empty

# categories & units screen
real_click 'button "التصنيفات والوحدات"'
agent-browser wait 2600 >/dev/null; attach
shot $D 05-cats-units
agent-browser press Escape
agent-browser wait 1500 >/dev/null; attach

# ===== product 1 (full educational flow) =====
open_product_form || { echo "FAIL open form"; exit 1; }
shot $D 06-product-form-empty
real_click 'button "تصنيف جديد"'
agent-browser wait 1500 >/dev/null; attach
agent-browser eval "(async () => { const l = __ui.inputs(); const el = l[l.length-1]; __ui.set(el, 'مواد غذائية'); return el.value; })()" >/dev/null
shot $D 07-category-typed
real_click 'button "حفظ"'
agent-browser wait 2200 >/dev/null; attach
shot $D 08-category-saved
real_click 'combobox "الوحدة"'
agent-browser wait 1400 >/dev/null; attach
shot $D 09-unit-options
real_click 'option "كيلوجرام"'
agent-browser wait 900 >/dev/null
jfill 0 "أرز أبو كاس ١ كيلو"
jfill 4 "18"
jfill 5 "26"
jfill 6 "5"
jfill 8 "50"
agent-browser wait 900 >/dev/null
shot $D 10-product1-filled
real_click 'button "حفظ"'
wait_text "أرز أبو كاس" 5 >/dev/null
agent-browser wait 900 >/dev/null
shot $D 11-product1-saved

# ===== product 2 =====
open_product_form || { echo "FAIL open form 2"; exit 1; }
jfill 0 "سكر أسمر ١ كيلو"
real_click 'combobox "الوحدة"'
agent-browser wait 1200 >/dev/null; attach
real_click 'option "كيلوجرام"'
agent-browser wait 800 >/dev/null
jfill 4 "15"
jfill 5 "22"
jfill 6 "5"
jfill 8 "60"
shot $D 12-product2-filled
real_click 'button "حفظ"'
wait_text "سكر أسمر" 5 >/dev/null
agent-browser wait 800 >/dev/null
shot $D 13-product2-saved

# ===== product 3 =====
open_product_form || { echo "FAIL open form 3"; exit 1; }
jfill 0 "زيت عباد الشمس ١ لتر"
real_click 'combobox "الوحدة"'
agent-browser wait 1200 >/dev/null; attach
real_click 'option "قطعة"'
agent-browser wait 800 >/dev/null
jfill 4 "60"
jfill 5 "85"
jfill 6 "5"
jfill 8 "30"
shot $D 14-product3-filled
real_click 'button "حفظ"'
wait_text "زيت عباد" 5 >/dev/null
agent-browser wait 900 >/dev/null
shot $D 15-products-list-3

# ===== customers =====
real_click 'button "العملاء"'
agent-browser wait 3200 >/dev/null; attach
shot $D 16-customers-empty
real_click 'button "إضافة عميل"'
agent-browser wait 2400 >/dev/null; attach
local_n=$(jcount_inputs)
echo "customer form inputs: $local_n"
jfill 0 "محمد سعيد"
jfill 1 "01001234567"
agent-browser wait 800 >/dev/null
shot $D 17-customer-filled
real_click 'button "حفظ"'
wait_text "محمد سعيد" 5 >/dev/null
agent-browser wait 900 >/dev/null
shot $D 18-customer-saved

echo "v4 frames: $(ls assets-video/frames/v4 | wc -l)"
