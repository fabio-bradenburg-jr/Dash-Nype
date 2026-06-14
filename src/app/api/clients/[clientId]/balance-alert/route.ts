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

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse
    const { workspaceId } = accessContext

    const { clientId } = await params
    const body = await request.json()

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Campo "enabled" (boolean) é obrigatório.' }, { status: 400 })
    }

    // Fetch current payload
    const { data: client, error: fetchError } = await adminSupabase
      .from('workspace_clients')
      .select('payload')
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    const updatedPayload = { ...(client.payload || {}), balanceAlertsEnabled: body.enabled }

    const { error: updateError } = await adminSupabase
      .from('workspace_clients')
      .update({ payload: updatedPayload })
      .eq('id', clientId)
      .eq('workspace_id', workspaceId)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true, enabled: body.enabled })
  } catch (error: any) {
    console.error('balance-alert PATCH error:', error)
    return NextResponse.json({ error: error.message || 'Erro ao atualizar.' }, { status: 500 })
  }
}
