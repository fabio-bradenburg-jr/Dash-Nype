import { randomUUID } from 'crypto'

import { createAdminClient } from '@/lib/server/supabase-admin'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'
import { ClientSummary, PlatformSnapshot } from '@/lib/saas/types'

type WorkspaceClientRow = {
  id: string
  name: string
  payload: Record<string, unknown> | null
  updated_at?: string | null
}

type LocalSaasUser = {
  id: string
  tenant_id: string
  role?: string
}

function asNumber(value: string | number | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function enumValue(value: string | null | undefined) {
  return String(value || '').toLowerCase()
}

function createClientUidSeed(value: string) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

  return normalized || 'cliente'
}

function createClientUid(name: string, clientId: string) {
  const seed = createClientUidSeed(name)
  const suffix = String(clientId || randomUUID()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase()
  return `cl_${seed}_${suffix || Date.now().toString(36)}`
}

function getStoredClientUid(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== 'object') return ''

  return String(
    source.clientUid ||
      source.client_uid ||
      source.customClientId ||
      source.custom_client_id ||
      source.publicClientId ||
      source.public_client_id ||
      ''
  ).trim()
}

function ensureClientIdentity<T extends Record<string, unknown>>(businessData: T, name: string, clientId: string) {
  const clientUid = getStoredClientUid(businessData) || createClientUid(name, clientId)

  return {
    ...businessData,
    clientUid,
    customClientId: clientUid,
  }
}

function serializeWorkspaceClient(row: WorkspaceClientRow, workspaceId: string): ClientSummary {
  const payload = row.payload || {}
  const rawBusinessData = (payload.business_data || payload.businessData || {}) as Record<string, unknown>
  const clientUid = getStoredClientUid(payload) || getStoredClientUid(rawBusinessData) || createClientUid(row.name, row.id)
  const businessData = ensureClientIdentity(rawBusinessData, row.name, row.id)

  return {
    id: row.id,
    tenant_id: workspaceId,
    name: row.name,
    company: String(payload.company || payload.companyName || row.name),
    niche: String(payload.niche || 'Dashboard'),
    average_ticket: asNumber(payload.average_ticket as number),
    main_goal: enumValue(String(payload.main_goal || 'leads')),
    ltv: asNumber(payload.ltv as number),
    start_date: String(payload.start_date || '').slice(0, 10),
    status: enumValue(String(payload.status || 'active')),
    target_roas: asNumber(payload.target_roas as number) || 2.5,
    customClientId: clientUid,
    business_data: {
      ...businessData,
      clientUid,
      customClientId: clientUid,
    },
    last_sync_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

function isWorkspaceSaasClient(row: WorkspaceClientRow) {
  return Array.isArray(row.payload?.saas_integrations)
}

function serializeWorkspaceIntegration(
  integration: Record<string, unknown>,
  fallbackClientId: string
): PlatformSnapshot['integrations'][number] {
  return {
    id: String(integration.id || randomUUID()),
    client_id: String(integration.client_id || integration.clientId || fallbackClientId),
    provider: enumValue(String(integration.provider || 'meta_ads')),
    status: enumValue(String(integration.status || 'connected')),
    account_name: String(integration.account_name || integration.accountName || 'Conta vinculada'),
    external_account_id: String(integration.external_account_id || integration.externalAccountId || ''),
    last_sync_at: integration.last_sync_at ? new Date(String(integration.last_sync_at)).toISOString() : null,
  }
}

export async function getLocalSaasUser(token: string) {
  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '')
  const tenantId = String(payload.tenant_id || '')

  if (!userId || !tenantId) {
    throw new Error('Sessão inválida.')
  }

  return {
    id: userId.replace(/^supabase:/, ''),
    tenant_id: tenantId,
    role: String(payload.role || 'operator'),
  }
}

async function listWorkspaceClients(token: string) {
  const user = await getLocalSaasUser(token)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('workspace_clients')
    .select('id, name, payload, updated_at')
    .eq('workspace_id', user.tenant_id)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data || [])
    .map((row) => row as WorkspaceClientRow)
    .map((row) => serializeWorkspaceClient(row, user.tenant_id))
}

async function createWorkspaceClient(token: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const supabase = createAdminClient()
  const id = randomUUID()
  const name = String(payload.name || '').trim()
  const company = String(payload.company || name).trim()
  const clientUid = createClientUid(name, id)

  if (!name || !company) {
    throw new Error('Nome do cliente e empresa são obrigatórios.')
  }

  const businessData = ensureClientIdentity(
    payload.business_data && typeof payload.business_data === 'object' ? (payload.business_data as Record<string, unknown>) : {},
    name,
    id
  )
  const clientPayload = {
    clientUid,
    customClientId: clientUid,
    company,
    niche: String(payload.niche || 'Dashboard'),
    average_ticket: asNumber(payload.average_ticket as number),
    main_goal: enumValue(String(payload.main_goal || 'leads')),
    ltv: asNumber(payload.ltv as number),
    start_date: String(payload.start_date || new Date().toISOString().slice(0, 10)),
    status: enumValue(String(payload.status || 'active')),
    target_roas: asNumber(payload.target_roas as number) || 2.5,
    business_data: {
      ...businessData,
      clientUid,
      customClientId: clientUid,
    },
    saas_integrations: [],
  }

  const { data, error } = await supabase
    .from('workspace_clients')
    .insert({
      workspace_id: user.tenant_id,
      id,
      name,
      cnpj: '',
      payload: clientPayload,
    })
    .select('id, name, payload, updated_at')
    .single()

  if (error) throw error

  return serializeWorkspaceClient(data as WorkspaceClientRow, user.tenant_id)
}

async function updateWorkspaceClientForUser(user: LocalSaasUser, clientId: string, payload: Record<string, unknown>) {
  const normalizedClientId = String(clientId || payload.clientId || payload.client_id || '').trim()
  const supabase = createAdminClient()
  const { data: client, error: loadError } = await supabase
    .from('workspace_clients')
    .select('id, name, payload, updated_at')
    .eq('workspace_id', user.tenant_id)
    .eq('id', normalizedClientId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!client) throw new Error('Cliente não encontrado.')

  const currentPayload = ((client as WorkspaceClientRow).payload || {}) as Record<string, unknown>
  const currentBusinessData =
    currentPayload.business_data && typeof currentPayload.business_data === 'object'
      ? (currentPayload.business_data as Record<string, unknown>)
      : {}
  const clientUid = getStoredClientUid(currentPayload) || getStoredClientUid(currentBusinessData) || createClientUid(String((client as WorkspaceClientRow).name || 'cliente'), normalizedClientId)
  const nextBusinessData = ensureClientIdentity(
    payload.business_data && typeof payload.business_data === 'object'
      ? { ...currentBusinessData, ...(payload.business_data as Record<string, unknown>) }
      : currentBusinessData,
    String(payload.name || (client as WorkspaceClientRow).name || 'cliente'),
    normalizedClientId
  )

  const nextPayload = {
    ...currentPayload,
    ...payload,
    clientUid,
    customClientId: clientUid,
    business_data: {
      ...nextBusinessData,
      clientUid,
      customClientId: clientUid,
    },
  }
  delete (nextPayload as Record<string, unknown>).clientId
  delete (nextPayload as Record<string, unknown>).client_id

  const { data, error } = await supabase
    .from('workspace_clients')
    .update({ payload: nextPayload })
    .eq('workspace_id', user.tenant_id)
    .eq('id', normalizedClientId)
    .select('id, name, payload, updated_at')
    .single()

  if (error) throw error
  return serializeWorkspaceClient(data as WorkspaceClientRow, user.tenant_id)
}

async function listWorkspaceIntegrations(token: string) {
  const user = await getLocalSaasUser(token)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('workspace_clients')
    .select('id, payload')
    .eq('workspace_id', user.tenant_id)

  if (error) throw error

  return (data || []).flatMap((row) => {
    if (!isWorkspaceSaasClient(row as WorkspaceClientRow)) return []

    const payload = ((row as WorkspaceClientRow).payload || {}) as Record<string, unknown>
    const integrations = Array.isArray(payload.saas_integrations) ? payload.saas_integrations : []
    return integrations.map((integration) => serializeWorkspaceIntegration(integration as Record<string, unknown>, String(row.id)))
  })
}

async function createWorkspaceIntegration(token: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const supabase = createAdminClient()
  const clientId = String(payload.client_id || payload.clientId || '').trim()
  const provider = enumValue(String(payload.provider || 'meta_ads'))
  const accountName = String(payload.account_name || payload.accountName || 'Conta vinculada').trim()
  const externalAccountId = String(payload.external_account_id || payload.accountId || '').trim()
  const accessToken = String(payload.access_token || payload.accessToken || '').trim()

  if (!clientId || !externalAccountId || !accessToken) {
    throw new Error('Cliente, conta e token são obrigatórios para salvar a integração.')
  }

  const { data: client, error: loadError } = await supabase
    .from('workspace_clients')
    .select('id, name, payload')
    .eq('workspace_id', user.tenant_id)
    .eq('id', clientId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!client) throw new Error('Cliente não encontrado.')

  const currentPayload = ((client as WorkspaceClientRow).payload || {}) as Record<string, unknown>
  const currentBusinessData = currentPayload.business_data && typeof currentPayload.business_data === 'object'
    ? (currentPayload.business_data as Record<string, unknown>)
    : {}
  const clientUid = getStoredClientUid(currentPayload) || getStoredClientUid(currentBusinessData) || createClientUid(String((client as WorkspaceClientRow).name || 'cliente'), clientId)
  const currentIntegrations = Array.isArray(currentPayload.saas_integrations) ? currentPayload.saas_integrations : []
  const integration = {
    id: randomUUID(),
    client_id: clientId,
    client_uid: clientUid,
    customClientId: clientUid,
    provider,
    status: 'connected',
    account_name: accountName,
    external_account_id: externalAccountId,
    access_token: accessToken,
    last_sync_at: null,
  }
  const nextIntegrations = [
    ...currentIntegrations.filter((item) => {
      const typed = item as Record<string, unknown>
      return String(typed.provider || '') !== provider || String(typed.external_account_id || '') !== externalAccountId
    }),
    integration,
  ]

  const { error: updateError } = await supabase
    .from('workspace_clients')
    .update({
      payload: {
        ...currentPayload,
        clientUid,
        customClientId: clientUid,
        business_data: {
          ...currentBusinessData,
          clientUid,
          customClientId: clientUid,
        },
        saas_integrations: nextIntegrations,
      },
    })
    .eq('workspace_id', user.tenant_id)
    .eq('id', clientId)

  if (updateError) throw updateError

  return serializeWorkspaceIntegration(integration, clientId)
}

export async function listLocalSaasClients(token: string) {
  return listWorkspaceClients(token)
}

export async function createLocalSaasClient(token: string, payload: Record<string, unknown>) {
  return createWorkspaceClient(token, payload)
}

export async function updateLocalSaasClient(token: string, clientId: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const normalizedClientId = String(clientId || payload.clientId || payload.client_id || '').trim()

  if (!normalizedClientId) {
    throw new Error('Cliente obrigatório.')
  }

  return updateWorkspaceClientForUser(user, normalizedClientId, payload)
}

export async function updateLocalSaasClientDashboardLayout(token: string, payload: Record<string, unknown>) {
  const user = await getLocalSaasUser(token)
  const clientId = String(payload.clientId || payload.client_id || '').trim()

  if (!clientId) {
    throw new Error('Cliente obrigatório para salvar o layout.')
  }

  const layoutData = {
    dashboardTemplates: Array.isArray(payload.dashboardTemplates) ? payload.dashboardTemplates : [],
    activeDashboardTemplateId: String(payload.activeDashboardTemplateId || ''),
    funnelSteps: Array.isArray(payload.funnelSteps) ? payload.funnelSteps : [],
    dashboardButtonColor: String(payload.dashboardButtonColor || ''),
    dashboardAccentColor: String(payload.dashboardAccentColor || ''),
    logoUrl: String(payload.logoUrl || ''),
    dashboardTheme:
      payload.dashboardTheme && typeof payload.dashboardTheme === 'object'
        ? payload.dashboardTheme
        : {
            buttonColor: String(payload.dashboardButtonColor || ''),
            accentColor: String(payload.dashboardAccentColor || ''),
          },
  }

  const supabase = createAdminClient()
  const { data: client, error: loadError } = await supabase
    .from('workspace_clients')
    .select('id, name, payload, updated_at')
    .eq('workspace_id', user.tenant_id)
    .eq('id', clientId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!client) throw new Error('Cliente não encontrado.')

  const currentPayload = ((client as WorkspaceClientRow).payload || {}) as Record<string, unknown>
  const currentBusinessData =
    currentPayload.business_data && typeof currentPayload.business_data === 'object'
      ? (currentPayload.business_data as Record<string, unknown>)
      : {}

  const clientUid = getStoredClientUid(currentPayload) || getStoredClientUid(currentBusinessData) || createClientUid(String((client as WorkspaceClientRow).name || 'cliente'), clientId)
  const nextPayload = {
    ...currentPayload,
    clientUid,
    customClientId: clientUid,
    business_data: {
      ...currentBusinessData,
      ...layoutData,
      clientUid,
      customClientId: clientUid,
    },
  }

  const { data, error } = await supabase
    .from('workspace_clients')
    .update({ payload: nextPayload })
    .eq('workspace_id', user.tenant_id)
    .eq('id', clientId)
    .select('id, name, payload, updated_at')
    .single()

  if (error) throw error
  return serializeWorkspaceClient(data as WorkspaceClientRow, user.tenant_id)
}

export async function listLocalSaasIntegrations(token: string) {
  return listWorkspaceIntegrations(token)
}

export async function createLocalSaasIntegration(token: string, payload: Record<string, unknown>) {
  return createWorkspaceIntegration(token, payload)
}
