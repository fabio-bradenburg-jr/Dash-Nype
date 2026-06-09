import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getLocalSessionUser } from '@/lib/server/platform-auth-fallback'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getWorkspaceBranding } from '@/lib/server/workspace-branding'
import { isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'
import { resolveWorkspaceForHost } from '@/lib/server/domain-config'

function unauthenticatedResponse() {
  const response = NextResponse.json({ authenticated: false }, { status: 401 })
  response.cookies.set({
    name: PLATFORM_AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}

async function enrichLocalUserWithWorkspace(localUser: any) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !localUser?.id) {
    return localUser
  }

  try {
    const adminSupabase = createAdminClient()
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, ai_access_level, can_edit_integrations, workspace_id')
      .eq('id', localUser.id)
      .maybeSingle()

    if (!profile?.workspace_id) return localUser

    const { data: workspace } = await adminSupabase
      .from('workspaces')
      .select('id, name, owner_user_id')
      .eq('id', profile.workspace_id)
      .maybeSingle()

    const email = String(profile.email || localUser.email || '').trim().toLowerCase()
    const isPrimaryAdmin = isPrimaryAdminEmail(email)
    const isWorkspaceOwner = Boolean(workspace?.owner_user_id && workspace.owner_user_id === profile.id)
    const role = isPrimaryAdmin ? USER_ROLES.MASTER : profile.role || USER_ROLES.VIEWER
    const branding = await getWorkspaceBranding(adminSupabase, profile.workspace_id, workspace?.name || '')

    return {
      ...localUser,
      id: profile.id,
      email,
      full_name: profile.full_name || localUser.full_name || email,
      avatar_url: profile.avatar_url || '',
      role,
      ai_access_level: profile.ai_access_level || (isPrimaryAdmin ? 'master' : 'team'),
      tenant_id: profile.workspace_id,
      workspace,
      branding,
      is_workspace_owner: isWorkspaceOwner,
      can_manage_users: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER,
      can_manage_clients: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR,
      can_edit_integrations: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || Boolean(profile.can_edit_integrations),
    }
  } catch (error) {
    console.error('Auth session workspace enrichment error:', error)
    return localUser
  }
}

export async function GET(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  if (!token) {
    return unauthenticatedResponse()
  }

  try {
    const user = await enrichLocalUserWithWorkspace(await getLocalSessionUser(token))

    // Validate that the session's workspace matches the domain being accessed
    if (user?.tenant_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const host = request.headers.get('host') || ''
      const adminSupabase = createAdminClient()
      const { workspaceId: domainWorkspaceId } = await resolveWorkspaceForHost(adminSupabase, host)
      if (domainWorkspaceId && user.tenant_id !== domainWorkspaceId) {
        return unauthenticatedResponse()
      }
    }

    return NextResponse.json({ authenticated: true, user })
  } catch {
    return unauthenticatedResponse()
  }
}
