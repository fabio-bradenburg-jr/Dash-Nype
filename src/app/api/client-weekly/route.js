import { NextResponse } from 'next/server'
import { Pool } from 'pg'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

let pool
let ensured = false

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    ''
  )
}

function getPool() {
  if (!pool) {
    const databaseUrl = getDatabaseUrl()
    if (!databaseUrl) {
      throw new Error('Conexão do banco não configurada para salvar acompanhamento semanal.')
    }

    pool = new Pool({
      connectionString: databaseUrl.replace(/^postgresql\+psycopg:\/\//, 'postgresql://'),
    })
  }

  return pool
}

async function ensureWeeklyTable() {
  if (ensured) return

  await getPool().query(`
    create table if not exists public.client_weekly_snapshots (
      id text primary key default gen_random_uuid()::text,
      workspace_id text not null,
      client_id text not null,
      week_start date not null,
      week_end date not null,
      investment numeric(14,2) not null default 0,
      leads integer not null default 0,
      sql_count integer not null default 0,
      health_status text not null default 'attention',
      action_items jsonb not null default '[]'::jsonb,
      created_by text,
      updated_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint client_weekly_snapshots_health_status_check
        check (health_status in ('critical', 'attention', 'healthy', 'with_result')),
      constraint client_weekly_snapshots_unique_week unique (workspace_id, client_id, week_start)
    );

    create index if not exists client_weekly_snapshots_workspace_week_idx
      on public.client_weekly_snapshots (workspace_id, week_start desc);

    create index if not exists client_weekly_snapshots_client_week_idx
      on public.client_weekly_snapshots (client_id, week_start desc);

    alter table public.client_weekly_snapshots enable row level security;
  `)

  ensured = true
}

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
  const items = Array.isArray(value) ? value : String(value || '').split('\n')
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5)
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
    actionItems: Array.isArray(row.action_items) ? row.action_items : [],
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

  return { user, accessContext }
}

export async function GET(request) {
  try {
    await ensureWeeklyTable()
    const context = await getAuthenticatedContext()
    if (context.error) return context.error

    const { searchParams } = new URL(request.url)
    const clientId = String(searchParams.get('clientId') || '').trim()
    const readableClientIds = getReadableClientIds(context.accessContext)

    if (clientId && readableClientIds && !readableClientIds.has(clientId)) {
      return NextResponse.json({ error: 'Sem acesso a este cliente.' }, { status: 403 })
    }

    const values = [context.accessContext.workspaceId]
    const clauses = ['workspace_id = $1']

    if (clientId) {
      values.push(clientId)
      clauses.push(`client_id = $${values.length}`)
    } else if (readableClientIds) {
      const ids = Array.from(readableClientIds)
      if (!ids.length) return NextResponse.json({ records: [] })
      values.push(ids)
      clauses.push(`client_id = any($${values.length})`)
    }

    const result = await getPool().query(
      `select *
       from public.client_weekly_snapshots
       where ${clauses.join(' and ')}
       order by week_start desc, client_id asc
       limit 260`,
      values
    )

    return NextResponse.json({ records: result.rows.map(serializeRow) })
  } catch (error) {
    console.error('Client weekly GET error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar o acompanhamento semanal.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await ensureWeeklyTable()
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

    const result = await getPool().query(
      `insert into public.client_weekly_snapshots (
         workspace_id,
         client_id,
         week_start,
         week_end,
         investment,
         leads,
         sql_count,
         health_status,
         action_items,
         created_by,
         updated_by,
         created_at,
         updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10, now(), now())
       on conflict (workspace_id, client_id, week_start) do update set
         week_end = excluded.week_end,
         investment = excluded.investment,
         leads = excluded.leads,
         sql_count = excluded.sql_count,
         health_status = excluded.health_status,
         action_items = excluded.action_items,
         updated_by = excluded.updated_by,
         updated_at = now()
       returning *`,
      [
        context.accessContext.workspaceId,
        clientId,
        weekStart,
        weekEnd,
        investment,
        leads,
        sqlCount,
        healthStatus,
        JSON.stringify(actionItems),
        context.user.id,
      ]
    )

    return NextResponse.json({ record: serializeRow(result.rows[0]) })
  } catch (error) {
    console.error('Client weekly POST error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível salvar o acompanhamento semanal.' }, { status: 500 })
  }
}
