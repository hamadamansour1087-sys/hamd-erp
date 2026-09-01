#!/bin/bash
# Video 10 v2 — offline journey with correct `set offline`
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v10

# reset: new invoice (clears cart + closes dialog)
jclick "فاتورة جديدة" >/dev/null 2>&1
agent-browser wait 2200 >/dev/null; attach
shot $D 01-pos-online
agent-browser wait 500 >/dev/null
shot $D 02-pos-hold

# go offline
agent-browser set offline on >/dev/null
agent-browser wait 2400 >/dev/null
shot $D 03-offline-pill
agent-browser wait 700 >/dev/null
shot $D 04-offline-hold

# add products
R=$(snapref 'button "أرز ٥ كجم'); C=$(center_of "@$R")
agent-browser eval "(async () => { __ui.ripple(${C% *}, ${C#* }); })()" >/dev/null
agent-browser click "@$R" >/dev/null
agent-browser wait 1500 >/dev/null
shot $D 05-add-rice

R=$(snapref 'button "سكر ١ كجم'); C=$(center_of "@$R")
agent-browser eval "(async () => { __ui.ripple(${C% *}, ${C#* }); })()" >/dev/null
agent-browser click "@$R" >/dev/null
agent-browser wait 1500 >/dev/null
shot $D 06-add-sugar

agent-browser wait 500 >/dev/null
shot $D 07-cart

real_click 'button "كامل المبلغ"' >/dev/null
agent-browser wait 1200 >/dev/null
shot $D 08-paid-full

R=$(snapref 'button "إتمام البيع'); C=$(center_of "@$R")
agent-browser eval "(async () => { __ui.ripple(${C% *}, ${C#* }); })()" >/dev/null
agent-browser click "@$R" >/dev/null
agent-browser wait 2400 >/dev/null
shot $D 09-checkout-offline

agent-browser wait 900 >/dev/null
shot $D 10-queued-hold

# back online → auto sync
agent-browser set offline off >/dev/null
agent-browser wait 1300 >/dev/null
shot $D 11-syncing
agent-browser wait 3500 >/dev/null
attach
shot $D 12-synced

echo "frames: $(ls assets-video/frames/$D/ | wc -l)"
