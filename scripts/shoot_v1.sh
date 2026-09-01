#!/bin/bash
# Video 1 frames v2 — DOM-direct interaction
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v1

agent-browser cookies clear >/dev/null; agent-browser storage local clear >/dev/null
goto https://hamd-erp.vercel.app
shot $D 01-landing

real_click 'button "ابدأ الآن — تجربة مجانية"'
shot $D 02-click-start
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2600 >/dev/null; attach
shot $D 03-login-view

real_click 'tab "إنشاء حساب"'
shot $D 04-click-register-tab
agent-browser wait 1600 >/dev/null; attach
for i in 1 2 3; do
  N=$(wait_inputs 5 3)
  [ "$N" = "5" ] && break
  real_click 'tab "إنشاء حساب"'
  agent-browser wait 1600 >/dev/null; attach
done
shot $D 05-register-form

jfill 0 "بقالة الأمانة"
jfill 1 "محمد علي"
jfill 2 "video.demo2@hamd.app"
jfill 3 "01122334455"
jfill 4 "Demo@Video2026"
agent-browser wait 900 >/dev/null
shot $D 06-form-filled

real_click 'button "إنشاء حساب"'
shot $D 07-click-submit
agent-browser wait 5000 >/dev/null
shot $D 08-received
agent-browser wait 800 >/dev/null
shot $D 09-received-hold

# === platform approval ===
jclick "العودة لتسجيل الدخول"
agent-browser wait 2000 >/dev/null; attach
for i in 1 2 3; do
  N=$(wait_inputs 2 3)
  [ "$N" = "2" ] && break
  real_click 'button "العودة لتسجيل الدخول"'
  agent-browser wait 1800 >/dev/null; attach
done
shot $D 10-login-again

jfill 0 "owner@hamd.app"
jfill 1 "Fi27juYmZKOqgmGa"
shot $D 11-owner-credentials

real_click 'button "تسجيل الدخول"'
shot $D 12-click-owner-login
agent-browser wait 5500 >/dev/null; attach
shot $D 13-platform-console

real_click 'button "موافقة \+ تجربة ١٤ يوم"'
shot $D 14-click-approve
agent-browser wait 3200 >/dev/null
shot $D 15-approved

# logout
real_click 'button "خروج"'
agent-browser wait 2800 >/dev/null; attach

# === new org first login ===
shot $D 16-back-to-login
jfill 0 "video.demo2@hamd.app"
jfill 1 "Demo@Video2026"
shot $D 17-new-org-credentials
real_click 'button "تسجيل الدخول"'
shot $D 18-click-new-login
agent-browser wait 6500 >/dev/null; attach
shot $D 19-new-dashboard
agent-browser wait 800 >/dev/null
shot $D 20-new-dashboard-hold

echo "frames: $(ls assets-video/frames/v1/ | wc -l)"
