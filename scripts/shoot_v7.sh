#!/bin/bash
# Video 7 — العملاء والموردون (customer perspective)
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v7

real_click 'button "العملاء"' >/dev/null; agent-browser wait 3200 >/dev/null; attach
shot $D 01-customers-nav

agent-browser wait 900 >/dev/null
shot $D 02-customers-view

real_click 'button "إضافة عميل"' >/dev/null; agent-browser wait 2000 >/dev/null; attach
shot $D 03-click-add

agent-browser wait 700 >/dev/null; attach
shot $D 04-dialog

# inputs: 0=search(page) 1=name 2=phone 3=balance 4=address
jfill 1 "سلمى إبراهيم"
jfill 2 "01055667788"
jfill 4 "المعادي - القاهرة"
agent-browser wait 900 >/dev/null
shot $D 05-filled

real_click 'button "حفظ"' >/dev/null; agent-browser wait 2600 >/dev/null; attach
shot $D 06-click-save

agent-browser wait 800 >/dev/null
shot $D 07-saved

# account statement for شركة النصر (second row area) — click its كشف حساب via jclick fallback
jclick "كشف حساب" >/dev/null 2>&1
agent-browser wait 2400 >/dev/null; attach
shot $D 08-statement

agent-browser wait 800 >/dev/null
shot $D 09-statement-hold

jclick "إغلاق" >/dev/null 2>&1
agent-browser wait 1400 >/dev/null

real_click 'button "الموردون"' >/dev/null; agent-browser wait 3200 >/dev/null; attach
shot $D 10-suppliers-nav

agent-browser wait 900 >/dev/null
shot $D 11-suppliers-list

agent-browser wait 800 >/dev/null
shot $D 12-hold

echo "frames: $(ls assets-video/frames/$D/ | wc -l)"
