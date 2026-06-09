import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext, isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'
import { getDashboardState, saveDashboardState } from '@/lib/server/dashboard-store'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

async function getDashboardAccessContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  const adminSupabase = createAdminClient()
  if (user) {
    return {
      adminSupabase,
      accessContext: await getAccessContext(supabase, user, { adminSupabase }),
    }
  }

  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }

  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '').replace(/^supabase:/, '')

  const fakeUser = { id: userId }
  return {
    adminSupabase,
    accessContext: await getAccessContext(adminSupabase, fakeUser, { adminSupabase }),
  }
}

export async function GET() {
  try {
    const authorized = await getDashboardAccessContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const state = await getDashboardState(adminSupabase, accessContext)

    return NextResponse.json({
      ...state,
      access: {
        role: accessContext.role,
        canManageUsers: accessContext.canManageUsers,
        canManageClients: accessContext.canManageClients,
        canEditIntegrations: accessContext.canEditIntegrations,
        canViewDashboard: accessContext.canViewDashboard,
        canUseAi: accessContext.canUseAi,
        aiAccessLevel: accessContext.aiAccessLevel,
        isClientRole: accessContext.isClientRole,
        workspaceId: accessContext.workspaceId,
        viewableClientIds: accessContext.viewableClientIds,
        editableClientIds: accessContext.editableClientIds,
      },
    })
  } catch (error) {
    console.error('Dashboard state GET error:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o estado do dashboard.' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const body = await request.json()
    const authorized = await getDashboardAccessContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const savedState = await saveDashboardState(adminSupabase, accessContext, body)

    return NextResponse.json({
      ...savedState,
      access: {
        role: accessContext.role,
        canManageUsers: accessContext.canManageUsers,
        canManageClients: accessContext.canManageClients,
        canEditIntegrations: accessContext.canEditIntegrations,
        canViewDashboard: accessContext.canViewDashboard,
        canUseAi: accessContext.canUseAi,
        aiAccessLevel: accessContext.aiAccessLevel,
        isClientRole: accessContext.isClientRole,
        workspaceId: accessContext.workspaceId,
        viewableClientIds: accessContext.viewableClientIds,
        editableClientIds: accessContext.editableClientIds,
      },
    })
  } catch (error) {
    console.error('Dashboard state PUT error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível salvar o estado do dashboard.' }, { status: 500 })
  }
}
