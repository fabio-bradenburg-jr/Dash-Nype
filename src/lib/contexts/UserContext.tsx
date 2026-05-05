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

interface PlatformSessionUser {
  id: string
  email?: string
  full_name?: string
  role?: string
  tenant_id?: string
}

interface PlatformSessionResponse {
  authenticated?: boolean
  user?: PlatformSessionUser | null
}

const UserContext = createContext<UserContextValue | undefined>(undefined)
const defaultAppearance = DEFAULT_USER_APPEARANCE as UserAppearance

function normalizePlatformRole(role?: string | null) {
  return String(role || 'operator').trim().toLowerCase()
}

function buildPlatformProfile(platformUser: PlatformSessionUser): UserProfile {
  const role = normalizePlatformRole(platformUser.role)

  return {
    id: platformUser.id,
    email: platformUser.email || '',
    full_name: platformUser.full_name || platformUser.email || 'Usuário',
    avatar_url: '',
    role,
    ai_access_level: 'team',
    workspace_id: platformUser.tenant_id || null,
  }
}

function buildPlatformAccess(profile: UserProfile): AccessContextValue {
  const role = normalizePlatformRole(profile.role)
  const isClientRole = role === 'client' || role === 'cliente'
  const isAdminRole = role === 'admin' || role === 'master'

  return {
    profile,
    role,
    workspaceId: profile.workspace_id,
    canManageUsers: isAdminRole,
    canManageClients: !isClientRole,
    canEditIntegrations: !isClientRole,
    canViewDashboard: true,
    canUseAi: !isClientRole,
    aiAccessLevel: 'team',
    isClientRole,
    viewableClientIds: [],
    editableClientIds: [],
  }
}

function buildPlatformUser(platformUser: PlatformSessionUser): User {
  return {
    id: platformUser.id,
    email: platformUser.email || '',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {
      full_name: platformUser.full_name || platformUser.email || 'Usuário',
    },
    created_at: '',
  } as User
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [access, setAccess] = useState<AccessContextValue | null>(null)
  const [appearance, setAppearance] = useState<UserAppearance>(defaultAppearance)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        const response = await fetch('/api/me', { cache: 'no-store' })
        if (!response.ok) {
          if (isMounted) {
            setProfile(null)
            setAccess(null)
          }
          return false
        }

        const data = (await response.json()) as MeResponse
        if (isMounted) {
          setProfile(data.profile || null)
          setAccess(data.access || null)
        }
        return true
      } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error)
        if (isMounted) {
          setProfile(null)
          setAccess(null)
        }
        return false
      }
    }

    const loadPlatformSession = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (!response.ok) return false

        const data = (await response.json()) as PlatformSessionResponse
        if (!data.authenticated || !data.user?.id) return false

        const platformProfile = buildPlatformProfile(data.user)
        if (isMounted) {
          setUser(buildPlatformUser(data.user))
          setProfile(platformProfile)
          setAccess(buildPlatformAccess(platformProfile))
          setAppearance(loadUserAppearance(data.user.id) as UserAppearance)
        }
        return true
      } catch (error) {
        console.error('Erro ao carregar sessão da plataforma:', error)
        return false
      }
    }

    const clearSession = () => {
      if (!isMounted) return
      setUser(null)
      setProfile(null)
      setAccess(null)
      setAppearance(defaultAppearance)
    }

    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        if (isMounted) {
          setUser(session.user)
          setAppearance(loadUserAppearance(session.user.id) as UserAppearance)
        }
        await loadProfile()
      } else {
        const hasPlatformSession = await loadPlatformSession()
        if (!hasPlatformSession) clearSession()
      }

      if (isMounted) setLoading(false)
    }

    void getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        if (isMounted) {
          setUser(session.user)
          setAppearance(loadUserAppearance(session.user.id) as UserAppearance)
        }
        await loadProfile()
        return
      }

      const hasPlatformSession = await loadPlatformSession()
      if (!hasPlatformSession) clearSession()
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
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
