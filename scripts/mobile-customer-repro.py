#!/usr/bin/env python3
"""
H.A.M.D — mobile customer-picker reproduction (REAL browser, touch-emulated).
Bug report: "عند عمل فاتورة بيع من الموبايل لا يمكن تغيير اسم العميل"

Runs the SAME flow twice:
  A) MOBILE context (iPhone-like: touch + small viewport + mobile UA)
  B) DESKTOP context (mouse, wide viewport)
and compares: open cart → open customer popover → pick a customer → read back
the selected name. Screenshots per step in scripts/ + JSON in /tmp.
"""
import json, os, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
EMAIL = "offline-e2e@hamd.test"
PASSWORD = "Offline#2026"
OUT = {"mobile": {}, "desktop": {}}


def flow(pw, label, mobile):
    res = {"steps": [], "ok": True}
    browser = pw.chromium.launch()
    if mobile:
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=3,
            is_mobile=True, has_touch=True, locale="ar-EG",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
    else:
        ctx = browser.new_context(viewport={"width": 1366, "height": 850}, locale="ar-EG")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append("PAGEERROR:" + str(e)[:120]))
    page.on("console", lambda m: errors.append(m.text[:120]) if m.type == "error" else None)

    def step(n, name, ok, detail=""):
        res["steps"].append({"n": n, "name": name, "ok": bool(ok), "detail": detail})
        print(("PASS" if ok else "FAIL"), f"[{label} {n}]", name, ("— " + detail if detail else ""))
        if not ok:
            res["ok"] = False

    def shot(name):
        page.screenshot(path=os.path.join(SCRIPT_DIR, f"mc-{label}-{name}.png"), full_page=False)

    try:
        page.goto(BASE + "/", wait_until="load", timeout=30000)
        # hero CTA (visible on all viewports) — NOT the navbar one (hidden on mobile)
        page.locator('button:has-text("ابدأ الآن مجاناً")').first.click(timeout=20000)
        page.fill('input[autocomplete="email"]', EMAIL)
        page.fill('input[autocomplete="current-password"]', PASSWORD)
        page.click('button[type="submit"]')
        # auth view closes → shell loads (dashboard default)
        page.wait_for_selector('input[autocomplete="email"]', state="detached", timeout=30000)
        time.sleep(1.5)
        if mobile:
            # mobile nav: hamburger → drawer sheet → POS item
            page.tap('button[aria-label="طي القائمة"]')
            page.wait_for_selector('[data-slot="sheet-content"]', timeout=8000)
            time.sleep(0.5)
            page.locator('[data-slot="sheet-content"] button:has-text("نقطة البيع")').first.tap()
        else:
            page.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
        page.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=30000)
        time.sleep(1.2)

        boot = page.evaluate("() => fetch('/api/bootstrap',{credentials:'include'}).then(r=>r.json()).then(j=>({p:(j.data.products||[])[0], c:(j.data.customers||[]).slice(0,3)}))")
        step(1, "تسجيل دخول + فتح POS", boot["p"] and boot["c"], f"product={boot['p']['name']} customers={[c['name'] for c in boot['c']]}")
        product_name = boot["p"]["name"]
        target = boot["c"][0]  # first real customer

        # add first product to cart
        card = page.locator("button", has_text=product_name).first
        (card.tap if mobile else card.click)()
        time.sleep(0.8)
        step(2, "إضافة منتج للسلة", True, product_name)

        # open cart: mobile → sticky bar button; desktop → aside already visible
        if mobile:
            view_cart = page.locator('button:has-text("فتح السلة")').first
            view_cart.tap()
            page.wait_for_selector('[data-slot="sheet-content"]', timeout=5000)
            time.sleep(0.6)
        step(3, "فتح السلة" + (" (Sheet سفلي)" if mobile else " (aside جانبي)"), True)
        shot("1-cart")

        # open customer popover (scope INSIDE cart container: sheet on mobile / aside on desktop)
        scope = '[data-slot="sheet-content"]' if mobile else 'aside'
        combo = page.locator(f'{scope} [role="combobox"]').first
        (combo.tap if mobile else combo.click)()
        time.sleep(1.2)
        pop_all = page.locator('[data-slot="popover-content"]')
        pop = pop_all.locator("visible=true")
        pop_count = pop_all.count()
        pop_visible = pop.count() > 0 and pop.first.is_visible()
        sheet_alive = page.locator('[data-slot="sheet-content"]').count() > 0
        shot("2-popover")
        step(4, "فتح قائمة العملاء (Popover)", pop_visible,
             f"popover_count={pop_count} visible={pop_visible} sheet_still_open={sheet_alive}")

        if pop_visible:
            # tap the target customer row inside the popover
            row = pop.locator(f'button:has-text("{target["name"]}")').first
            row_visible = row.is_visible()
            (row.tap if mobile else row.click)()
            time.sleep(1.2)
            combo_text = page.locator(f'{scope} [role="combobox"]').first.inner_text()
            changed = target["name"] in combo_text
            sheet_alive2 = page.locator('[data-slot="sheet-content"]').count() > 0
            shot("3-after-pick")
            step(5, "اختيار عميل وتغيير الاسم", changed,
                 f"expected='{target['name']}' combobox='{combo_text.strip()[:40]}' sheet_alive={sheet_alive2}")
        else:
            step(5, "اختيار عميل وتغيير الاسم", False, "popover never visible — cannot pick")

        real_errors = [e for e in errors if not e.startswith("40") and "401" not in e]
        step(6, "صفر أخطاء JS حقيقية (uncaught)",
             len([e for e in errors if e.startswith("PAGEERROR")]) == 0,
             f"console_resources={ [e[:60] for e in errors if not e.startswith('PAGEERROR')][:2] }")
    except Exception as e:
        step(99, "انتهى التدفق دون استثناء", False, str(e).split("\n")[0][:120])
        shot("99-exception")
    finally:
        ctx.close()
        browser.close()
    return res


def main():
    with sync_playwright() as pw:
        OUT["mobile"] = flow(pw, "MOBILE", True)
        OUT["desktop"] = flow(pw, "DESK", False)
    with open("/tmp/mobile-customer-repro.json", "w") as f:
        json.dump(OUT, f, ensure_ascii=False, indent=1)
    print("\nSUMMARY: mobile_ok=%s desktop_ok=%s" % (OUT["mobile"]["ok"], OUT["desktop"]["ok"]))


if __name__ == "__main__":
    main()
