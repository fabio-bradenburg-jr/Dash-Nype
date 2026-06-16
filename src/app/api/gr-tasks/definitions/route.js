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
      .from('workspace_gr_tasks')
      .select('*')
      .eq('workspace_id', ctx.accessContext.workspaceId)
      .order('order_index', { ascending: true })

    if (error) throw error
    return NextResponse.json({ tasks: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error
    if (!ctx.accessContext.canManageUsers) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

    const body = await request.json()
    const label = String(body.label || '').trim()
    if (!label) return NextResponse.json({ error: 'label obrigatório.' }, { status: 400 })
    const days = Array.isArray(body.days) ? body.days.map(Number).filter(d => d >= 1 && d <= 5) : [1,2,3,4,5]
    const icon = String(body.icon || 'bx-check').trim()
    const color = String(body.color || '#6366f1').trim()

    const { data: maxRow } = await ctx.adminSupabase
      .from('workspace_gr_tasks')
      .select('order_index')
      .eq('workspace_id', ctx.accessContext.workspaceId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()

    const orderIndex = (maxRow?.order_index ?? -1) + 1

    const { data, error } = await ctx.adminSupabase
      .from('workspace_gr_tasks')
      .insert({ workspace_id: ctx.accessContext.workspaceId, label, days, icon, color, order_index: orderIndex })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ task: data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error
    if (!ctx.accessContext.canManageUsers) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

    const body = await request.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const updates = {}
    if (body.label !== undefined) updates.label = String(body.label).trim()
    if (body.days !== undefined) updates.days = Array.isArray(body.days) ? body.days.map(Number).filter(d => d >= 1 && d <= 5) : [1,2,3,4,5]
    if (body.icon !== undefined) updates.icon = String(body.icon).trim()
    if (body.color !== undefined) updates.color = String(body.color).trim()
    if (body.active !== undefined) updates.active = Boolean(body.active)
    if (body.order_index !== undefined) updates.order_index = Number(body.order_index)
    updates.updated_at = new Date().toISOString()

    const { data, error } = await ctx.adminSupabase
      .from('workspace_gr_tasks')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', ctx.accessContext.workspaceId)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ task: data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const ctx = await getAuthContext()
    if (ctx.error) return ctx.error
    if (!ctx.accessContext.canManageUsers) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

    const { error } = await ctx.adminSupabase
      .from('workspace_gr_tasks')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.accessContext.workspaceId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}