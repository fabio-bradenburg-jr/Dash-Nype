'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'app_build_version'
const CHECK_INTERVAL = 60 * 1000 // 1 minute

export default function AppVersionWatcher() {
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) {
          localStorage.setItem(STORAGE_KEY, version)
          return
        }
        if (stored !== version) {
          localStorage.setItem(STORAGE_KEY, version)
          window.location.reload()
        }
      } catch {
        // ignore network errors
      }
    }

    check()
    const id = setInterval(check, CHECK_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return null
}
