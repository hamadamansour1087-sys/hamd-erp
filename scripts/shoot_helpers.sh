# Shared helpers v2 — DOM-direct interaction (immune to React re-render ref drift)
# source scripts/shoot_helpers.sh

KIT_JS='window.__ui = {
  btn: (txt) => [...document.querySelectorAll("button,a,[role=tab]")].filter(e => e.offsetParent !== null).find(e => (e.textContent||"").trim().includes(txt)),
  inputs: () => [...document.querySelectorAll("input")].filter(e => e.offsetParent !== null && !e.disabled && e.type !== "checkbox" && e.type !== "hidden" && e.type !== "radio" && e.type !== "file" && e.type !== "search" && !e.readOnly),
  set: (el, v) => { const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; p.call(el, v); el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true})); },
  center: (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; },
  ripple: (x, y) => { const d = document.createElement("div"); d.style.cssText = "position:fixed;left:"+(x-30)+"px;top:"+(y-30)+"px;width:60px;height:60px;border-radius:50%;border:6px solid #00c47f;background:rgba(0,196,127,.35);z-index:2147483647;pointer-events:none;transition:all .5s ease-out;opacity:1"; document.body.appendChild(d); requestAnimationFrame(()=>{ d.style.transform="scale(2.2)"; d.style.opacity="0"; }); setTimeout(()=>d.remove(), 550); return "ok"; }
}; "kit-ok"'

attach() { agent-browser eval "$KIT_JS" >/dev/null 2>&1 || true; }

goto() {
  agent-browser open "$1" >/dev/null
  agent-browser wait --load networkidle >/dev/null
  agent-browser wait 2800 >/dev/null
  attach
}

shot() { agent-browser screenshot "assets-video/frames/$1/$2.png" >/dev/null; }

snapref() { # pattern -> ref: line-select by fixed string, then extract ref (2 attempts)
  local line r
  line=$(agent-browser snapshot -c 2>/dev/null | grep -F "$1" | head -1)
  if [ -z "$line" ]; then agent-browser wait 2000 >/dev/null; line=$(agent-browser snapshot -c 2>/dev/null | grep -F "$1" | head -1); fi
  r=$(printf '%s' "$line" | grep -oP 'ref=\K[e0-9]+' | head -1)
  echo "$r"
}

center_of() { # ref -> "x y"
  local BOX X Y W H
  BOX=$(agent-browser get box "$1")
  X=$(echo "$BOX" | awk '/^x:/{print $2}')
  Y=$(echo "$BOX" | awk '/^y:/{print $2}')
  W=$(echo "$BOX" | awk '/^width:/{print $2}')
  H=$(echo "$BOX" | awk '/^height:/{print $2}')
  echo "$(python3 -c "print(int($X+$W/2))" 2>/dev/null || echo 0) $(python3 -c "print(int($Y+$H/2))" 2>/dev/null || echo 0)"
}

# jfill <index> <value> — set Nth visible form input (React-safe)
jfill() {
  local V; V=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$2")
  agent-browser eval "(async () => {
    const inp = __ui.inputs()[$1];
    if (!inp) throw new Error('no input at index $1');
    __ui.set(inp, $V);
    return 'filled:' + inp.type;
  })()" >/dev/null 2>>/tmp/eb-errors.log
}

# jripple_input <index> — ripple on Nth input
jripple_input() {
  agent-browser eval "(async () => {
    const inp = __ui.inputs()[$1];
    const [x, y] = __ui.center(inp);
    __ui.ripple(x, y);
  })()" >/dev/null 2>>/tmp/eb-errors.log
}

# jclick <text> — ripple + click element containing text
jclick() {
  local T; T=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1")
  agent-browser eval "(async () => {
    const b = __ui.btn($T);
    if (!b) throw new Error('no button');
    const [x, y] = __ui.center(b);
    __ui.ripple(x, y);
    b.click();
    return 'clicked';
  })()" >/dev/null 2>>/tmp/eb-errors.log
}

# jcount_inputs — number of visible form inputs
jcount_inputs() {
  agent-browser eval "(async () => __ui.inputs().length)()" 2>/dev/null | tr -d '"'
}

# wait_inputs <n> <attempts> — retry until visible input count == n
wait_inputs() {
  local want=$1 tries=${2:-5} got
  for ((i=1;i<=tries;i++)); do
    got=$(jcount_inputs)
    if [ "$got" = "$want" ]; then echo "$got"; return 0; fi
    agent-browser wait 1400 >/dev/null; attach
  done
  echo "$got"
}

# real_click "<pattern>" — snapref + ripple + Playwright real input click (works with Radix)
real_click() {
  local R=$(snapref "$1")
  if [ -z "$R" ]; then echo "NO-REF: $1" >> /tmp/eb-errors.log; return 1; fi
  local C=$(center_of "@$R")
  agent-browser eval "(async () => { const [x, y] = [$C]; __ui.ripple(x, y); })()" >/dev/null 2>&1
  agent-browser click "@$R" >/dev/null
  return 0
}
