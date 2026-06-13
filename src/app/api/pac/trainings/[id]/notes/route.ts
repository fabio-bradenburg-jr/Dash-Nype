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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: trainingId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext

    // Verify training belongs to workspace
    const { data: training } = await adminSupabase
      .from('pac_trainings')
      .select('id')
      .eq('id', trainingId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (!training) return NextResponse.json({ error: 'Treinamento não encontrado.' }, { status: 404 })

    const { data, error } = await adminSupabase
      .from('pac_training_notes')
      .select('*')
      .eq('training_id', trainingId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ notes: data || [] })
  } catch (error) {
    console.error('[GET /api/pac/trainings/[id]/notes]', error)
    return NextResponse.json({ error: 'Erro ao buscar notas.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: trainingId } = await params
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId, profile } = accessContext
    const body = await request.json()
    const { content } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório.' }, { status: 400 })
    }

    // Verify training belongs to workspace
    const { data: training } = await adminSupabase
      .from('pac_trainings')
      .select('id')
      .eq('id', trainingId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (!training) return NextResponse.json({ error: 'Treinamento não encontrado.' }, { status: 404 })

    const { data, error } = await adminSupabase
      .from('pac_training_notes')
      .insert({
        training_id: trainingId,
        content: content.trim(),
        created_by: profile?.id || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note: data }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/pac/trainings/[id]/notes]', error)
    return NextResponse.json({ error: 'Erro ao criar nota.' }, { status: 500 })
  }
}
