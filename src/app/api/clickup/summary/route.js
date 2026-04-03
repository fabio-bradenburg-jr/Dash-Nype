import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { readClickUpSummary } from '@/lib/server/clickup'

export async function GET(request) {
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
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })

    if (!accessContext.canViewDashboard) {
      return NextResponse.json({ error: 'Sem permissão para acessar o dashboard.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const listIds = searchParams.get('list_ids') || ''
    const token = request.headers.get('x-clickup-token') || ''

    const summary = await readClickUpSummary({
      token,
      listIds,
    })

    return NextResponse.json(summary)
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Não foi possível carregar os dados do ClickUp.' },
      { status: 500 }
    )
  }
}
