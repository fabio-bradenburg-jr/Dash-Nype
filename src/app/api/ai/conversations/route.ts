import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import {
  createAssistantConversation,
  listAssistantConversations,
} from '@/lib/server/assistant-conversations'

export async function GET() {
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

    const conversations = await listAssistantConversations(
      adminSupabase,
      accessContext.workspaceId,
      user.id
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Assistant conversations GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível listar as conversas.' },
      { status: 500 }
    )
  }
}

export async function POST() {
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

    const conversation = await createAssistantConversation(
      adminSupabase,
      accessContext.workspaceId,
      user.id,
      accessContext.aiAccessLevel
    )

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error('Assistant conversations POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível criar a conversa.' },
      { status: 500 }
    )
  }
}
