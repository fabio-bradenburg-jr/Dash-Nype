import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { getAssistantConversationDetail } from '@/lib/server/assistant-conversations'

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) throw error
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(adminSupabase, user)

    if (!accessContext.canUseAi || !accessContext.workspaceId) {
      return NextResponse.json({ error: 'Sem permissão para usar o assistente.' }, { status: 403 })
    }

    const params = await context.params
    const detail = await getAssistantConversationDetail(
      adminSupabase,
      accessContext.workspaceId,
      user.id,
      params.conversationId
    )

    if (!detail) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('Assistant conversation detail GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível carregar a conversa.' },
      { status: 500 }
    )
  }
}
