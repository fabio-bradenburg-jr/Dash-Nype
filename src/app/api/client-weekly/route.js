import { randomUUID } from 'crypto'

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
  return ['integration', 'critical', 'attention', 'healthy', 'with_result', 'churn'].includes(status) ? status : 'attention'
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


function isMissingWeeklyTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table') || message.includes('client_weekly_snapshots')
}

function normalizeStoredWeeklyRecords(payload) {
  const records = Array.isArray(payload?.clientWeeklySnapshots) ? payload.clientWeeklySnapshots : []
  return records
    .filter((record) => record && typeof record === 'object')
    .map((record) => ({
      id: String(record.id || randomUUID()),
      workspace_id: String(record.workspace_id || record.workspaceId || ''),
      client_id: String(record.client_id || record.clientId || ''),
      week_start: String(record.week_start || record.weekStart || '').slice(0, 10),
      week_end: String(record.week_end || record.weekEnd || '').slice(0, 10),
      investment: normalizeNumber(record.investment),
      leads: normalizeInteger(record.leads),
      sql_count: normalizeInteger(record.sql_count || record.sql || record.sqlCount),
      health_status: normalizeHealthStatus(record.health_status || record.healthStatus),
      action_items: normalizeActionItems(record.action_items || record.actionItems),
      created_by: record.created_by || record.createdBy || null,
      updated_by: record.updated_by || record.updatedBy || null,
      created_at: record.created_at || record.createdAt || new Date().toISOString(),
      updated_at: record.updated_at || record.updatedAt || new Date().toISOString(),
    }))
    .filter((record) => record.workspace_id && record.client_id && record.week_start)
}

async function readWorkspacePreferencePayload(adminSupabase, workspaceId) {
  const { data, error } = await adminSupabase
    .from('workspace_preferences')
    .select('payload')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return data?.payload && typeof data.payload === 'object' ? data.payload : {}
}

async function loadWeeklyFallback(adminSupabase, workspaceId, options = {}) {
  const payload = await readWorkspacePreferencePayload(adminSupabase, workspaceId)
  let records = normalizeStoredWeeklyRecords(payload).filter((record) => record.workspace_id === workspaceId)
  if (options.clientId) records = records.filter((record) => record.client_id === options.clientId)
  if (options.readableClientIds) records = records.filter((record) => options.readableClientIds.has(record.client_id))
  return records
    .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)) || String(a.client_id).localeCompare(String(b.client_id)))
    .slice(0, 260)
}

async function writeWeeklyFallback(adminSupabase, workspaceId, records) {
  const payload = await readWorkspacePreferencePayload(adminSupabase, workspaceId)
  const externalRecords = normalizeStoredWeeklyRecords(payload).filter((record) => record.workspace_id !== workspaceId)
  const nextPayload = {
    ...payload,
    clientWeeklySnapshots: [...externalRecords, ...records],
  }

  const { error } = await adminSupabase
    .from('workspace_preferences')
    .upsert({ workspace_id: workspaceId, payload: nextPayload }, { onConflict: 'workspace_id' })

  if (error) throw error
}

async function saveWeeklyFallback(adminSupabase, workspaceId, userId, input) {
  const records = normalizeStoredWeeklyRecords(await readWorkspacePreferencePayload(adminSupabase, workspaceId))
    .filter((record) => record.workspace_id === workspaceId)
  const now = new Date().toISOString()
  const existingIndex = records.findIndex((record) => record.client_id === input.clientId && record.week_start === input.weekStart)
  const previous = existingIndex >= 0 ? records[existingIndex] : null
  const nextRecord = {
    id: previous?.id || randomUUID(),
    workspace_id: workspaceId,
    client_id: input.clientId,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    investment: input.investment,
    leads: input.leads,
    sql_count: input.sqlCount,
    health_status: input.healthStatus,
    action_items: input.actionItems,
    created_by: previous?.created_by || userId,
    updated_by: userId,
    created_at: previous?.created_at || now,
    updated_at: now,
  }

  if (existingIndex >= 0) records[existingIndex] = nextRecord
  else records.unshift(nextRecord)

  await writeWeeklyFallback(adminSupabase, workspaceId, records)
  return nextRecord
}

async function deleteWeeklyFallback(adminSupabase, workspaceId, ids) {
  const payload = await readWorkspacePreferencePayload(adminSupabase, workspaceId)
  const allRecords = normalizeStoredWeeklyRecords(payload)
  const idSet = new Set(ids)
  const deletedRecords = allRecords.filter((record) => record.workspace_id === workspaceId && idSet.has(record.id))
  const remainingWorkspaceRecords = allRecords.filter((record) => record.workspace_id === workspaceId && !idSet.has(record.id))
  await writeWeeklyFallback(adminSupabase, workspaceId, remainingWorkspaceRecords)
  return deletedRecords.map((record) => record.id)
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
    if (error) {
      if (isMissingWeeklyTableError(error)) {
        const fallbackRecords = await loadWeeklyFallback(context.adminSupabase, context.accessContext.workspaceId, {
          clientId,
          readableClientIds,
        })
        return NextResponse.json({ records: fallbackRecords.map(serializeRow) })
      }
      throw error
    }

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

    if (error) {
      if (isMissingWeeklyTableError(error)) {
        const fallbackRecord = await saveWeeklyFallback(context.adminSupabase, context.accessContext.workspaceId, context.user.id, {
          clientId,
          weekStart,
          weekEnd,
          investment,
          leads,
          sqlCount,
          healthStatus,
          actionItems,
        })
        return NextResponse.json({ record: serializeRow(fallbackRecord) })
      }
      throw error
    }

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

    if (fetchError) {
      if (isMissingWeeklyTableError(fetchError)) {
        const fallbackRecords = await loadWeeklyFallback(context.adminSupabase, context.accessContext.workspaceId)
        const selectedRecords = fallbackRecords.filter((record) => uniqueIds.includes(record.id))
        if (!selectedRecords.length) {
          return NextResponse.json({ error: 'Nenhum registro encontrado para excluir.' }, { status: 404 })
        }
        const unauthorizedRecord = selectedRecords.find((record) => !canWriteClient(context.accessContext, record.client_id))
        if (unauthorizedRecord) {
          return NextResponse.json({ error: 'Sem permissão para excluir um ou mais registros selecionados.' }, { status: 403 })
        }
        const deletedIds = await deleteWeeklyFallback(context.adminSupabase, context.accessContext.workspaceId, selectedRecords.map((record) => record.id))
        return NextResponse.json({ deletedIds })
      }
      throw fetchError
    }

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
