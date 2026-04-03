import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { getDashboardState, saveDashboardState } from '@/lib/server/dashboard-store'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })
    const state = await getDashboardState(supabase, accessContext)

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
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await request.json()
    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })
    const savedState = await saveDashboardState(supabase, accessContext, body)

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
