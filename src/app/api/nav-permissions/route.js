import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, user, { adminSupabase })
  if (!accessContext.workspaceId) return { error: NextResponse.json({ error: 'Sem workspace.' }, { status: 403 }) }
  return { user, accessContext, adminSupabase }
}

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error

    const { data, error } = await ctx.adminSupabase
      .from('workspace_nav_permissions')
      .select('user_id, page_key, granted')
      .eq('workspace_id', ctx.accessContext.workspaceId)

    if (error) throw error
    return NextResponse.json({ permissions: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error
    if (!ctx.accessContext.canManageUsers) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }

    const body = await request.json()
    const userId = String(body.userId || '').trim()
    const pageKey = String(body.pageKey || '').trim()
    const granted = Boolean(body.granted)

    if (!userId || !pageKey) return NextResponse.json({ error: 'userId e pageKey obrigatórios.' }, { status: 400 })

    const { error } = await ctx.adminSupabase
      .from('workspace_nav_permissions')
      .upsert(
        { workspace_id: ctx.accessContext.workspaceId, user_id: userId, page_key: pageKey, granted, updated_at: new Date().toISOString() },
        { onConflict: 'workspace_id,user_id,page_key' }
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}