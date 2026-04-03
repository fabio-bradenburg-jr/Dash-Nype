import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) throw error

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })

    return NextResponse.json({
      profile: accessContext.profile,
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
    console.error('Me route error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar o perfil.' }, { status: 500 })
  }
}
