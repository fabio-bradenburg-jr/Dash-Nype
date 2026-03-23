import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { readMondaySummary } from '@/lib/server/monday'

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
    const accessContext = await getAccessContext(adminSupabase, user)

    if (!accessContext.canViewDashboard) {
      return NextResponse.json({ error: 'Sem permissão para acessar o dashboard.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const boardIds = searchParams.get('board_ids') || ''
    const since = searchParams.get('since') || ''
    const until = searchParams.get('until') || ''
    const owner = searchParams.get('owner') || ''
    const token = request.headers.get('x-monday-token') || ''

    const summary = await readMondaySummary({
      token,
      boardIds,
      since,
      until,
      owner,
    })

    return NextResponse.json(summary)
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Não foi possível carregar os dados do Monday.' },
      { status: 500 }
    )
  }
}
