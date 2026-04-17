import { randomUUID } from 'crypto'

import { Pool } from 'pg'

import { getLocalSessionUser, hasLocalDatabaseConfig } from '@/lib/server/platform-auth-fallback'
import { ClientSummary, PlatformSnapshot } from '@/lib/saas/types'

type LocalClientRow = {
  id: string
  tenant_id: string
  name: string
  company: string
  niche: string
  average_ticket: string | number | null
  main_goal: string
  ltv: string | number | null
  start_date: string | Date | null
  status: string
  target_roas: string | number | null
  business_data: Record<string, unknown> | null
  last_sync_at: string | Date | null
}

type LocalIntegrationRow = {
  id: string
  client_id: string
  provider: string
  status: string
  account_name: string
  external_account_id: string
  last_sync_at: string | Date | null
}

let pool: Pool | null = null

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não configurada.')
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, 'postgresql://') })
  }

  return pool
}

function asNumber(value: string | number | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function asIsoDate(value: string | Date | null | undefined) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function enumValue(value: string | null | undefined) {
  return String(value || '').toLowerCase()
}

function enumName(value: string | null | undefined, fallback: string) {
  return String(value || fallback).trim().toUpperCase()
}

function serializeClient(row: LocalClientRow): ClientSummary {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    company: row.company,
    niche: row.niche,
    average_ticket: asNumber(row.average_ticket),
    main_goal: enumValue(row.main_goal),
    ltv: asNumber(row.ltv),
    start_date: asIsoDate(row.start_date),
    status: enumValue(row.status),
    target_roas: asNumber(row.target_roas),
    business_data: row.business_data || {},
    last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
  }
}

function serializeIntegration(row: LocalIntegrationRow): PlatformSnapshot['integrations'][number] {
  return {
    id: row.id,
    client_id: row.client_id,
    provider: enumValue(row.provider),
    status: enumValue(row.status),
    account_name: row.account_name,
    external_account_id: row.external_account_id,
    last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
  }
}

export async function getLocalSaasUser(token: string) {
  if (!hasLocalDatabaseConfig()) {
    throw new Error('DATABASE_URL não configurada.')
  }

  return getLocalSessionUser(token)
}

export async function listLocalSaasClients(token: string) {
  const user = await getLocalSaasUser(token)
  const result = await getPool().query<LocalClientRow>(
    `select
       c.id,
       c.tenant_id,
       c.name,
       c.company,
       c.niche,
       c.average_ticket,
       c.main_goal::text as main_goal,
       c.ltv,
       c.start_date,
       c.status::text as status,
       c.target_roas,
       c.business_data,
       max(i.last_sync_at) as last_sync_at
     from clients c
     left join integrations i on i.client_id = c.id
     where c.tenant_id = $1
     group by c.id
     order by c.created_at desc`,
    [user.tenant_id]
  )

  return result.rows.map(serializeClient)
}

export async function createLocalSaasClient(token: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const id = randomUUID()
  const name = String(payload.name || '').trim()
  const company = String(payload.company || name).trim()

  if (!name || !company) {
    throw new Error('Nome do cliente e empresa são obrigatórios.')
  }

  const result = await getPool().query<LocalClientRow>(
    `insert into clients (
       id,
       tenant_id,
       name,
       company,
       niche,
       average_ticket,
       main_goal,
       ltv,
       start_date,
       status,
       target_roas,
       business_data,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
     returning
       id,
       tenant_id,
       name,
       company,
       niche,
       average_ticket,
       main_goal::text as main_goal,
       ltv,
       start_date,
       status::text as status,
       target_roas,
       business_data,
       null as last_sync_at`,
    [
      id,
      user.tenant_id,
      name,
      company,
      String(payload.niche || 'Dashboard'),
      asNumber(payload.average_ticket as number),
      enumName(payload.main_goal as string, 'LEADS'),
      asNumber(payload.ltv as number),
      String(payload.start_date || new Date().toISOString().slice(0, 10)),
      enumName(payload.status as string, 'ACTIVE'),
      asNumber(payload.target_roas as number) || 2.5,
      JSON.stringify(payload.business_data && typeof payload.business_data === 'object' ? payload.business_data : {}),
    ]
  )

  return serializeClient(result.rows[0])
}

export async function listLocalSaasIntegrations(token: string) {
  const user = await getLocalSaasUser(token)
  const result = await getPool().query<LocalIntegrationRow>(
    `select
       i.id,
       i.client_id,
       i.provider::text as provider,
       i.status::text as status,
       i.account_name,
       i.external_account_id,
       i.last_sync_at
     from integrations i
     inner join clients c on c.id = i.client_id
     where i.tenant_id = $1 and c.tenant_id = $1
     order by i.created_at desc`,
    [user.tenant_id]
  )

  return result.rows.map(serializeIntegration)
}

export async function createLocalSaasIntegration(token: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const clientId = String(payload.client_id || payload.clientId || '').trim()
  const provider = enumName(payload.provider as string, 'META_ADS')
  const accountName = String(payload.account_name || payload.accountName || 'Conta vinculada').trim()
  const externalAccountId = String(payload.external_account_id || payload.accountId || '').trim()
  const accessToken = String(payload.access_token || payload.accessToken || '').trim()

  if (!clientId || !externalAccountId || !accessToken) {
    throw new Error('Cliente, conta e token são obrigatórios para salvar a integração.')
  }

  const client = await getPool().query('select id from clients where id = $1 and tenant_id = $2 limit 1', [clientId, user.tenant_id])
  if (!client.rowCount) {
    throw new Error('Cliente não encontrado.')
  }

  const result = await getPool().query<LocalIntegrationRow>(
    `insert into integrations (
       id,
       tenant_id,
       client_id,
       provider,
       status,
       account_name,
       access_token_encrypted,
       external_account_id,
       created_at
     )
     values ($1, $2, $3, $4, 'CONNECTED', $5, $6, $7, now())
     returning
       id,
       client_id,
       provider::text as provider,
       status::text as status,
       account_name,
       external_account_id,
       last_sync_at`,
    [randomUUID(), user.tenant_id, clientId, provider, accountName, accessToken, externalAccountId]
  )

  return serializeIntegration(result.rows[0])
}
