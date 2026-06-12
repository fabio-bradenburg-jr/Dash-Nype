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

export async function PATCH(request, { params }) {
  try {
    const { postId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse
    const { workspaceId } = accessContext

    const body = await request.json()
    const allowed = ['title', 'description', 'scheduled_date', 'scheduled_time', 'status', 'platforms', 'platform_post_id']
    const updates = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    // camelCase aliases
    if (body.scheduledDate !== undefined) updates.scheduled_date = body.scheduledDate
    if (body.scheduledTime !== undefined) updates.scheduled_time = body.scheduledTime
    updates.updated_at = new Date().toISOString()

    const { data: post, error } = await adminSupabase
      .from('editorial_posts')
      .update(updates)
      .eq('id', postId)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) throw error
    if (!post) return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 })

    return NextResponse.json({ post })
  } catch (error) {
    console.error('Editorial PATCH error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao atualizar post.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { postId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse
    const { workspaceId } = accessContext

    const { error } = await adminSupabase
      .from('editorial_posts')
      .delete()
      .eq('id', postId)
      .eq('workspace_id', workspaceId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Editorial DELETE error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao deletar post.' }, { status: 500 })
  }
}
