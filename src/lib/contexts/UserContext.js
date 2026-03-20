'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  applyUserAppearance,
  DEFAULT_USER_APPEARANCE,
  loadUserAppearance,
  normalizeUserAppearance,
  saveUserAppearance,
} from '@/lib/user-appearance-storage'

const UserContext = createContext({})

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [access, setAccess] = useState(null)
  const [appearance, setAppearance] = useState(DEFAULT_USER_APPEARANCE)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await fetch('/api/me', { cache: 'no-store' })
        if (!response.ok) {
          setProfile(null)
          setAccess(null)
          return
        }

        const data = await response.json()
        setProfile(data.profile || null)
        setAccess(data.access || null)
      } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error)
        setProfile(null)
        setAccess(null)
      }
    }

    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user?.id) {
        setAppearance(loadUserAppearance(session.user.id))
      } else {
        setAppearance(DEFAULT_USER_APPEARANCE)
      }
      if (session?.user) {
        await loadProfile()
      }
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          setAppearance(loadUserAppearance(session.user.id))
          await loadProfile()
        } else {
          setProfile(null)
          setAccess(null)
          setAppearance(DEFAULT_USER_APPEARANCE)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    applyUserAppearance(appearance)
  }, [appearance])

  const updateAppearance = (updater) => {
    setAppearance((current) => {
      const nextAppearance = normalizeUserAppearance(
        typeof updater === 'function' ? updater(current) : updater
      )

      if (user?.id) {
        saveUserAppearance(user.id, nextAppearance)
      }

      return nextAppearance
    })
  }

  return (
    <UserContext.Provider value={{ user, profile, access, appearance, updateAppearance, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  return useContext(UserContext)
}
