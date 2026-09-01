#!/bin/bash
# v7 redo frames 06-09 (clean add flow + statement via search)
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v7

real_click 'button "العملاء"' >/dev/null; agent-browser wait 3000 >/dev/null; attach
real_click 'button "إضافة عميل"' >/dev/null; agent-browser wait 2000 >/dev/null; attach
jfill 1 "سلمى إبراهيم"
jfill 2 "01055667788"
jfill 4 "المعادي - القاهرة"
agent-browser wait 800 >/dev/null

# ripple on حفظ then real click
R=$(snapref 'button "حفظ"')
C=$(center_of "@$R")
agent-browser eval "(async () => { __ui.ripple($C); })()" >/dev/null 2>&1
agent-browser click "@$R" >/dev/null
agent-browser wait 2600 >/dev/null; attach
shot $D 06-click-save

agent-browser wait 700 >/dev/null
shot $D 07-saved

# statement for شركة النصر via search filter
jfill 0 "النصر"
agent-browser wait 1600 >/dev/null; attach
real_click 'button "كشف حساب"' >/dev/null
agent-browser wait 2400 >/dev/null; attach
shot $D 08-statement

agent-browser wait 800 >/dev/null
shot $D 09-statement-hold

echo "done"
