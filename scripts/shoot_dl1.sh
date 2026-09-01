#!/bin/bash
# Shoot sample tutorial video frames for hamdlabs.com (dental lab system)
# Story: landing → login → dashboard → system menu → settings → lab-info tab tour → save
set -e
cd /home/z/my-project
source scripts/shoot_helpers.sh

FD=assets-dl/frames/dl1
mkdir -p "$FD"
shot2() { agent-browser screenshot "$FD/$1.png" >/dev/null 2>&1; echo "  shot $1"; }

# tolerant real click: visual success is what matters (Radix/React can make the
# playwright click command exit non-zero even when the menu opened fine)
real_click2() {
  real_click "$1" && return 0
  sleep 0.6
  real_click "$1" && return 0
  return 0
}

echo "── [1] fresh logged-out landing"
agent-browser cookies clear >/dev/null 2>&1
agent-browser eval "localStorage.clear(); sessionStorage.clear(); 'cleared'" >/dev/null 2>&1
goto https://hamdlabs.com/
# wait until the login link is actually present (SPA auth-restore can race)
for i in 1 2 3 4 5; do
  R=$(snapref "تسجيل الدخول")
  [ -n "$R" ] && break
  agent-browser wait 1500 >/dev/null
done
[ -z "$R" ] && { echo 'FATAL: login link never appeared'; exit 1; }
shot2 01-landing

echo "── [2] open login form"
real_click "تسجيل الدخول" || real_click "تسجيل الدخول"
agent-browser wait --load networkidle >/dev/null
agent-browser wait 2200 >/dev/null
attach
shot2 02-login-form

echo "── [3] fill email"
jripple_input 0
agent-browser wait 350 >/dev/null
jfill 0 "m90249125@gmail.com"
agent-browser wait 500 >/dev/null
shot2 03-email-filled

echo "── [4] fill password"
jripple_input 1
agent-browser wait 350 >/dev/null
jfill 1 "Gomaa@2026"
agent-browser wait 500 >/dev/null
shot2 04-password-filled

echo "── [5] click submit (catch loading state)"
agent-browser eval "(async () => {
  const b = [...document.querySelectorAll('button')].find(e => (e.textContent||'').includes('تسجيل الدخول') && e.offsetParent);
  if (!b) throw new Error('no submit');
  const [x, y] = __ui.center(b);
  __ui.ripple(x, y);
  b.click();
})()" >/dev/null 2>&1
agent-browser wait 700 >/dev/null
shot2 05-login-loading

echo "── [6] wait dashboard, dismiss what's-new"
agent-browser wait --url "/dashboard" >/dev/null 2>&1 || true
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 2500 >/dev/null
attach
FU=$(agent-browser eval "(async () => { const b=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').trim()==='فهمت'&&e.offsetParent); if(b){b.click();return 'dismissed'} return 'none' })()" 2>/dev/null | tr -d '"')
echo "  modal: $FU"
agent-browser wait 1200 >/dev/null
attach
shot2 06-dashboard

echo "── [7] open النظام menu → الإعدادات"
# click ONCE per attempt, verify the menu actually opened before proceeding
for i in 1 2 3; do
  R=$(snapref 'button "النظام"')
  if [ -n "$R" ]; then
    C=$(center_of "@$R")
    agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null 2>&1 || true
    agent-browser click "@$R" >/dev/null 2>&1 || true
    agent-browser wait 850 >/dev/null
    M=$(agent-browser snapshot -c 2>/dev/null | grep -F 'menuitem "الإعدادات"' | head -1)
    [ -n "$M" ] && break
  fi
  agent-browser wait 800 >/dev/null
done
attach
R=$(snapref 'menuitem "الإعدادات"')
C=$(center_of "@$R")
agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null 2>&1
agent-browser wait 600 >/dev/null
shot2 07-system-menu
agent-browser click "@$R" >/dev/null
agent-browser wait --load networkidle >/dev/null
agent-browser wait 2000 >/dev/null
attach

echo "── [8] settings: بيانات المعمل"
shot2 08-settings-lab

echo "── [9..12] tab tour"
for pair in "الترقيم والعملة:09-numbering" "أنواع العمل:10-worktypes" "المستخدمون والأدوار:11-users" "النسخ الاحتياطي:12-backup"; do
  T="${pair%%:*}"; NAME="${pair##*:}"
  R=$(snapref "tab \"$T\"")
  if [ -z "$R" ]; then R=$(snapref "$T"); fi
  C=$(center_of "@$R")
  agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null 2>&1
  agent-browser click "@$R" >/dev/null || agent-browser click "@$R" >/dev/null
  agent-browser wait 1100 >/dev/null
  shot2 "$NAME"
done

echo "── [13] back to lab info + save (unchanged values = safe)"
R=$(snapref "tab \"بيانات المعمل\"")
[ -z "$R" ] && R=$(snapref "بيانات المعمل")
agent-browser click "@$R" >/dev/null
agent-browser wait 1000 >/dev/null
attach
agent-browser eval "(async () => {
  const b = [...document.querySelectorAll('button')].find(e => (e.textContent||'').trim()==='حفظ' && e.offsetParent);
  if (!b) throw new Error('no save');
  const [x, y] = __ui.center(b);
  __ui.ripple(x, y);
  b.click();
})()" >/dev/null 2>&1
agent-browser wait 1600 >/dev/null
shot2 13-saved

echo "── done: $(ls "$FD" | wc -l) frames in $FD"
