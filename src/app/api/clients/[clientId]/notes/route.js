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
    accessContext: {
      workspaceId: profile.workspace_id,
      role: profile.role,
      profile,
    }
  }
}

export async function GET(request, { params }) {
  try {
    const { clientId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext

    // Validate client belongs to workspace
    const { data: client } = await adminSupabase
      .from('workspace_clients')
      .select('id')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    const url = new URL(request.url)
    const mineOnly = url.searchParams.get('mine') === 'true'
    const userId = accessContext.profile?.id

    let query = adminSupabase
      .from('client_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('client_id', clientId)

    if (mineOnly && userId) {
      query = query.eq('created_by', userId)
    }

    const { data: notes, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ notes: notes || [] })
  } catch (error) {
    console.error('[GET /api/clients/[clientId]/notes]', error)
    return NextResponse.json({ error: 'Erro ao buscar notas.' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const { clientId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse

    const { workspaceId, profile } = accessContext

    const body = await request.json()
    const content = String(body?.content || '').trim()
    const parentId = body?.parentId || null
    if (!content) {
      return NextResponse.json({ error: 'O conteúdo da nota não pode estar vazio.' }, { status: 400 })
    }

    // Validate client belongs to workspace
    const { data: client } = await adminSupabase
      .from('workspace_clients')
      .select('id')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    const createdBy = profile?.id || null
    const createdByName = String(profile?.full_name || profile?.email || '').trim()

    const { data: note, error } = await adminSupabase
      .from('client_notes')
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        content,
        created_by: createdBy,
        created_by_name: createdByName,
        parent_id: parentId || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/clients/[clientId]/notes]', error)
    return NextResponse.json({ error: 'Erro ao criar nota.' }, { status: 500 })
  }
}
