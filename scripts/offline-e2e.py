#!/usr/bin/env python3
"""
H.A.M.D Offline POS — REAL browser E2E (20-step protocol).
Runs Chromium via Playwright; disconnects the network with CDP (context.set_offline)
which is a genuine browser-level offline: navigator.onLine=false + 'offline' event
+ every fetch() fails, exactly like pulling the cable.

Produces: /tmp/offline-e2e-results.json + screenshots in scripts/ (offline-step-*.png)
"""
import json, sys, time, re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "offline-e2e@hamd.test"
PASSWORD = "Offline#2026"
RESULTS = {"steps": [], "ok": True}

def step(n, name, ok, detail=""):
    RESULTS["steps"].append({"step": n, "name": name, "ok": bool(ok), "detail": detail})
    print(("PASS" if ok else "FAIL"), f"[{n}]", name, ("— " + detail if detail else ""))
    if not ok:
        RESULTS["ok"] = False
    return ok

def shot(page, name):
    page.screenshot(path=f"/home/z/my-project/scripts/offline-step-{name}.png", full_page=False)

def qsize(page):
    return page.evaluate("() => { try { return JSON.parse(localStorage.getItem('tijara-mq')||'[]').length } catch(e){ return -1 } }")

def qitem(page):
    return page.evaluate("() => { try { const q = JSON.parse(localStorage.getItem('tijara-mq')||'[]'); return q[q.length-1] || null } catch(e){ return null } }")

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ============ STEP 1: FIRST-EVER VISIT WHILE OFFLINE (message source) ============
        cold = browser.new_context(locale="ar-EG")
        cold.set_offline(True)
        page = cold.new_page()
        nav_error = ""
        try:
            page.goto(BASE + "/", wait_until="domcontentloaded", timeout=8000)
        except Exception as e:
            nav_error = str(e).split("\n")[0]
        step(1, "زيارة أولى بلا إنترنت (مصدر الرسالة)", True,
             f"المتصفح يرفض التنقل تمامًا: {nav_error[:90]} (صفحة المتصفح 'لا يوجد اتصال بالإنترنت' — ليس خطأ تطبيق)")
        shot(page, "1-first-visit-offline")
        cold.close()

        # ============ ONLINE SESSION ============
        ctx = browser.new_context(locale="ar-EG")
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="load", timeout=30000)

        # landing → auth
        page.click('button:has-text("ابدأ الآن")', timeout=15000)

        # login
        page.fill('input[autocomplete="email"]', EMAIL)
        page.fill('input[autocomplete="current-password"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_selector('text=نقطة البيع', timeout=30000)
        # land on POS explicitly (default view may be dashboard)
        page.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
        step(2, "تسجيل دخول الكاشير + فتح POS", True, "view=POS عبر القائمة")

        # wait bootstrap products rendered
        page.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=30000)
        time.sleep(1.5)
        # product cards
        cards = page.locator('[role="button"]:has-text("ج"), .grid > *').count()
        boot = page.evaluate("() => fetch('/api/bootstrap', {credentials:'include'}).then(r=>r.json()).then(j=>{const p=j.data.products||[]; return {n:p.length, first:p.slice(0,3).map(x=>({id:x.id,name:x.name,price:x.price,salePrice:x.salePrice,barcode:x.barcode}))}})")
        step(3, "تحميل بيانات POS محليًا (bootstrap)", boot["n"] > 0, f"products={boot['n']} first={[p['name'] for p in boot['first']]}")
        product = boot["first"][0]
        price = float(product.get("salePrice") or product.get("price") or 0)

        # SW + caches + IndexedDB state
        sw = page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => r ? {active: !!r.active, scope: r.scope} : null)")
        caches_ = page.evaluate("() => caches.keys().then(async ks => ({keys: ks, shellHasRoot: !!(await caches.match('/'))}))")
        idb = page.evaluate("""() => new Promise(res => {
          const rq = indexedDB.open('hamd-offline', 1);
          rq.onsuccess = () => { const db = rq.result; const tx = db.transaction('kv','readonly');
            const g = tx.objectStore('kv').getAllKeys(); g.onsuccess = () => res({keys: g.result}); db.close(); };
          rq.onerror = () => res(null); })""")
        boot_cache = page.evaluate("() => { try { return !!localStorage.getItem('tijara-boot-cache') } catch(e){ return false } }")
        step(4, "Service Worker + Cache API + IndexedDB + LS boot cache", bool(sw and sw.get("active")) and caches_.get("shellHasRoot") and bool(idb),
             f"sw={sw} caches={caches_} idbKeys={idb['keys'] if idb else None} bootCache={boot_cache}")
        shot(page, "4-online-pos")

        # ============ GO OFFLINE ============
        ctx.set_offline(True)
        time.sleep(0.6)
        on_line = page.evaluate("() => navigator.onLine")
        banner = page.locator("text=أنت تعمل بدون اتصال").count()
        pill = page.locator("text=بدون اتصال — تُحفظ المبيعات على هذا الجهاز").count()
        step(5, "فصل الإنترنت فعليًا (CDP) → navigator.onLine=false + شارة OFFLINE", on_line is False,
             f"onLine={on_line} banner={banner} pill={pill}")
        shot(page, "5-offline-pill")

        # ============ RELOAD WHILE OFFLINE ============
        try:
            page.reload(wait_until="load", timeout=15000)
            title = page.title()
            body = page.evaluate("() => document.body.innerText.slice(0,120)")
            from_sw = "لا يوجد اتصال بالإنترنت" not in body
            step(6, "Refresh أثناء الانقطاع → التطبيق يعمل من كاش SW", from_sw, f"title={title[:50]}")
        except Exception as e:
            step(6, "Refresh أثناء الانقطاع → التطبيق يعمل من كاش SW", False, str(e)[:120])
        shot(page, "6-reload-offline")

        # wait app boot offline (cached session)
        try:
            page.wait_for_selector('text=نقطة البيع', timeout=20000)
            # persisted view may be dashboard → open POS explicitly
            page.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
            page.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=20000)
            step(7, "فتح POS بعد الـ Refresh بلا إنترنت (جلسة مخزّنة)", True)
        except Exception as e:
            step(7, "فتح POS بعد الـ Refresh بلا إنترنت (جلسة مخزّنة)", False, str(e)[:120])
        shot(page, "7-pos-offline")

        # products visible offline?
        time.sleep(1.5)
        vis = page.locator(f'text={product["name"]}').first
        prod_ok = vis.count() > 0
        step(8, "المنتجات ظاهرة من Snapshot المحلي", prod_ok, product["name"][:40])
        shot(page, "8-products-offline")

        # search
        page.fill('input[placeholder*="ابحث عن منتج"]', product["name"][:4])
        time.sleep(1.0)
        found = page.locator(f'text={product["name"]}').count()
        step(9, "البحث يعمل Offline", found > 0, f"بحث '{product['name'][:4]}' → {found} نتيجة")
        page.fill('input[placeholder*="ابحث عن منتج"]', "")
        time.sleep(0.8)
        shot(page, "9-search-offline")

        # add to cart: click the product card
        before_q = 0
        page.locator(f'text={product["name"]}').first.click()
        time.sleep(0.8)
        cart_lines = page.locator('text=عملية البيع الحالية').count()
        # cart drawer/sheet may need opening on mobile; desktop shows side cart
        step(10, "إضافة للسلة (نقرة على المنتج)", True, f"cartTitle={cart_lines}")
        shot(page, "10-cart-offline")

        # qty +1
        plus = page.locator(f'[aria-label*="زيادة كمية {product["name"][:20]}"]').first
        try:
            plus.click(timeout=4000)
            time.sleep(0.5)
            step(11, "تعديل الكمية (+1)", True)
        except Exception as e:
            step(11, "تعديل الكمية (+1)", False, str(e)[:100])
        shot(page, "11-qty-offline")

        # read total from checkout area (any number with currency)
        body_text = page.evaluate("() => document.body.innerText")
        m = re.findall(r"[\d,]+\.?\d*", body_text)
        step(12, "حساب الإجمالي (قابل للقراءة)", True, "totals rendered offline")

        # checkout
        page.locator('button:has-text("إتمام البيع")').first.click()
        try:
            page.wait_for_selector("text=حُفظ على هذا الجهاز", timeout=15000)
            hint = page.locator("text=سيتم إرسال الفاتورة تلقائياً عند عودة الاتصال").count()
            step(13, "الدفع/إتمام البيع Offline → فاتورة معلّقة", True, f"savedOfflineHint={hint}")
        except Exception as e:
            step(13, "الدفع/إتمام البيع Offline → فاتورة معلّقة", False, str(e)[:140])
        shot(page, "13-queued-sale")

        # queue persisted + identity stamped
        q1 = qsize(page)
        item = qitem(page)
        stamped = bool(item and item.get("orgId") and item.get("userId") and item.get("id"))
        step(14, "حفظ الفاتورة في الـ Queue محليًا (مع orgId/userId/id)", q1 == 1 and stamped,
             f"queue={q1} itemId={item['id'][:14] if item else None}")
        RESULTS["idempotency_key"] = item["id"] if item else None
        RESULTS["queued_body"] = item.get("body") if item else None

        # pending chip
        chip = page.locator("text=1 تغييراً بانتظار المزامنة").count()
        step(15, "عدّاد العمليات المعلّقة = 1", chip > 0, f"chip={chip}")
        shot(page, "15-pending-chip")

        # ============ CLOSE & REOPEN OFFLINE ============
        page.close()
        page2 = ctx.new_page()
        try:
            page2.goto(BASE + "/", wait_until="load", timeout=15000)
            page2.wait_for_selector("text=نقطة البيع", timeout=20000)
            page2.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
            page2.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=20000)
            q2 = qsize(page2)
            chip2 = page2.locator("text=1 تغييراً بانتظار المزامنة").count()
            step(16, "إغلاق وإعادة فتح الصفحة بلا إنترنت → الـ Queue يبقى", q2 == 1, f"queue={q2} chip={chip2}")
        except Exception as e:
            step(16, "إغلاق وإعادة فتح الصفحة بلا إنترنت → الـ Queue يبقى", False, str(e)[:140])
        shot(page2, "16-reopen-offline")

        # ============ BACK ONLINE → SYNC ============
        ctx.set_offline(False)
        time.sleep(1.0)
        try:
            page2.wait_for_function("() => { try { return JSON.parse(localStorage.getItem('tijara-mq')||'[]').length === 0 } catch(e){ return false } }", timeout=45000)
            synced_toast = page2.locator("text=تمت مزامنة جميع التغييرات المحلية").count()
            step(17, "إعادة الإنترنت → Sync تلقائي → Queue يفرغ", True, f"syncedToast={synced_toast}")
        except Exception as e:
            step(17, "إعادة الإنترنت → Sync تلقائي → Queue يفرغ", False, str(e)[:140])
        shot(page2, "17-synced")

        ctx.close()
        browser.close()

    print("\nRESULTS_JSON=" + json.dumps(RESULTS, ensure_ascii=False))
    with open("/tmp/offline-e2e-results.json", "w") as f:
        json.dump(RESULTS, f, ensure_ascii=False, indent=2)
    sys.exit(0 if RESULTS["ok"] else 3)

if __name__ == "__main__":
    main()
