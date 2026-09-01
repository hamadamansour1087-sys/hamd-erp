#!/bin/bash
# Video 5 frames — نقطة البيع والفواتير
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v5
mkdir -p assets-video/frames/v5

verify_text() { agent-browser snapshot -c 2>/dev/null | grep -qF "$1"; }
# (browser already logged in as بقالة الأمانة from v4 — ensure on POS)
goto https://hamd-erp.vercel.app
agent-browser wait 2500 >/dev/null; attach
real_click 'button "نقطة البيع"'
agent-browser wait 3200 >/dev/null; attach
for i in 1 2 3 4 5 6; do verify_text "أرز أبو كاس" && break; agent-browser wait 2000 >/dev/null; done
shot $D 01-pos-empty

# add أرز ×2
R=$(snapref 'button "أرز أبو كاس'); C=$(center_of "@$R")
agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null
agent-browser click "@$R" >/dev/null; agent-browser wait 900 >/dev/null
agent-browser click "@$R" >/dev/null; agent-browser wait 900 >/dev/null
shot $D 02-rice-added

# add سكر ×1
R=$(snapref 'button "سكر أسمر'); C=$(center_of "@$R")
agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null
agent-browser click "@$R" >/dev/null; agent-browser wait 1100 >/dev/null
shot $D 03-sugar-added-cart

# discount 5%
real_click 'button "خصم 5٪"'
agent-browser wait 900 >/dev/null
shot $D 04-discount5

# checkout
real_click 'button "إتمام البيع'
agent-browser wait 3600 >/dev/null; attach
shot $D 05-checkout-done
agent-browser wait 900 >/dev/null
shot $D 06-checkout-hold

# close any dialog then invoices list
agent-browser press Escape
agent-browser wait 1200 >/dev/null; attach
real_click 'button "فواتير المبيعات"'
agent-browser wait 3200 >/dev/null; attach
shot $D 07-invoices-list

# open first invoice
R=$(snapref 'button "INV-')
if [ -n "$R" ]; then
  C=$(center_of "@$R")
  agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null
  agent-browser click "@$R" >/dev/null
  agent-browser wait 2800 >/dev/null; attach
  shot $D 08-invoice-view
  agent-browser wait 700 >/dev/null
  shot $D 09-invoice-hold
fi

echo "v5 frames: $(ls assets-video/frames/v5 | wc -l)"
