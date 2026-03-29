import type { User } from '@supabase/supabase-js'
import type { AssistantAiAccessLevel } from '@/lib/types/ai'

export interface UserAppearance {
  mode: 'light' | 'dark'
  accent: string
  backgroundTint: string
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string
  role: string
  ai_access_level?: AssistantAiAccessLevel
  workspace_id: string | null
}

export interface AccessContextValue {
  profile: UserProfile | null
  role: string | null
  workspaceId: string | null
  canManageUsers: boolean
  canManageClients: boolean
  canEditIntegrations: boolean
  canViewDashboard: boolean
  canUseAi: boolean
  aiAccessLevel: AssistantAiAccessLevel
  isClientRole: boolean
  viewableClientIds: string[]
  editableClientIds: string[]
}

export interface UserContextValue {
  user: User | null
  profile: UserProfile | null
  access: AccessContextValue | null
  appearance: UserAppearance
  updateAppearance: (
    updater: UserAppearance | ((current: UserAppearance) => UserAppearance)
  ) => void
  loading: boolean
}
