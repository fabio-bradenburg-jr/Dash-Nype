import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'
import { randomUUID } from 'crypto'

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
    accessContext: {
      workspaceId: profile.workspace_id,
      role: profile.role,
      profile,
      canManageUsers: false,
      canManageClients: false,
      canViewDashboard: true,
    }
  }
}

export async function GET(request) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const { workspaceId } = accessContext

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const since = searchParams.get('since')
    const until = searchParams.get('until')

    let query = adminSupabase
      .from('saved_reports')
      .select('id, client_id, client_name, report_type, period_label, period_since, period_until, file_size, created_by_name, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (clientId) query = query.eq('client_id', clientId)
    if (since) query = query.gte('created_at', since)
    if (until) query = query.lte('created_at', until + 'T23:59:59Z')

    const { data, error } = await query.limit(200)
    if (error) throw error

    return NextResponse.json({ reports: data || [] })
  } catch (error) {
    console.error('Reports GET error:', error)
    return NextResponse.json({ error: 'Não foi possível listar relatórios.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const { workspaceId, profile } = accessContext

    const formData = await request.formData()
    const file = formData.get('file')
    const clientId = formData.get('clientId') || null
    const clientName = formData.get('clientName') || ''
    const reportType = formData.get('reportType') || 'client-pdf'
    const periodLabel = formData.get('periodLabel') || ''
    const periodSince = formData.get('periodSince') || null
    const periodUntil = formData.get('periodUntil') || null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })

    const id = randomUUID()
    const filePath = `${workspaceId}/${id}.pdf`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await adminSupabase.storage
      .from('reports')
      .upload(filePath, fileBuffer, { contentType: 'application/pdf', upsert: false })

    if (uploadError) throw uploadError

    const createdByName = profile?.full_name || profile?.email || ''
    const createdBy = profile?.id || null

    const { error: insertError } = await adminSupabase.from('saved_reports').insert({
      id,
      workspace_id: workspaceId,
      client_id: clientId || null,
      client_name: clientName,
      report_type: reportType,
      period_label: periodLabel,
      period_since: periodSince || null,
      period_until: periodUntil || null,
      file_path: filePath,
      file_size: fileBuffer.length,
      created_by: createdBy,
      created_by_name: createdByName,
    })

    if (insertError) {
      await adminSupabase.storage.from('reports').remove([filePath])
      throw insertError
    }

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('Reports POST error:', error)
    return NextResponse.json({ error: 'Não foi possível salvar o relatório.' }, { status: 500 })
  }
}
