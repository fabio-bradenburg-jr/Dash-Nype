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

// GET /api/notes — fetch all notes for the workspace (all clients)
export async function GET(request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse

    const { workspaceId, profile } = accessContext
    const url = new URL(request.url)
    const mineOnly = url.searchParams.get('mine') === 'true'
    const userId = profile?.id

    let query = adminSupabase
      .from('client_notes')
      .select('*')
      .eq('workspace_id', workspaceId)

    if (mineOnly && userId) {
      query = query.eq('created_by', userId)
    }

    const { data: notes, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ notes: notes || [] })
  } catch (error) {
    console.error('[GET /api/notes]', error)
    return NextResponse.json({ error: 'Erro ao buscar notas.' }, { status: 500 })
  }
}
