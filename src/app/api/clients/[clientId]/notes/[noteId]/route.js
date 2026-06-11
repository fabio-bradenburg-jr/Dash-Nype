import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

const ADMIN_ROLES = new Set(['master', 'operator'])

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
    accessContext: {
      workspaceId: profile.workspace_id,
      role: profile.role,
      profile,
    }
  }
}

async function getNote(adminSupabase, noteId, clientId, workspaceId) {
  const { data: note } = await adminSupabase
    .from('client_notes')
    .select('*')
    .eq('id', noteId)
    .eq('client_id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return note
}

export async function PATCH(request, { params }) {
  try {
    const { clientId, noteId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse

    const { workspaceId, role, profile } = accessContext

    const body = await request.json()
    const content = String(body?.content || '').trim()
    if (!content) {
      return NextResponse.json({ error: 'O conteúdo da nota não pode estar vazio.' }, { status: 400 })
    }

    const note = await getNote(adminSupabase, noteId, clientId, workspaceId)
    if (!note) {
      return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
    }

    const isAdmin = ADMIN_ROLES.has(String(role || '').toLowerCase())
    const isCreator = profile?.id && note.created_by === profile.id

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: 'Sem permissão para editar esta nota.' }, { status: 403 })
    }

    const { data: updated, error } = await adminSupabase
      .from('client_notes')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note: updated })
  } catch (error) {
    console.error('[PATCH /api/clients/[clientId]/notes/[noteId]]', error)
    return NextResponse.json({ error: 'Erro ao atualizar nota.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { clientId, noteId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse

    const { workspaceId, role, profile } = accessContext

    const note = await getNote(adminSupabase, noteId, clientId, workspaceId)
    if (!note) {
      return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
    }

    const isAdmin = ADMIN_ROLES.has(String(role || '').toLowerCase())
    const isCreator = profile?.id && note.created_by === profile.id

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: 'Sem permissão para excluir esta nota.' }, { status: 403 })
    }

    const { error } = await adminSupabase
      .from('client_notes')
      .delete()
      .eq('id', noteId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/clients/[clientId]/notes/[noteId]]', error)
    return NextResponse.json({ error: 'Erro ao excluir nota.' }, { status: 500 })
  }
}
