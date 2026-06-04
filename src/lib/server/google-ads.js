import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'
import { isMissingRelationError } from '@/lib/server/meta-connection'

const GOOGLE_ADS_OAUTH_COOKIE = 'google_ads_oauth'
const GOOGLE_ADS_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'openid',
  'email',
  'profile',
]

function getBaseUrl(request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')

  if (!host) {
    throw new Error('Não foi possível identificar a URL base da aplicação.')
  }

  return `${forwardedProto || 'https'}://${host}`
}

function sanitizeReturnTo(value) {
  if (!value || typeof value !== 'string') return '/?tab=settings'
  if (!value.startsWith('/') || value.startsWith('//')) return '/?tab=settings'
  return value
}

function serializeOauthCookie(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function parseOauthCookie(value) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function normalizeCustomerId(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatGoogleAdsCustomerId(value) {
  const id = normalizeCustomerId(value)
  if (id.length !== 10) return id || String(value || '')
  return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
}

export function getGoogleAdsOauthConfig(request) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Configure GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET ou GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET para conectar o Google Ads.')
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_ADS_REDIRECT_URI || `${getBaseUrl(request)}/api/google-ads/auth/callback`,
  }
}

export async function setGoogleAdsOauthCookie(response, payload) {
  const cookieStore = await cookies()
  const value = serializeOauthCookie(payload)
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  }

  cookieStore.set(GOOGLE_ADS_OAUTH_COOKIE, value, options)
  response.cookies.set(GOOGLE_ADS_OAUTH_COOKIE, value, options)
}

export async function getGoogleAdsOauthCookie() {
  const cookieStore = await cookies()
  return parseOauthCookie(cookieStore.get(GOOGLE_ADS_OAUTH_COOKIE)?.value)
}

export async function clearGoogleAdsOauthCookie(response) {
  const cookieStore = await cookies()
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }

  cookieStore.set(GOOGLE_ADS_OAUTH_COOKIE, '', options)
  response.cookies.set(GOOGLE_ADS_OAUTH_COOKIE, '', options)
}

export async function getAuthorizedGoogleAdsContext({ requireEdit = false } = {}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) throw new Error('Não autenticado.')

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, user, { adminSupabase })

  if (!accessContext.workspaceId) {
    throw new Error('Usuário sem workspace vinculado.')
  }

  if (requireEdit && !accessContext.canEditIntegrations) {
    throw new Error('Sem permissão para gerenciar a conexão do Google Ads.')
  }

  return { user, supabase, adminSupabase, accessContext }
}

export async function getPlatformGoogleAdsContext({ requireEdit = false } = {}) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) throw new Error('Sessão do SaaS não encontrada.')

  const payload = await verifyLocalAccessToken(token)
  const workspaceId = String(payload.tenant_id || '')
  if (!workspaceId) throw new Error('Workspace não encontrado na sessão do SaaS.')

  const canEditIntegrations = String(payload.email || '').trim().toLowerCase() === 'fabiobrandenburgjr@gmail.com' || Boolean(payload.can_edit_integrations)
  if (requireEdit && !canEditIntegrations) {
    throw new Error('Sem permissão para gerenciar a conexão do Google Ads.')
  }

  return {
    adminSupabase: createAdminClient(),
    accessContext: {
      workspaceId,
      canEditIntegrations,
    },
  }
}

export async function getWorkspaceGoogleAdsConnection(adminSupabase, workspaceId) {
  const { data, error } = await adminSupabase
    .from('workspace_google_ads_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

export function mapGoogleAdsConnection(connection) {
  if (!connection) {
    return {
      connected: false,
      googleEmail: '',
      googleName: '',
      scopes: '',
      expiresAt: '',
      managerCustomerId: '',
    }
  }

  return {
    connected: true,
    googleEmail: connection.google_email || '',
    googleName: connection.google_name || '',
    scopes: connection.scope || '',
    expiresAt: connection.expiry_date || '',
    managerCustomerId: connection.manager_customer_id || '',
  }
}

export async function createGoogleAdsAuthorizationUrl(request, workspaceId, returnTo) {
  const { clientId, redirectUri } = getGoogleAdsOauthConfig(request)
  const state = globalThis.crypto?.randomUUID?.() || `${workspaceId}-${Date.now()}`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_ADS_SCOPES.join(' '),
    state,
  })

  return {
    state,
    returnTo: sanitizeReturnTo(returnTo),
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  }
}

export async function exchangeGoogleAdsAuthorizationCode(request, code) {
  const { clientId, clientSecret, redirectUri } = getGoogleAdsOauthConfig(request)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Não foi possível autorizar o Google Ads.')
  }

  return data
}

export async function fetchGoogleAdsProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Não foi possível identificar a conta Google.')
  }

  return data
}

export async function saveWorkspaceGoogleAdsConnection(adminSupabase, workspaceId, payload) {
  const { data, error } = await adminSupabase
    .from('workspace_google_ads_connections')
    .upsert(
      {
        workspace_id: workspaceId,
        google_sub: payload.googleSub || null,
        google_email: payload.googleEmail || null,
        google_name: payload.googleName || null,
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken || payload.currentRefreshToken || null,
        token_type: payload.tokenType || 'Bearer',
        scope: payload.scope || GOOGLE_ADS_SCOPES.join(' '),
        expiry_date: payload.expiryDate || null,
        manager_customer_id: normalizeCustomerId(payload.managerCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ''),
      },
      { onConflict: 'workspace_id' }
    )
    .select('*')
    .single()

  if (error && isMissingRelationError(error)) {
    throw new Error('A tabela da conexão do Google Ads ainda não foi criada no Supabase. Aplique a migration antes de conectar a conta.')
  }
  if (error) throw error
  return data
}

export async function refreshGoogleAdsAccessToken(request, connection) {
  if (!connection?.refresh_token) return connection
  const expiresAt = Number(new Date(connection.expiry_date || 0).getTime())
  if (expiresAt && expiresAt - Date.now() > 90 * 1000) return connection

  const { clientId, clientSecret } = getGoogleAdsOauthConfig(request)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Não foi possível atualizar o token do Google Ads.')
  }

  const nextConnection = {
    ...connection,
    access_token: data.access_token || connection.access_token,
    token_type: data.token_type || connection.token_type || 'Bearer',
    scope: data.scope || connection.scope,
    expiry_date: data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : connection.expiry_date,
  }

  try {
    await saveWorkspaceGoogleAdsConnection(createAdminClient(), connection.workspace_id, {
      googleSub: connection.google_sub,
      googleEmail: connection.google_email,
      googleName: connection.google_name,
      accessToken: nextConnection.access_token,
      currentRefreshToken: connection.refresh_token,
      tokenType: nextConnection.token_type,
      scope: nextConnection.scope,
      expiryDate: nextConnection.expiry_date,
      managerCustomerId: connection.manager_customer_id,
    })
  } catch {
    // A atualização de cache não deve impedir a requisição atual.
  }

  return nextConnection
}

export async function resolveWorkspaceGoogleAdsConnection(request) {
  let context = null
  try {
    context = await getPlatformGoogleAdsContext()
  } catch {
    context = await getAuthorizedGoogleAdsContext()
  }

  const connection = await getWorkspaceGoogleAdsConnection(context.adminSupabase, context.accessContext.workspaceId)
  if (!connection?.access_token) return null
  return refreshGoogleAdsAccessToken(request, connection)
}

export function getGoogleAdsApiVersion() {
  return String(process.env.GOOGLE_ADS_API_VERSION || 'v19').replace(/^\/+/, '')
}

function getGoogleAdsDeveloperToken() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    throw new Error('Configure GOOGLE_ADS_DEVELOPER_TOKEN para consultar o Google Ads API.')
  }
  return developerToken
}

export async function googleAdsApiFetch(request, path, { method = 'GET', body = null, customerId = '' } = {}) {
  const connection = await resolveWorkspaceGoogleAdsConnection(request)
  if (!connection?.access_token) {
    throw new Error('Conecte o Google Ads em Configurações antes de carregar os dados.')
  }

  const headers = {
    Authorization: `Bearer ${connection.access_token}`,
    'developer-token': getGoogleAdsDeveloperToken(),
    'Content-Type': 'application/json',
  }
  const loginCustomerId = normalizeCustomerId(connection.manager_customer_id || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '')
  const normalizedCustomerId = normalizeCustomerId(customerId)
  if (loginCustomerId && loginCustomerId !== normalizedCustomerId) {
    headers['login-customer-id'] = loginCustomerId
  }

  const response = await fetch(`https://googleads.googleapis.com/${getGoogleAdsApiVersion()}/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = data?.error?.message || data?.message || 'Não foi possível consultar o Google Ads.'
    throw new Error(message)
  }

  return { data, connection }
}

export async function listGoogleAdsAccounts(request) {
  const { data } = await googleAdsApiFetch(request, 'customers:listAccessibleCustomers')
  const resources = Array.isArray(data.resourceNames) ? data.resourceNames : []
  const accountIds = resources.map((resource) => normalizeCustomerId(resource)).filter(Boolean)

  const accounts = await Promise.all(
    accountIds.slice(0, 50).map(async (customerId) => {
      try {
        const result = await googleAdsApiFetch(request, `customers/${customerId}/googleAds:searchStream`, {
          method: 'POST',
          customerId,
          body: {
            query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1',
          },
        })
        const row = result.data?.[0]?.results?.[0]?.customer || {}
        return {
          id: customerId,
          name: row.descriptiveName || row.descriptive_name || `Conta ${formatGoogleAdsCustomerId(customerId)}`,
          currencyCode: row.currencyCode || row.currency_code || 'BRL',
        }
      } catch {
        return {
          id: customerId,
          name: `Conta ${formatGoogleAdsCustomerId(customerId)}`,
          currencyCode: 'BRL',
        }
      }
    })
  )

  return accounts.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
}

