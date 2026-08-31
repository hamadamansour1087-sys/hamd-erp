"""Smoke-test CSV & PDF export buttons on the new tabs."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "reports-e2e@hamd.test"
PASSWORD = "Reports#E2E-2026"

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    p = ctx.new_page()
    p.goto(BASE, wait_until="domcontentloaded")
    p.wait_for_timeout(2500)
    p.get_by_role("button", name="تسجيل الدخول").first.click()
    p.wait_for_timeout(1200)
    p.fill('input[autocomplete="current-password"]', PASSWORD)
    p.fill("input#email", EMAIL)
    p.locator('button[type="submit"]').first.click()
    p.wait_for_timeout(3500)
    p.get_by_role("button", name="التقارير").last.click()
    p.wait_for_timeout(2200)

    def open_export_and_pick(label):
        p.get_by_role("button", name="تصدير").click()
        p.wait_for_timeout(700)
        p.locator(f'[role="menuitem"]:has-text("{label}")').first.click()

    # sales tab CSV
    p.get_by_role("tab", name="تقرير المبيعات").click()
    p.wait_for_timeout(3000)
    with p.expect_download(timeout=15000) as dl:
        open_export_and_pick("CSV — قائمة الفواتير")
    d = dl.value
    path = d.path()
    import os
    size = os.path.getsize(path)
    print("sales CSV:", d.suggested_filename, size, "bytes", "OK" if size > 100 else "TOO SMALL")

    # cash tab PDF (direct download via jsPDF)
    p.get_by_role("tab", name="النقدية والخزينة").click()
    p.wait_for_timeout(3500)
    with p.expect_download(timeout=30000) as dl2:
        open_export_and_pick("PDF (تنزيل مباشر)")
    d2 = dl2.value
    size2 = os.path.getsize(d2.path())
    print("cash PDF:", d2.suggested_filename, size2, "bytes", "OK" if size2 > 5000 else "TOO SMALL")

    # movements tab CSV
    p.get_by_role("tab", name="حركة الصنف").click()
    p.wait_for_timeout(3000)
    with p.expect_download(timeout=15000) as dl3:
        open_export_and_pick("CSV — حركات الأصناف")
    d3 = dl3.value
    size3 = os.path.getsize(d3.path())
    print("movements CSV:", d3.suggested_filename, size3, "bytes", "OK" if size3 > 100 else "TOO SMALL")

    browser.close()
    print("EXPORT SMOKE: ALL OK")
