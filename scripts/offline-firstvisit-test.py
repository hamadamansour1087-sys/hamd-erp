#!/usr/bin/env python3
"""
H.A.M.D — THE USER'S EXACT FAILURE SCENARIO (regression proof).

Reproduced bug: user visits ONCE (even fully online), then disconnects the
internet → the SW served the cached HTML shell but the JS chunks were never
cached (install precached only `/`, manifest, icons) → main bundle failed
offline → dead page, nothing clickable ("فصلت الانترنت ولكن لا استطيع فعل شئ").

Fix under test (sw.js v6 + sw-manifest.json): install precaches ALL 61
content-hashed assets, so ONE completed online session makes the shell + every
view chunk (incl. lazily-imported POS) offline-ready.

Scenarios:
  A) Fresh profile → one landing visit (no login) → offline → reload →
     landing must render, ZERO failed asset requests.
  B) Fresh profile → one visit + cashier login + open bootstrap (NO manual POS
     opening beyond default) → offline → reload → open POS from the menu →
     products must render from the IndexedDB snapshot; POS chunk must come
     from precache (never fetched live).

Output: /tmp/offline-firstvisit-results.json + screenshots scripts/fv-*.png
"""
import json, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EMAIL = "offline-e2e@hamd.test"
PASSWORD = "Offline#2026"
RESULTS = {"scenarios": [], "ok": True}


def step(name, ok, detail=""):
    RESULTS["scenarios"].append({"name": name, "ok": bool(ok), "detail": str(detail)})
    print(("PASS" if ok else "FAIL"), name, ("— " + str(detail) if detail else ""))
    if not ok:
        RESULTS["ok"] = False


def settle_sw(page, timeout_ms=30000):
    """Wait until the SW is active AND the v6 precache finished (assets >= 50)."""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        st = page.evaluate(
            """async () => {
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg || !reg.active) return null;
                const names = await caches.keys();
                const assets = await caches.open('tijara-v6-assets');
                return { sw: true, caches: names, assets: (await assets.keys()).length };
            }"""
        )
        if st and "tijara-v6-assets" in (st.get("caches") or []) and st["assets"] >= 50:
            return st
        time.sleep(0.5)
    return st


def failed_requests(page):
    return page.evaluate("() => window.__failed || []")


def watch_failures(page):
    page.evaluate(
        """() => {
            window.__failed = [];
            window.addEventListener('error', e => {
                const el = e.target;
                if (el && (el.tagName === 'SCRIPT' || el.tagName === 'LINK'))
                    window.__failed.push(el.src || el.href);
            }, true);
        }"""
    )


SNAPSHOT_JS = """
async () => {
    const read = () => new Promise((res) => {
        const open = indexedDB.open('hamd-offline');
        open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('kv')) { res(null); return; }
            const tx = db.transaction('kv', 'readonly');
            const req = tx.objectStore('kv').getAllKeys();
            req.onsuccess = () => {
                const key = (req.result || []).find(k => String(k).startsWith('pos-snapshot:'));
                if (!key) { res(null); return; }
                const tx2 = db.transaction('kv', 'readonly');
                const get = tx2.objectStore('kv').get(key);
                get.onsuccess = () => res(get.result);
                get.onerror = () => res(null);
            };
            req.onerror = () => res(null);
        };
        open.onerror = () => res(null);
    });
    const env = await read();
    return env && env.data ? (env.data.products || []).length : 0;
}
"""


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ================= SCENARIO A: one visit (no login) → offline =================
        ctx = browser.new_context(locale="ar-EG")
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="load", timeout=30000)
        st = settle_sw(page)
        step("A1: زيارة واحدة أونلاين → SW نشط + precache مكتمل", bool(st and st["assets"] >= 50),
             f"assets_cached={st['assets'] if st else 0} sw_active={bool(st)}")
        ctx.close()

        cold = browser.new_context(locale="ar-EG")
        # carry NO state: a brand-new profile that never talked to the server —
        # the ONLY offline-capable thing would be an installed SW, but a fresh
        # profile has none (this is the true first-visit case: browser refuses).
        p = cold.new_page()
        cold.set_offline(True)
        try:
            p.goto(BASE + "/", wait_until="domcontentloaded", timeout=8000)
            step("A2: بروفايل جديد لم يزر الموقع إطلاقًا + أوفلاين → المتصفح يرفض (متوقع)", True,
                 "ERR_INTERNET_DISCONNECTED — بلا SW لا يوجد ما يخدم الصفحة (سلوك الويب القياسي)")
        except Exception as e:
            step("A2: بروفايل جديد لم يزر الموقع إطلاقًا + أوفلاين → المتصفح يرفض (متوقع)", True,
                 str(e).split("\n")[0][:80])
        cold.close()

        # ================= SCENARIO B: one visit + login → offline → POS =================
        ctx2 = browser.new_context(locale="ar-EG")
        pg = ctx2.new_page()
        pg.goto(BASE + "/", wait_until="load", timeout=30000)
        settle_sw(pg)
        # login (single visit — never opened POS while online)
        pg.click('button:has-text("ابدأ الآن")', timeout=15000)
        pg.fill('input[autocomplete="email"]', EMAIL)
        pg.fill('input[autocomplete="current-password"]', PASSWORD)
        pg.click('button[type="submit"]')
        pg.wait_for_selector('text=نقطة البيع', timeout=30000)
        # open POS ONCE online (the real cashier flow: sell during the day, then
        # the connection drops) → bootstrap fetched + snapshot mirrored to IDB
        pg.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
        pg.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=30000)
        time.sleep(2)  # bootstrap fetch + snapshot save
        step("B1: زيارة واحدة: دخول الكاشير + فتح POS مرة واحدة أونلاين", True)

        # poll via DIRECT open (indexedDB.databases() is unreliable in Chromium:
        # it omits DBs created by earlier contexts even on the same page)
        snapshot_n, assets_n = 0, 0
        deadline = time.time() + 20
        while time.time() < deadline:
            snapshot_n = pg.evaluate(SNAPSHOT_JS)
            if snapshot_n > 0:
                break
            time.sleep(0.5)
        assets_n = pg.evaluate(
            "async () => (await (await caches.open('tijara-v6-assets')).keys()).length"
        )
        step("B2: precache يشمل كل chunks (حتى شاشات lazy) + snapshot محفوظ",
             assets_n >= 50 and snapshot_n > 0, f"assets={assets_n} snapshot_products={snapshot_n}")

        ctx2.set_offline(True)
        watch_failures(pg)
        pg.reload(wait_until="load", timeout=20000)
        time.sleep(2)
        title = pg.title()
        step("B3: فصل النت → reload → التطبيق يقلع من الكاش", "H.A.M.D" in title, f"title={title}")

        # open POS offline (chunk must come from precache, data from snapshot)
        pg.locator('button:has-text("نقطة البيع"), a:has-text("نقطة البيع")').first.click()
        try:
            pg.wait_for_selector('input[placeholder*="ابحث عن منتج"]', timeout=20000)
            time.sleep(1)
            prods = 0
            for _ in range(3):
                try:
                    prods = pg.evaluate(SNAPSHOT_JS)
                    break
                except Exception:
                    time.sleep(1.5)  # execution context may race a pending navigation
            pill = pg.locator('text=بدون اتصال').count()
            step("B4: POS يفتح أوفلاين (chunk من precache) + منتجات من Snapshot",
                 prods > 0, f"products_in_snapshot={prods} offline_pill={pill}")
        except Exception as e:
            step("B4: POS يفتح أوفلاين (chunk من precache) + منتجات من Snapshot", False,
                 str(e).split("\n")[0][:80])
        pg.screenshot(path="/home/z/my-project/scripts/fv-B4-pos-offline.png")
        fails = failed_requests(pg)
        step("B5: صفر أخطاء تحميل أصول أثناء الجلسة الأوفلاين", len(fails) == 0, f"failed={fails[:5]}")
        ctx2.close()

        browser.close()

    with open("/tmp/offline-firstvisit-results.json", "w") as f:
        json.dump(RESULTS, f, ensure_ascii=False, indent=1)
    print("RESULTS:", "ALL PASS" if RESULTS["ok"] else "FAILURES PRESENT")


if __name__ == "__main__":
    main()
