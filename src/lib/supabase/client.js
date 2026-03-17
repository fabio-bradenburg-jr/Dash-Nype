import { createBrowserClient } from '@supabase/ssr'

let browserClient

function createMemoryStorage() {
  const store = new Map()

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

function resolveStorage() {
  if (typeof window === 'undefined') {
    return createMemoryStorage()
  }

  try {
    const testKey = '__supabase_storage_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return window.localStorage
  } catch {
    return createMemoryStorage()
  }
}

export function createClient() {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        storage: resolveStorage(),
      },
    }
  )

  return browserClient
}
