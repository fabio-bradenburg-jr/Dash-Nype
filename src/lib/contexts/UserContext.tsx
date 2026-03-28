'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  applyUserAppearance,
  DEFAULT_USER_APPEARANCE,
  loadUserAppearance,
  normalizeUserAppearance,
  saveUserAppearance,
} from '@/lib/user-appearance-storage'
import type { AccessContextValue, UserAppearance, UserContextValue, UserProfile } from '@/lib/types/user'

interface MeResponse {
  profile?: UserProfile | null
  access?: AccessContextValue | null
}

const UserContext = createContext<UserContextValue | undefined>(undefined)
const defaultAppearance = DEFAULT_USER_APPEARANCE as UserAppearance

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [access, setAccess] = useState<AccessContextValue | null>(null)
  const [appearance, setAppearance] = useState<UserAppearance>(defaultAppearance)
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

        const data = (await response.json()) as MeResponse
        setProfile(data.profile || null)
        setAccess(data.access || null)
      } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error)
        setProfile(null)
        setAccess(null)
      }
    }

    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user?.id) {
        setAppearance(loadUserAppearance(session.user.id) as UserAppearance)
      } else {
        setAppearance(defaultAppearance)
      }
      if (session?.user) {
        await loadProfile()
      }
      setLoading(false)
    }

    void getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setAppearance(loadUserAppearance(session.user.id) as UserAppearance)
        await loadProfile()
      } else {
        setProfile(null)
        setAccess(null)
        setAppearance(defaultAppearance)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  useEffect(() => {
    applyUserAppearance(appearance)
  }, [appearance])

  const updateAppearance: UserContextValue['updateAppearance'] = (updater) => {
    setAppearance((current) => {
      const nextAppearance = normalizeUserAppearance(
        typeof updater === 'function' ? updater(current) : updater
      ) as UserAppearance

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

export const useUser = (): UserContextValue => {
  const context = useContext(UserContext)

  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }

  return context
}
