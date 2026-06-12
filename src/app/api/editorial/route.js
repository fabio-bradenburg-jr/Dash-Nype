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

export async function GET(request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse
    const { workspaceId } = accessContext

    const url = new URL(request.url)
    const clientId = url.searchParams.get('clientId')
    const month = url.searchParams.get('month') // YYYY-MM
    const status = url.searchParams.get('status')

    let query = adminSupabase
      .from('editorial_posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: true })

    if (clientId) query = query.eq('client_id', clientId)
    if (status) query = query.eq('status', status)
    if (month) {
      const [year, m] = month.split('-')
      const start = `${year}-${m}-01`
      const end = new Date(Number(year), Number(m), 0).toISOString().slice(0, 10)
      query = query.gte('scheduled_date', start).lte('scheduled_date', end)
    }

    const { data: posts, error } = await query
    if (error) throw error

    return NextResponse.json({ posts: posts || [] })
  } catch (error) {
    console.error('Editorial GET error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar posts.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext()
    if (errorResponse) return errorResponse
    const { workspaceId, profile } = accessContext

    const body = await request.json()
    const { clientId, title, description, scheduledDate, scheduledTime, status, platforms } = body

    if (!clientId || !scheduledDate) {
      return NextResponse.json({ error: 'clientId e scheduledDate são obrigatórios.' }, { status: 400 })
    }

    const { data: post, error } = await adminSupabase
      .from('editorial_posts')
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        title: title || '',
        description: description || '',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || null,
        status: status || 'pending',
        platforms: platforms || [],
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || profile?.email || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ post })
  } catch (error) {
    console.error('Editorial POST error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao criar post.' }, { status: 500 })
  }
}
