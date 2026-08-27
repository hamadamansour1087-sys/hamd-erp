'use client'

import * as React from 'react'

/** Tracks navigator.onLine with reactivity. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(true)
  React.useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    setOnline(navigator.onLine)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
