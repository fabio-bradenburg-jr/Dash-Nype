import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { getDashboardState } from '@/lib/server/dashboard-store'
import { requestAssistantReply, resolveAssistantAiConfig } from '@/lib/server/ai-chat'

function normalizeChatBody(body) {
  const payload = body && typeof body === 'object' ? body : {}

  return {
    clientId: String(payload.clientId || '').trim(),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    contextSnapshot: payload.contextSnapshot && typeof payload.contextSnapshot === 'object' ? payload.contextSnapshot : null,
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = normalizeChatBody(await request.json().catch(() => ({})))
    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(adminSupabase, user)

    if (!accessContext.canViewDashboard) {
      return NextResponse.json({ error: 'Seu usuário não tem permissão para usar o assistente.' }, { status: 403 })
    }

    const dashboardState = await getDashboardState(adminSupabase, accessContext)
    const aiConfig = resolveAssistantAiConfig(dashboardState.globalIntegrations)
    const result = await requestAssistantReply({
      config: aiConfig,
      adminSupabase,
      dashboardState,
      accessContext,
      clientId: body.clientId,
      contextSnapshot: body.contextSnapshot,
      messages: body.messages,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Assistant chat error:', error)
    return NextResponse.json(
      { error: error.message || 'Não foi possível gerar a resposta do assistente.' },
      { status: 500 }
    )
  }
}
