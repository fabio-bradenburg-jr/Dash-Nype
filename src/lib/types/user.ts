import type { User } from '@supabase/supabase-js'
import type { AssistantAiAccessLevel } from '@/lib/types/ai'

export interface UserAppearance {
  mode: 'light' | 'dark' | 'custom'
  accent: string
  backgroundTint: string
  panelColor: string
  textColor: string
}

export interface WorkspaceBranding {
  appName: string
  appSubtitle: string
  companyName: string
  logoUrl: string
  mode: 'light' | 'dark' | 'custom'
  primaryColor: string
  accentColor: string
  backgroundColor: string
  panelColor: string
  textColor: string
  onboardingCompleted: boolean
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string
  role: string
  ai_access_level?: AssistantAiAccessLevel
  can_edit_integrations?: boolean
  workspace_id: string | null
}

export interface AccessContextValue {
  profile: UserProfile | null
  role: string | null
  workspaceId: string | null
  workspace?: {
    id: string
    name?: string | null
    owner_user_id?: string | null
  } | null
  workspaceBranding?: WorkspaceBranding | null
  isWorkspaceOwner?: boolean
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
