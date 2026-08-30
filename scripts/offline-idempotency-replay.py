#!/usr/bin/env python3
"""
Idempotency replay test: re-send the EXACT same queued sale (same Idempotency-Key)
from an authenticated browser session → server must return the SAME invoice id
(reused) and must NOT create a second invoice / movement / voucher.
"""
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
KEY = sys.argv[1] if len(sys.argv) > 1 else "3i3a0p804dmmtfpdqib"
BODY = json.dumps({
    "type": "SALE",
    "warehouseId": "cmtalqc8u0006rmvp1897ovqj",
    "items": [{"productId": "cmtalqc980010rmvpcehn8id6", "qty": 2, "price": 32}],
    "paidAmount": 73.6,
    "paidMethod": "CASH",
})

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

    res = page.evaluate(
        """async ([key, body]) => {
          const r = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
            credentials: 'include',
            body,
          })
          return { status: r.status, json: await r.json() }
        }""",
        [KEY, BODY],
    )
    data = res["json"].get("data") or {}
    inv = data.get("invoice") or {}
    print(json.dumps({
        "http": res["status"],
        "reused": data.get("reused"),
        "invoiceId": inv.get("id"),
        "invoiceNumber": inv.get("number"),
        "expectId": "cmtfpdqta0007u12vejvek4jj",
        "SAME_ID": inv.get("id") == "cmtfpdqta0007u12vejvek4jj",
    }, ensure_ascii=False, indent=2))
    b.close()
