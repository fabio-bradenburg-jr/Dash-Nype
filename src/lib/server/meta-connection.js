import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

const META_OAUTH_COOKIE = 'meta_oauth'
const META_SCOPES = ['public_profile', 'ads_read', 'ads_management', 'business_management']

function sanitizeReturnTo(value) {
  if (!value || typeof value !== 'string') return '/settings'
  return value.startsWith('/') ? value : '/settings'
}

function getBaseUrl(request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')

  if (!host) {
    throw new Error('Não foi possível identificar a URL base da aplicação.')
  }

  return `${forwardedProto || 'https'}://${host}`
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

export function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

export function getMetaOauthConfig(request) {
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Configure META_APP_ID/META_APP_SECRET ou FACEBOOK_APP_ID/FACEBOOK_APP_SECRET para conectar a Meta.')
  }

  return {
    appId,
    appSecret,
    redirectUri: process.env.META_OAUTH_REDIRECT_URI || `${getBaseUrl(request)}/api/meta/auth/callback`,
  }
}

export async function setMetaOauthCookie(response, payload) {
  const cookieStore = await cookies()
  const value = serializeOauthCookie(payload)

  cookieStore.set(META_OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })

  response.cookies.set(META_OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })
}

export async function getMetaOauthCookie() {
  const cookieStore = await cookies()
  return parseOauthCookie(cookieStore.get(META_OAUTH_COOKIE)?.value)
}

export async function clearMetaOauthCookie(response) {
  const cookieStore = await cookies()
  cookieStore.set(META_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  response.cookies.set(META_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getAuthorizedMetaConnectionContext({ requireEdit = false } = {}) {
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
    throw new Error('Sem permissão para gerenciar a conexão da Meta.')
  }

  return {
    user,
    supabase,
    adminSupabase,
    accessContext,
  }
}

export async function getWorkspaceMetaConnection(adminSupabase, workspaceId) {
  const { data, error } = await adminSupabase
    .from('workspace_meta_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

export function mapMetaConnection(connection) {
  if (!connection) {
    return {
      connected: false,
      userId: '',
      userName: '',
      scopes: '',
      expiresAt: '',
    }
  }

  return {
    connected: true,
    userId: connection.meta_user_id || '',
    userName: connection.meta_user_name || '',
    scopes: connection.scope || '',
    expiresAt: connection.expiry_date || '',
  }
}

function buildMetaAuthUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: META_SCOPES.join(','),
    state,
  })

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
}

export async function createMetaAuthorizationUrl(request, workspaceId, returnTo) {
  const { appId, redirectUri } = getMetaOauthConfig(request)
  const state = globalThis.crypto?.randomUUID?.() || `${workspaceId}-${Date.now()}`

  return {
    state,
    returnTo: sanitizeReturnTo(returnTo),
    url: buildMetaAuthUrl({ appId, redirectUri, state }),
  }
}

export async function exchangeMetaAuthorizationCode(request, code) {
  const { appId, appSecret, redirectUri } = getMetaOauthConfig(request)
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`, {
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Não foi possível autorizar a Meta.')
  }

  return data
}

export async function exchangeMetaLongLivedToken(request, shortLivedToken) {
  const { appId, appSecret } = getMetaOauthConfig(request)
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })

  const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`, {
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Não foi possível gerar o token de longa duração da Meta.')
  }

  return data
}

export async function getMetaProfile(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name',
    access_token: accessToken,
  })

  const response = await fetch(`https://graph.facebook.com/v19.0/me?${params.toString()}`, {
    cache: 'no-store',
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Não foi possível carregar o perfil conectado da Meta.')
  }

  return data
}

export async function saveWorkspaceMetaConnection(adminSupabase, workspaceId, payload) {
  const { data, error } = await adminSupabase
    .from('workspace_meta_connections')
    .upsert(
      {
        workspace_id: workspaceId,
        meta_user_id: payload.metaUserId || null,
        meta_user_name: payload.metaUserName || null,
        access_token: payload.accessToken,
        token_type: payload.tokenType || 'Bearer',
        scope: payload.scope || META_SCOPES.join(','),
        expiry_date: payload.expiryDate || null,
      },
      { onConflict: 'workspace_id' }
    )
    .select('*')
    .single()

  if (error && isMissingRelationError(error)) {
    throw new Error('A tabela da conexão da Meta ainda não foi criada no Supabase. Aplique a migration antes de conectar a conta.')
  }
  if (error) throw error
  return data
}

export async function deleteWorkspaceMetaConnection(adminSupabase, workspaceId) {
  const { error } = await adminSupabase
    .from('workspace_meta_connections')
    .delete()
    .eq('workspace_id', workspaceId)

  if (error && isMissingRelationError(error)) return
  if (error) throw error
}

export async function resolveWorkspaceMetaAccessToken(request) {
  const headerToken = request.headers.get('x-meta-access-token')
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (headerToken || bearerToken) {
    return headerToken || bearerToken
  }

  if (process.env.META_ACCESS_TOKEN) {
    return process.env.META_ACCESS_TOKEN
  }

  try {
    const { adminSupabase, accessContext } = await getAuthorizedMetaConnectionContext()
    const connection = await getWorkspaceMetaConnection(adminSupabase, accessContext.workspaceId)
    return connection?.access_token || ''
  } catch {
    return ''
  }
}
