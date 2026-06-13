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
    const { name, description, color, icon } = body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color
    if (icon !== undefined) updates.icon = icon

    const { data, error } = await adminSupabase
      .from('pac_training_types')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trainingType: data })
  } catch (error) {
    console.error('[PATCH /api/pac/training-types/[id]]', error)
    return NextResponse.json({ error: 'Erro ao atualizar tipo de treinamento.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext

    const { error } = await adminSupabase
      .from('pac_training_types')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/pac/training-types/[id]]', error)
    return NextResponse.json({ error: 'Erro ao excluir tipo de treinamento.' }, { status: 500 })
  }
}
