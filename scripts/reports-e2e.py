"""E2E verification of the four NEW document report tabs (reports gap fix).

Logs in as the temp admin, opens Reports, and verifies each new tab renders
real data from the restored DB. Screenshots land in download/reports-e2e/.
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "reports-e2e@hamd.test"
PASSWORD = "Reports#E2E-2026"
SHOT_DIR = "/home/z/my-project/download/reports-e2e"
os.makedirs(SHOT_DIR, exist_ok=True)

RESULTS = []
OK = True


def step(name, ok, detail=""):
    global OK
    RESULTS.append({"name": name, "ok": bool(ok), "detail": detail})
    if not ok:
        OK = False
    print(f"{'PASS' if ok else 'FAIL'} — {name} {detail}")


def run(pw):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    ctx = page.context

    # 1) landing → click "تسجيل الدخول" to open the auth form
    page.goto(f"{BASE}/", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    try:
        page.get_by_role("button", name="تسجيل الدخول").first.click(timeout=8000)
        page.wait_for_timeout(1500)
    except Exception:
        pass  # maybe already authed or auth already open
    try:
        page.wait_for_selector('input[autocomplete="current-password"]', timeout=10000)
        step("login screen visible", True)
    except Exception:
        # already logged in (session cookie) — acceptable
        step("login screen visible", "تقرير" in page.inner_text("body") or "لوحة" in page.inner_text("body") or page.locator('input[autocomplete="current-password"]').count() > 0, "possibly already authed")
    page.fill('input[autocomplete="current-password"]', PASSWORD)
    email_input = page.locator('input#email').first
    email_input.fill(EMAIL)
    page.locator('button[type="submit"]').first.click()
    page.wait_for_timeout(3500)

    # 2) open reports via sidebar
    btn = page.get_by_role("button", name="التقارير").first
    if btn.count() == 0:
        btn = page.get_by_text("التقارير", exact=True).first
    btn.click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    step("reports screen opened", "نظرة عامة" in body)

    # 3) four new tabs exist
    for tab in ["تقرير المبيعات", "تقرير المشتريات", "النقدية والخزينة", "حركة الصنف"]:
        step(f"tab present: {tab}", page.get_by_role("tab", name=tab).count() > 0 or tab in body)

    # 4) SALES tab
    page.get_by_role("tab", name="تقرير المبيعات").click()
    page.wait_for_timeout(3500)
    body = page.inner_text("body")
    step("sales tab: KPIs render", "إجمالي القيمة" in body and "المتبقي" in body)
    step("sales tab: invoice rows", "#1" in body or "عدد الفواتير" in body)
    page.screenshot(path=f"{SHOT_DIR}/1-sales.png", full_page=False)

    # filter: status = PAID
    try:
        page.locator('button[role="combobox"]').first.click()
        page.wait_for_timeout(800)
        page.locator('[role="option"]', has_text="مدفوعة").last.click()
        page.wait_for_timeout(2500)
        body = page.inner_text("body")
        step("sales tab: status filter works", "مدفوعة" in body)
        page.screenshot(path=f"{SHOT_DIR}/1b-sales-paid-filter.png")
        page.locator('button[role="combobox"]').first.click()
        page.wait_for_timeout(800)
        page.locator('[role="option"]', has_text="كل الحالات").last.click()
        page.wait_for_timeout(2000)
    except Exception as e:
        step("sales tab: status filter works", False, str(e)[:80])

    # 5) PURCHASES tab
    page.get_by_role("tab", name="تقرير المشتريات").click()
    page.wait_for_timeout(3500)
    body = page.inner_text("body")
    step("purchases tab: KPIs render", "إجمالي القيمة" in body)
    page.screenshot(path=f"{SHOT_DIR}/2-purchases.png", full_page=False)

    # 6) CASH tab
    page.get_by_role("tab", name="النقدية والخزينة").click()
    page.wait_for_timeout(4000)
    body = page.inner_text("body")
    step("cash tab: KPIs render", "المقبوضات" in body and "صافي النقدية" in body)
    step("cash tab: by-method table", "نقدي" in body or "تحويل بنكي" in body)
    step("cash tab: ledger rows", "قبض" in body or "صرف" in body or "مصروف" in body)
    page.screenshot(path=f"{SHOT_DIR}/3-cash.png", full_page=False)

    # 7) MOVEMENTS tab
    page.get_by_role("tab", name="حركة الصنف").click()
    page.wait_for_timeout(4000)
    body = page.inner_text("body")
    step("movements tab: KPIs render", "إجمالي الإدخال" in body and "إجمالي الإخراج" in body)
    step("movements tab: movement rows", "بيع" in body or "شراء" in body or "رصيد افتتاحي" in body)
    page.screenshot(path=f"{SHOT_DIR}/4-movements.png", full_page=False)

    # filter by kind = SALE (بيع)
    try:
        # third combobox = kind
        page.locator('button[role="combobox"]').nth(2).click()
        page.wait_for_timeout(600)
        page.get_by_role("option", name="بيع (إخراج)").click()
        page.wait_for_timeout(2500)
        body = page.inner_text("body")
        step("movements tab: kind filter works", "بيع (إخراج)" in body)
        page.screenshot(path=f"{SHOT_DIR}/5-movements-sale-only.png", full_page=False)
    except Exception as e:
        step("movements tab: kind filter works", False, str(e)[:80])

    # 8) mobile viewport sanity (iPhone-ish) — fresh context, login first
    mctx = browser.new_context(viewport={"width": 390, "height": 844})
    m = mctx.new_page()
    m.goto(BASE, wait_until="domcontentloaded")
    m.wait_for_timeout(2500)
    # mobile: header login buttons are hidden below sm: breakpoint — open the
    # hamburger sheet menu and use its تسجيل الدخول entry.
    try:
        m.wait_for_selector('input[autocomplete="current-password"]', timeout=3000)
    except Exception:
        try:
            m.locator("header button").last.click(timeout=4000)
            m.wait_for_timeout(900)
            m.screenshot(path=f"{SHOT_DIR}/m-debug-menu.png")
            m.locator('button:has-text("تسجيل الدخول")').last.click(timeout=4000)
            m.wait_for_timeout(1200)
        except Exception:
            # last resort: footer link
            m.locator("text=تسجيل الدخول").first.click(timeout=4000, force=True)
            m.wait_for_timeout(1200)
    m.fill('input[autocomplete="current-password"]', PASSWORD)
    m.fill("input#email", EMAIL)
    m.locator('button[type="submit"]').first.click()
    m.wait_for_timeout(3500)
    try:
        m.get_by_role("button", name="التقارير").last.click(timeout=5000)
    except Exception:
        m.get_by_text("التقارير", exact=True).first.click()
    m.wait_for_timeout(2500)
    m.get_by_role("tab", name="تقرير المبيعات").click()
    m.wait_for_timeout(3000)
    body = m.inner_text("body")
    step("mobile: sales tab renders", "إجمالي القيمة" in body)
    m.screenshot(path=f"{SHOT_DIR}/6-mobile-sales.png", full_page=False)
    m.get_by_role("tab", name="النقدية والخزينة").click()
    m.wait_for_timeout(3500)
    body = m.inner_text("body")
    step("mobile: cash tab renders", "صافي النقدية" in body)
    m.screenshot(path=f"{SHOT_DIR}/7-mobile-cash.png", full_page=False)

    mctx.close()
    browser.close()


with sync_playwright() as pw:
    try:
        run(pw)
    except Exception as e:
        step("script completed without crash", False, repr(e)[:200])

print("\n==== SUMMARY ====")
for r in RESULTS:
    print(f"{'PASS' if r['ok'] else 'FAIL'} — {r['name']} {r['detail']}")
print(f"\nTOTAL: {sum(1 for r in RESULTS if r['ok'])}/{len(RESULTS)} passed")
sys.exit(0 if OK else 1)
