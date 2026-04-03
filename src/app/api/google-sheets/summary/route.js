import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { readGoogleSheetSummary } from '@/lib/server/google-sheets'

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
    const sourceUrl = searchParams.get('url') || ''
    const headerRow = Number(searchParams.get('header_row') || '1')
    const statusColumn = searchParams.get('status_column') || ''

    const summary = await readGoogleSheetSummary({
      sourceUrl,
      headerRow,
      statusColumn,
    })

    return NextResponse.json(summary)
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Não foi possível ler a planilha do Google Sheets.' },
      { status: 500 }
    )
  }
}
