"""Reproduce Android-style scrambled date inputs on the reports cash tab.

Hypothesis: the scramble ("022026/08/" instead of "02/08/2026") appears with an
Arabic locale (dd/mm/yyyy segment order) + touch/mobile context, while en-US
renders fine. We try several context combos and screenshot each.
"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "reports-e2e@hamd.test"
PASSWORD = "Reports#E2E-2026"
SHOT = "/home/z/my-project/download/date-fix"
os.makedirs(SHOT, exist_ok=True)

UA = (
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)


def login_and_open(pw, label, ctx_kwargs):
    browser = pw.chromium.launch()
    ctx = browser.new_context(**ctx_kwargs)
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    try:
        page.wait_for_selector('input[autocomplete="current-password"]', timeout=3000)
    except Exception:
        page.locator("header button").last.click(timeout=4000)
        page.wait_for_timeout(800)
        page.locator('button:has-text("تسجيل الدخول")').last.click(timeout=4000)
        page.wait_for_timeout(1000)
        page.wait_for_selector('input[autocomplete="current-password"]', timeout=4000)
    page.fill('input[autocomplete="current-password"]', PASSWORD)
    page.fill("input#email", EMAIL)
    page.locator('button[type="submit"]').first.click()
    page.wait_for_timeout(3000)
    page.get_by_role("button", name="التقارير").last.click(timeout=6000)
    page.wait_for_timeout(1800)
    page.get_by_role("tab", name="النقدية والخزينة").click()
    page.wait_for_timeout(3000)
    page.locator('input[type="date"]').first.scroll_into_view_if_needed()
    page.wait_for_timeout(600)
    path = f"{SHOT}/repro-{label}.png"
    # element shot of the toolbar card that contains the two date inputs
    card = page.locator('input[type="date"]').first.locator(
        "xpath=ancestor::div[contains(@class,'rounded-xl') or contains(@class,'rounded-lg')][1]"
    )
    try:
        card.screenshot(path=path, timeout=5000)
    except Exception:
        page.screenshot(path=path)
    # extract segment visual order via measuring each ::-webkit-datetime-edit-* pseudo? not exposed.
    # Instead read the rendered text via accessibility name of the fields.
    names = page.eval_on_selector_all(
        'input[type="date"]', "els => els.map(e => e.outerHTML.slice(0, 120))"
    )
    print(f"== {label} ==")
    for n in names:
        print("  ", n)
    browser.close()


with sync_playwright() as pw:
    combos = [
        ("arEG-mobile", dict(viewport={"width": 390, "height": 844}, locale="ar-EG",
                             is_mobile=True, has_touch=True, user_agent=UA,
                             device_scale_factor=2)),
        ("arEG-desktop-like", dict(viewport={"width": 390, "height": 844}, locale="ar-EG")),
        ("enUS-mobile", dict(viewport={"width": 390, "height": 844}, locale="en-US",
                             is_mobile=True, has_touch=True, user_agent=UA,
                             device_scale_factor=2)),
    ]
    for label, kw in combos:
        try:
            login_and_open(pw, label, kw)
        except Exception as e:
            print(f"== {label} == ERROR {e}")
