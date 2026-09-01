#!/bin/bash
# Video 9 — المستخدمون والصلاحيات
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v9

real_click 'button "الإعدادات"' >/dev/null; agent-browser wait 3200 >/dev/null; attach
shot $D 01-settings-nav

agent-browser wait 700 >/dev/null
shot $D 02-info-tab

real_click 'tab "المستخدمون"' >/dev/null; agent-browser wait 2600 >/dev/null; attach
shot $D 03-users-tab

agent-browser wait 700 >/dev/null
shot $D 04-users-list

R=$(snapref 'button "إضافة مستخدم"'); C=$(center_of "@$R")
agent-browser eval "(async () => { __ui.ripple(${C% *}, ${C#* }); })()" >/dev/null
agent-browser click "@$R" >/dev/null
agent-browser wait 2200 >/dev/null; attach
shot $D 05-click-add

agent-browser wait 600 >/dev/null; attach
shot $D 06-dialog

# inputs: 0=name 1=email 2=password (dialog only — page search may interfere; verify count first)
echo "inputs: $(jcount_inputs)"
jfill 0 "سارة أحمد"
jfill 1 "sara@hamd.app"
jfill 2 "Sara@2026"
agent-browser wait 800 >/dev/null
shot $D 07-filled

real_click 'combobox "الدور"' >/dev/null; agent-browser wait 1500 >/dev/null; attach
shot $D 08-role-options

echo "frames: $(ls assets-video/frames/$D/ | wc -l)"
