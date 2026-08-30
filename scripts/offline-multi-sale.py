#!/usr/bin/env python3
"""
Multi-invoice offline test: 2 sales in ONE offline session → queue survives
reopen → both sync on reconnect → exactly 2 new invoices, zero duplicates.
Outputs the two Idempotency-Keys for the DB verifier.
"""
import json, time, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
out = {"ok": True}

def must(cond, name, detail=""):
    print(("PASS" if cond else "FAIL"), name, ("— " + detail if detail else ""))
    out["ok"] = out["ok"] and bool(cond)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(locale="ar-EG")
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="load", timeout=30000)
    page.click('button:has-text("ابدأ الآن")', timeout=15000)
    page.fill('input[autocomplete="email"]', "offline-e2e@hamd.test")
    page.fill('input[autocomplete="current-password"]', "Offline#2026")
    page.click('button[type="submit"]')
    page.wait_for_selector("text=نقطة البيع", timeout=30000)
    page.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
    page.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=30000)
    time.sleep(1.5)

    boot = page.evaluate("() => fetch('/api/bootstrap', {credentials:'include'}).then(r=>r.json()).then(j=>{const p=j.data.products||[]; return p.filter(x=>x.stock>0).slice(0,2).map(x=>({name:x.name, id:x.id}))})")
    p1, p2 = boot[0], boot[1]
    print("products:", p1["name"], "+", p2["name"])

    # GO OFFLINE — sell twice
    ctx.set_offline(True)
    time.sleep(0.5)

    keys = []
    for i, prod in enumerate([p1, p2], 1):
        page.fill('input[placeholder*="ابحث عن منتج"]', prod["name"][:4])
        time.sleep(0.8)
        page.locator(f'text={prod["name"]}').first.click()
        time.sleep(0.6)
        page.locator('button:has-text("إتمام البيع")').first.click()
        try:
            page.wait_for_selector("text=حُفظ على هذا الجهاز", timeout=10000)
            # close the success dialog for the next sale
            page.locator('button:has-text("فاتورة جديدة")').first.click()
            time.sleep(0.5)
            keys_ok = True
        except Exception as e:
            keys_ok = False
            print("ERR:", str(e)[:120])
        item = page.evaluate("() => { try { const q = JSON.parse(localStorage.getItem('tijara-mq')||'[]'); return q[q.length-1] } catch(e){ return null } }")
        keys.append(item["id"] if item else None)
        must(keys_ok and item is not None, f"بيع Offline رقم {i}", f"key={item['id'][:12] if item else None}")

    must(page.evaluate("() => JSON.parse(localStorage.getItem('tijara-mq')||'[]').length") == 2, "الـ Queue = 2")

    # reopen offline — queue survives
    page.close()
    page2 = ctx.new_page()
    page2.goto(BASE + "/", wait_until="load", timeout=15000)
    page2.wait_for_selector("text=نقطة البيع", timeout=20000)
    q2 = page2.evaluate("() => JSON.parse(localStorage.getItem('tijara-mq')||'[]').length")
    chip = page2.locator("text=2 تغييرين بانتظار المزامنة").count()
    chip_generic = page2.locator("[class*='fixed']:has-text('بانتظار المزامنة')").count()
    must(q2 == 2, "إعادة فتح Offline → الـ Queue = 2", f"chip={chip}/{chip_generic}")

    # back online → both sync
    ctx.set_offline(False)
    try:
        page2.wait_for_function("() => JSON.parse(localStorage.getItem('tijara-mq')||'[]').length === 0", timeout=45000)
        must(True, "عودة الإنترنت → مزامنة الفاتورين → Queue = 0")
    except Exception as e:
        must(False, "عودة الإنترنت → مزامنة الفاتورين → Queue = 0", str(e)[:100])

    b.close()

out["keys"] = keys
print("KEYS=" + json.dumps(keys))
sys.exit(0 if out["ok"] else 3)
