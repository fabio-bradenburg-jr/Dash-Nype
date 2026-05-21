import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

function normalizeDateInput(value) {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  return raw
}

function resolveMonday(value) {
  const source = normalizeDateInput(value) || new Date().toISOString().slice(0, 10)
  const [year, month, day] = source.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = date.getUTCDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

function resolveWeekEnd(weekStart) {
  const [year, month, day] = weekStart.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 6)
  return date.toISOString().slice(0, 10)
}

function normalizeNumber(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function normalizeInteger(value) {
  return Math.max(0, Math.round(normalizeNumber(value)))
}

function normalizeHealthStatus(value) {
  const status = String(value || '').trim()
  return ['critical', 'attention', 'healthy', 'with_result'].includes(status) ? status : 'attention'
}

function normalizeActionItems(value) {
  const items = Array.isArray(value) ? value : String(value || '').split('\\n')
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5)
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function serializeRow(row) {
  const investment = Number(row.investment || 0)
  const leads = Number(row.leads || 0)
  const sqlCount = Number(row.sql_count || 0)

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    weekStart: String(row.week_start || '').slice(0, 10),
    weekEnd: String(row.week_end || '').slice(0, 10),
    investment,
    leads,
    cpl: leads > 0 ? investment / leads : 0,
    sql: sqlCount,
    costPerSql: sqlCount > 0 ? investment / sqlCount : 0,
    healthStatus: row.health_status || 'attention',
    actionItems: normalizeJsonArray(row.action_items),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

function getReadableClientIds(accessContext) {
  if (accessContext.canManageClients) return null
  return new Set(accessContext.viewableClientIds || [])
}

function canWriteClient(accessContext, clientId) {
  if (accessContext.canManageClients) return true
  return (accessContext.editableClientIds || []).includes(clientId)
}

async function getAuthenticatedContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) {
    return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  }

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, user, { adminSupabase })

  if (!accessContext.workspaceId) {
    return { error: NextResponse.json({ error: 'Usuário sem workspace vinculado.' }, { status: 403 }) }
  }

  return { user, accessContext, adminSupabase }
}

function buildBaseWeeklyQuery(adminSupabase, workspaceId) {
  return adminSupabase
    .from('client_weekly_snapshots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('week_start', { ascending: false })
    .order('client_id', { ascending: true })
    .limit(260)
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedContext()
    if (context.error) return context.error

    const { searchParams } = new URL(request.url)
    const clientId = String(searchParams.get('clientId') || '').trim()
    const readableClientIds = getReadableClientIds(context.accessContext)

    if (clientId && readableClientIds && !readableClientIds.has(clientId)) {
      return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })
    }

    let query = buildBaseWeeklyQuery(context.adminSupabase, context.accessContext.workspaceId)

    if (clientId) {
      query = query.eq('client_id', clientId)
    } else if (readableClientIds) {
      const ids = Array.from(readableClientIds)
      if (!ids.length) return NextResponse.json({ records: [] })
      query = query.in('client_id', ids)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ records: (data || []).map(serializeRow) })
  } catch (error) {
    console.error('Client weekly GET error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar o acompanhamento semanal.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const context = await getAuthenticatedContext()
    if (context.error) return context.error

    const body = await request.json()
    const clientId = String(body.clientId || body.client_id || '').trim()
    if (!clientId) {
      return NextResponse.json({ error: 'Cliente obrigatório.' }, { status: 400 })
    }

    if (!canWriteClient(context.accessContext, clientId)) {
      return NextResponse.json({ error: 'Sem permissão para editar este cliente.' }, { status: 403 })
    }

    const weekStart = resolveMonday(body.weekStart || body.week_start)
    const weekEnd = resolveWeekEnd(weekStart)
    const investment = normalizeNumber(body.investment)
    const leads = normalizeInteger(body.leads)
    const sqlCount = normalizeInteger(body.sql || body.sqlCount || body.sql_count)
    const healthStatus = normalizeHealthStatus(body.healthStatus || body.health_status)
    const actionItems = normalizeActionItems(body.actionItems || body.action_items)
    const now = new Date().toISOString()

    const { data, error } = await context.adminSupabase
      .from('client_weekly_snapshots')
      .upsert(
        {
          workspace_id: context.accessContext.workspaceId,
          client_id: clientId,
          week_start: weekStart,
          week_end: weekEnd,
          investment,
          leads,
          sql_count: sqlCount,
          health_status: healthStatus,
          action_items: actionItems,
          created_by: context.user.id,
          updated_by: context.user.id,
          updated_at: now,
        },
        { onConflict: 'workspace_id,client_id,week_start' }
      )
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ record: serializeRow(data) })
  } catch (error) {
    console.error('Client weekly POST error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível salvar o acompanhamento semanal.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const context = await getAuthenticatedContext()
    if (context.error) return context.error

    const body = await request.json().catch(() => ({}))
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id || '').trim()).filter(Boolean)
      : []

    if (!ids.length) {
      return NextResponse.json({ error: 'Selecione ao menos um registro para excluir.' }, { status: 400 })
    }

    const uniqueIds = Array.from(new Set(ids)).slice(0, 100)

    const { data: records, error: fetchError } = await context.adminSupabase
      .from('client_weekly_snapshots')
      .select('id, client_id')
      .eq('workspace_id', context.accessContext.workspaceId)
      .in('id', uniqueIds)

    if (fetchError) throw fetchError

    if (!records?.length) {
      return NextResponse.json({ error: 'Nenhum registro encontrado para excluir.' }, { status: 404 })
    }

    const unauthorizedRecord = records.find((record) => !canWriteClient(context.accessContext, record.client_id))
    if (unauthorizedRecord) {
      return NextResponse.json({ error: 'Sem permissão para excluir um ou mais registros selecionados.' }, { status: 403 })
    }

    const recordIds = records.map((record) => record.id)
    const { error: deleteError } = await context.adminSupabase
      .from('client_weekly_snapshots')
      .delete()
      .eq('workspace_id', context.accessContext.workspaceId)
      .in('id', recordIds)

    if (deleteError) throw deleteError

    return NextResponse.json({ deletedIds: recordIds })
  } catch (error) {
    console.error('Client weekly DELETE error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível excluir os registros semanais.' }, { status: 500 })
  }
}

