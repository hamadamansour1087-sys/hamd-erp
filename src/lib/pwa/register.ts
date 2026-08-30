'use client'

/**
 * Registers the PWA service worker (production only).
 *
 * In dev the SW is actively removed: the dev server recompiles on the fly and
 * streams HTML that can be aborted mid-flight, so any cached shell can be
 * stale or truncated. Serving that back produces React hydration mismatches
 * ("server rendered HTML didn't match the client"). Dev must always talk to
 * the live server; leftover workers/caches from earlier sessions are cleaned
 * up automatically so no manual DevTools reset is ever needed.
 */
export function registerSW() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  if (process.env.NODE_ENV !== 'production') {
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)))
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => undefined)))
        }
      } catch {
        /* cleanup is best-effort */
      }
    })()
    return
  }

  const doRegister = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // Honest diagnostic state (Settings + support): a silent failure here is
        // exactly how "offline does nothing" used to look like a working app.
        try {
          localStorage.setItem('tijara-sw-status', 'registered')
        } catch {}
      })
      .catch((err) => {
        // NEVER swallow: a failed registration means offline mode is OFF for
        // this origin (gateway blocking /sw.js, insecure context, storage
        // block). Surface it for diagnosis instead of pretending it's fine.
        console.warn('[sw] registration failed:', err)
        try {
          localStorage.setItem('tijara-sw-status', 'failed:' + String(err?.message ?? err))
        } catch {}
      })
  }
  // Effects run AFTER the window `load` event in most hydration timelines,
  // so waiting for `load` here would never fire. Register immediately when
  // the document is already loaded, otherwise defer to `load` exactly once.
  if (document.readyState === 'complete') {
    doRegister()
  } else {
    window.addEventListener('load', doRegister, { once: true })
  }
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredInstall: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstall = e as BeforeInstallPromptEvent
    installListeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferredInstall = null
    installListeners.forEach((l) => l())
  })
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredInstall
}

export function clearInstallPrompt() {
  deferredInstall = null
  installListeners.forEach((l) => l())
}

export function onInstallAvailability(cb: () => void): () => void {
  installListeners.add(cb)
  return () => {
    installListeners.delete(cb)
  }
}
