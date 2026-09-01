#!/bin/bash
# Video 8 v2 — clean re-shoot (no overlay)
source /home/z/my-project/scripts/shoot_helpers.sh
cd /home/z/my-project
D=v8

shot $D 01-finance-nav
agent-browser wait 700 >/dev/null
shot $D 02-receipts-tab

real_click 'button "سند قبض جديد"' >/dev/null; agent-browser wait 2200 >/dev/null; attach
shot $D 03-click-new
agent-browser wait 600 >/dev/null; attach
shot $D 04-dialog

real_click 'combobox "العميل"' >/dev/null; agent-browser wait 1600 >/dev/null; attach
shot $D 05-customer-options

real_click 'option "شركة النصر للتجارة"' >/dev/null; agent-browser wait 1500 >/dev/null; attach
shot $D 06-customer-chosen

echo "dialog inputs: $(agent-browser eval "(async () => { const dlg = document.querySelector('[role=dialog]'); const i = [...dlg.querySelectorAll('input')].filter(e => e.offsetParent); return i.map(x => (x.placeholder||x.type)).join(' | '); })()" 2>/dev/null)"

echo "frames: $(ls assets-video/frames/$D/ | wc -l)"
