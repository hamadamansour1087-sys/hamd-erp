#!/bin/bash
# Record video 1 — التسجيل في المنصة والموافقة (3 segments)
set +e
cd /home/z/my-project
mkdir -p assets-video/recordings

RIPPLE_JS="window.__ripple = (x, y) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:'+(x-28)+'px;top:'+(y-28)+'px;width:56px;height:56px;border-radius:50%;border:5px solid #00c47f;background:rgba(0,196,127,.35);z-index:2147483647;pointer-events:none;transition:all .55s ease-out;opacity:1'; document.body.appendChild(d); requestAnimationFrame(()=>{ d.style.transform='scale(2.4)'; d.style.opacity='0'; }); setTimeout(()=>d.remove(), 600); return 'ok'; }; 'ok'"

snapref() { # $1 = pattern → echoes ref (2 attempts; aborts recording if missing)
  local r
  r=$(agent-browser snapshot -i -c 2>/dev/null | grep -oP "$1.*?\[ref=\K[e0-9]+" | head -1)
  if [ -z "$r" ]; then agent-browser wait 2000 >/dev/null; r=$(agent-browser snapshot -i -c 2>/dev/null | grep -oP "$1.*?\[ref=\K[e0-9]+" | head -1); fi
  if [ -z "$r" ]; then agent-browser record stop >/dev/null 2>&1 || true; echo "REF MISSING: $1"; exit 1; fi
  echo "$r"
}

rip() { # $1 = ref
  local BOX X Y W H CX CY
  BOX=$(agent-browser get box "$1")
  X=$(echo "$BOX" | awk '/^x:/{print $2}')
  Y=$(echo "$BOX" | awk '/^y:/{print $2}')
  W=$(echo "$BOX" | awk '/^width:/{print $2}')
  H=$(echo "$BOX" | awk '/^height:/{print $2}')
  CX=$(python3 -c "print(int($X+$W/2))" 2>/dev/null || echo 0)
  CY=$(python3 -c "print(int($Y+$H/2))" 2>/dev/null || echo 0)
  agent-browser eval "window.__ripple($CX,$CY)" >/dev/null 2>&1 || true
}

attach() { agent-browser eval "$RIPPLE_JS" >/dev/null 2>&1 || true; }

echo "=== SEG 1: register بقالة الأمانة ==="
agent-browser cookies clear >/dev/null; agent-browser storage local clear >/dev/null
agent-browser open https://hamd-erp.vercel.app >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
agent-browser record start assets-video/recordings/v1-seg1.webm
agent-browser wait 2500 >/dev/null
E1=$(snapref 'button "ابدأ الآن — تجربة مجانية"')
rip "@$E1"; agent-browser click "@$E1" >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
E6=$(snapref 'tab "إنشاء حساب"')
rip "@$E6"; agent-browser click "@$E6" >/dev/null
agent-browser wait 1500 >/dev/null
E9=$(snapref 'textbox "اسم المحل / النشاط التجاري"')
agent-browser fill "@$E9" "بقالة الأمانة" >/dev/null
rip "@$E9"
E10=$(snapref 'textbox "اسمك"')
agent-browser fill "@$E10" "محمد علي" >/dev/null
rip "@$E10"
E11=$(snapref 'textbox "البريد الإلكتروني"')
agent-browser fill "@$E11" "video.demo2@hamd.app" >/dev/null
rip "@$E11"
E12=$(snapref 'textbox "رقم الهاتف"')
agent-browser fill "@$E12" "01122334455" >/dev/null
rip "@$E12"
E14=$(snapref 'textbox "كلمة المرور"')
agent-browser fill "@$E14" "Demo@Video2026" >/dev/null
rip "@$E14"
agent-browser wait 1400 >/dev/null
E13=$(snapref 'button "إنشاء حساب"')
rip "@$E13"; agent-browser click "@$E13" >/dev/null
agent-browser wait 4500 >/dev/null
agent-browser wait 3500 >/dev/null  # hold confirmation screen
agent-browser record stop
echo "seg1 done"

echo "=== SEG 2: platform admin approves ==="
agent-browser open https://hamd-erp.vercel.app >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
agent-browser record start assets-video/recordings/v1-seg2.webm
agent-browser wait 2000 >/dev/null
E4=$(snapref 'button "تسجيل الدخول"')
rip "@$E4"; agent-browser click "@$E4" >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
E9=$(snapref 'textbox "البريد الإلكتروني"')
agent-browser fill "@$E9" "owner@hamd.app" >/dev/null
E13=$(snapref 'textbox "كلمة المرور"')
agent-browser fill "@$E13" "Fi27juYmZKOqgmGa" >/dev/null
rip "@$E13"
E12=$(snapref 'button "تسجيل الدخول"')
rip "@$E12"; agent-browser click "@$E12" >/dev/null
agent-browser wait 4500 >/dev/null; agent-browser wait 2000 >/dev/null
attach
E10=$(snapref 'button "موافقة \+ تجربة ١٤ يوم"')
rip "@$E10"; agent-browser click "@$E10" >/dev/null
agent-browser wait 3000 >/dev/null
agent-browser wait 2500 >/dev/null
E3=$(snapref 'button "خروج"')
rip "@$E3"; agent-browser click "@$E3" >/dev/null
agent-browser wait 2500 >/dev/null
agent-browser record stop
echo "seg2 done"

echo "=== SEG 3: new org logs in ==="
agent-browser open https://hamd-erp.vercel.app >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
agent-browser record start assets-video/recordings/v1-seg3.webm
agent-browser wait 2000 >/dev/null
E4=$(snapref 'button "تسجيل الدخول"')
rip "@$E4"; agent-browser click "@$E4" >/dev/null
agent-browser wait --load networkidle >/dev/null; agent-browser wait 2800 >/dev/null
attach
E9=$(snapref 'textbox "البريد الإلكتروني"')
agent-browser fill "@$E9" "video.demo2@hamd.app" >/dev/null
rip "@$E9"
E13=$(snapref 'textbox "كلمة المرور"')
agent-browser fill "@$E13" "Demo@Video2026" >/dev/null
rip "@$E13"
E12=$(snapref 'button "تسجيل الدخول"')
rip "@$E12"; agent-browser click "@$E12" >/dev/null
agent-browser wait 6000 >/dev/null
agent-browser wait 3000 >/dev/null
agent-browser record stop
echo "seg3 done"

ls -la assets-video/recordings/
