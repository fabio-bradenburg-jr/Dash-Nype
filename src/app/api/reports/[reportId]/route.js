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

export async function GET(request, { params }) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const { workspaceId } = accessContext
    const { reportId } = await params

    const { data: report, error } = await adminSupabase
      .from('saved_reports')
      .select('id, file_path, workspace_id')
      .eq('id', reportId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error) throw error
    if (!report) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })

    const { data: signedData, error: signError } = await adminSupabase.storage
      .from('reports')
      .createSignedUrl(report.file_path, 3600)

    if (signError) throw signError

    return NextResponse.json({ url: signedData.signedUrl })
  } catch (error) {
    console.error('Reports [reportId] GET error:', error)
    return NextResponse.json({ error: 'Não foi possível gerar o link de download.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const { workspaceId } = accessContext
    const { reportId } = await params

    const { data: report, error } = await adminSupabase
      .from('saved_reports')
      .select('id, file_path, workspace_id')
      .eq('id', reportId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error) throw error
    if (!report) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })

    await adminSupabase.storage.from('reports').remove([report.file_path])

    const { error: deleteError } = await adminSupabase
      .from('saved_reports')
      .delete()
      .eq('id', reportId)
      .eq('workspace_id', workspaceId)

    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Reports [reportId] DELETE error:', error)
    return NextResponse.json({ error: 'Não foi possível excluir o relatório.' }, { status: 500 })
  }
}
