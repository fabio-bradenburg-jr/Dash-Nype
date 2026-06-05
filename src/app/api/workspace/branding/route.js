import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext, isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'
import { getWorkspaceBranding, saveWorkspaceBranding } from '@/lib/server/workspace-branding'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

async function getAuthorizedBrandingContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const adminSupabase = createAdminClient()
  if (error) throw error

  if (!user) {
    const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
    if (!token) {
      return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
    }

    const payload = await verifyLocalAccessToken(token)
    const userId = String(payload.sub || '').replace(/^supabase:/, '')
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name, role, ai_access_level, can_edit_integrations, workspace_id')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile?.workspace_id) {
      return { errorResponse: NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 }) }
    }

    const { data: workspace, error: workspaceError } = await adminSupabase
      .from('workspaces')
      .select('id, name, owner_user_id')
      .eq('id', profile.workspace_id)
      .maybeSingle()

    if (workspaceError) throw workspaceError

    const isPrimaryAdmin = isPrimaryAdminEmail(profile.email)
    const isWorkspaceOwner = Boolean(workspace?.owner_user_id && workspace.owner_user_id === profile.id)
    const role = isPrimaryAdmin ? USER_ROLES.MASTER : profile.role === USER_ROLES.MASTER ? USER_ROLES.VIEWER : profile.role || USER_ROLES.VIEWER

    return {
      adminSupabase,
      accessContext: {
        profile,
        role,
        workspaceId: profile.workspace_id,
        workspace: workspace || null,
        isWorkspaceOwner,
        canManageUsers: isPrimaryAdmin || isWorkspaceOwner,
      },
    }
  }

  const accessContext = await getAccessContext(supabase, user, { adminSupabase })

  if (!accessContext.workspaceId) {
    return { errorResponse: NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 }) }
  }

  return { adminSupabase, accessContext }
}

export async function GET() {
  try {
    const authorized = await getAuthorizedBrandingContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const branding = await getWorkspaceBranding(adminSupabase, accessContext.workspaceId, accessContext.workspace?.name || '')
    return NextResponse.json({ branding })
  } catch (error) {
    console.error('Workspace branding GET error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar a marca do workspace.' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const authorized = await getAuthorizedBrandingContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    if (!accessContext.canManageUsers && !accessContext.isWorkspaceOwner) {
      return NextResponse.json({ error: 'Sem permissão para alterar a marca do workspace.' }, { status: 403 })
    }

    const body = await request.json()
    const branding = await saveWorkspaceBranding(
      adminSupabase,
      accessContext.workspaceId,
      body?.branding || body || {},
      accessContext.workspace?.name || ''
    )

    return NextResponse.json({ ok: true, branding })
  } catch (error) {
    console.error('Workspace branding PUT error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível salvar a marca do workspace.' }, { status: 500 })
  }
}
