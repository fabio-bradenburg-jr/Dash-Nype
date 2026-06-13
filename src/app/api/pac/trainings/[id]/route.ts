import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

async function getAuthorizedContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminSupabase = createAdminClient()

  if (user) {
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })
    return { adminSupabase, accessContext }
  }

  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }

  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '').replace(/^supabase:/, '')
  const { data: profile } = await adminSupabase.from('profiles').select('id, email, full_name, role, workspace_id').eq('id', userId).maybeSingle()
  if (!profile?.workspace_id) return { errorResponse: NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 }) }

  return {
    adminSupabase,
    accessContext: { workspaceId: profile.workspace_id, role: profile.role, profile },
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext
    const body = await request.json()

    const allowed = ['title', 'description', 'client_id', 'training_type_id', 'scheduled_at', 'duration_minutes', 'status', 'platform', 'link']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const { data, error } = await adminSupabase
      .from('pac_trainings')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select(`
        *,
        client:workspace_clients(id, name),
        training_type:pac_training_types(id, name, color, icon)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ training: data })
  } catch (error) {
    console.error('[PATCH /api/pac/trainings/[id]]', error)
    return NextResponse.json({ error: 'Erro ao atualizar treinamento.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext

    const { error } = await adminSupabase
      .from('pac_trainings')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/pac/trainings/[id]]', error)
    return NextResponse.json({ error: 'Erro ao excluir treinamento.' }, { status: 500 })
  }
}
