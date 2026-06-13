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

export async function GET() {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext

    const { data, error } = await adminSupabase
      .from('pac_training_types')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ trainingTypes: data || [] })
  } catch (error) {
    console.error('[GET /api/pac/training-types]', error)
    return NextResponse.json({ error: 'Erro ao buscar tipos de treinamento.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext
    const body = await request.json()
    const { name, description, color, icon } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await adminSupabase
      .from('pac_training_types')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description || null,
        color: color || '#6366f1',
        icon: icon || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trainingType: data }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/pac/training-types]', error)
    return NextResponse.json({ error: 'Erro ao criar tipo de treinamento.' }, { status: 500 })
  }
}
