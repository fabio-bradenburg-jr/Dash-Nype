import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const GOOGLE_PROFILE_SCOPE = 'openid email profile'
const GOOGLE_CALENDAR_SCOPES = `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_PROFILE_SCOPE}`
const GOOGLE_OAUTH_COOKIE = 'google_calendar_oauth'

export function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

function sanitizeReturnTo(value) {
  if (!value || typeof value !== 'string') return '/calendar'
  return value.startsWith('/') ? value : '/calendar'
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

export function getGoogleCalendarRedirectUri(request) {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${getBaseUrl(request)}/api/google-calendar/auth/callback`
}

export function getGoogleCalendarOauthConfig(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para conectar o Google Calendar.')
  }

  return {
    clientId,
    clientSecret,
    redirectUri: getGoogleCalendarRedirectUri(request),
  }
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

export async function setGoogleOauthCookie(response, payload) {
  const cookieStore = await cookies()
  const value = serializeOauthCookie(payload)

  cookieStore.set(GOOGLE_OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })

  response.cookies.set(GOOGLE_OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })
}

export async function getGoogleOauthCookie() {
  const cookieStore = await cookies()
  return parseOauthCookie(cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value)
}

export async function clearGoogleOauthCookie(response) {
  const cookieStore = await cookies()
  cookieStore.set(GOOGLE_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  response.cookies.set(GOOGLE_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getAuthorizedGoogleCalendarContext({ requireEdit = false } = {}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) {
    throw new Error('Não autenticado.')
  }

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(adminSupabase, user)

  if (!accessContext.workspaceId) {
    throw new Error('Usuário sem workspace vinculado.')
  }

  if (requireEdit && !accessContext.canEditIntegrations) {
    throw new Error('Sem permissão para gerenciar o Google Calendar.')
  }

  if (!requireEdit && !accessContext.canViewDashboard) {
    throw new Error('Sem permissão para acessar o Google Calendar.')
  }

  return {
    user,
    adminSupabase,
    accessContext,
  }
}

export async function getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId) {
  const { data, error } = await adminSupabase
    .from('workspace_google_calendar_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

async function upsertGoogleCalendarConnection(adminSupabase, workspaceId, connection) {
  const payload = {
    workspace_id: workspaceId,
    google_email: connection.google_email || null,
    access_token: connection.access_token,
    refresh_token: connection.refresh_token || null,
    token_type: connection.token_type || 'Bearer',
    scope: connection.scope || GOOGLE_CALENDAR_SCOPES,
    expiry_date: connection.expiry_date || null,
    selected_calendar_id: connection.selected_calendar_id || 'primary',
    selected_calendar_summary: connection.selected_calendar_summary || 'Calendário principal',
  }

  const { data, error } = await adminSupabase
    .from('workspace_google_calendar_connections')
    .upsert(payload, { onConflict: 'workspace_id' })
    .select('*')
    .single()

  if (error && isMissingRelationError(error)) {
    throw new Error('A tabela do Google Calendar ainda não foi criada no Supabase. Aplique a migration antes de conectar a agenda.')
  }
  if (error) throw error
  return data
}

function buildGoogleAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function createGoogleAuthorizationUrl(request, workspaceId, returnTo) {
  const { clientId, redirectUri } = getGoogleCalendarOauthConfig(request)
  const state = globalThis.crypto?.randomUUID?.() || `${workspaceId}-${Date.now()}`

  return {
    state,
    returnTo: sanitizeReturnTo(returnTo),
    url: buildGoogleAuthUrl({
      clientId,
      redirectUri,
      state,
    }),
  }
}

export async function exchangeGoogleAuthorizationCode(request, code) {
  const { clientId, clientSecret, redirectUri } = getGoogleCalendarOauthConfig(request)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Não foi possível autorizar o Google Calendar.')
  }

  return data
}

export async function refreshGoogleAccessToken(request, connection) {
  const { clientId, clientSecret } = getGoogleCalendarOauthConfig(request)

  if (!connection.refresh_token) {
    throw new Error('A conexão do Google Calendar não possui refresh token. Reconecte a conta.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Não foi possível renovar o acesso ao Google Calendar.')
  }

  return data
}

export async function getGoogleProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || data.error_description || 'Não foi possível carregar os dados da conta Google.')
  }

  return data
}

export async function saveGoogleConnectionFromOAuth({ adminSupabase, workspaceId, existingConnection, tokenData, googleProfile }) {
  const accessToken = tokenData.access_token
  const refreshToken = tokenData.refresh_token || existingConnection?.refresh_token || null
  const expiryDate = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : existingConnection?.expiry_date || null

  return upsertGoogleCalendarConnection(adminSupabase, workspaceId, {
    google_email: googleProfile?.email || existingConnection?.google_email || null,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenData.token_type || existingConnection?.token_type || 'Bearer',
    scope: tokenData.scope || existingConnection?.scope || GOOGLE_CALENDAR_SCOPES,
    expiry_date: expiryDate,
    selected_calendar_id: existingConnection?.selected_calendar_id || 'primary',
    selected_calendar_summary: existingConnection?.selected_calendar_summary || 'Calendário principal',
  })
}

export async function getValidGoogleCalendarConnection({ request, adminSupabase, workspaceId }) {
  const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)

  if (!connection) {
    throw new Error('Nenhuma conta do Google Calendar está conectada neste workspace.')
  }

  const expiryDate = connection.expiry_date ? new Date(connection.expiry_date).getTime() : 0
  const needsRefresh = !connection.access_token || !expiryDate || expiryDate <= Date.now() + 60 * 1000

  if (!needsRefresh) {
    return connection
  }

  const tokenData = await refreshGoogleAccessToken(request, connection)

  return upsertGoogleCalendarConnection(adminSupabase, workspaceId, {
    ...connection,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || connection.refresh_token || null,
    token_type: tokenData.token_type || connection.token_type || 'Bearer',
    scope: tokenData.scope || connection.scope || GOOGLE_CALENDAR_SCOPES,
    expiry_date: tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : connection.expiry_date,
  })
}

export async function googleCalendarFetch({ request, adminSupabase, workspaceId, path, method = 'GET', query = {}, body }) {
  const connection = await getValidGoogleCalendarConnection({ request, adminSupabase, workspaceId })
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`)

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = response.status === 204 ? null : await response.json()

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Não foi possível consultar o Google Calendar.')
  }

  return { data, connection }
}

export async function updateWorkspaceGoogleCalendarSelection(adminSupabase, workspaceId, { calendarId, calendarSummary }) {
  const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)

  if (!connection) {
    throw new Error('Nenhuma conta do Google Calendar está conectada neste workspace.')
  }

  return upsertGoogleCalendarConnection(adminSupabase, workspaceId, {
    ...connection,
    selected_calendar_id: calendarId || 'primary',
    selected_calendar_summary: calendarSummary || 'Calendário principal',
  })
}

export async function deleteWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId) {
  const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)

  if (!connection) return null

  if (connection.refresh_token || connection.access_token) {
    const revokeToken = connection.refresh_token || connection.access_token
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revokeToken)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }).catch(() => null)
  }

  const { error } = await adminSupabase
    .from('workspace_google_calendar_connections')
    .delete()
    .eq('workspace_id', workspaceId)

  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return connection
}

export function mapGoogleCalendarConnection(connection) {
  if (!connection) {
    return {
      connected: false,
      email: '',
      selectedCalendarId: 'primary',
      selectedCalendarSummary: '',
      expiresAt: '',
      scope: '',
    }
  }

  return {
    connected: true,
    email: connection.google_email || '',
    selectedCalendarId: connection.selected_calendar_id || 'primary',
    selectedCalendarSummary: connection.selected_calendar_summary || 'Calendário principal',
    expiresAt: connection.expiry_date || '',
    scope: connection.scope || '',
  }
}

export function buildEventPayload(input) {
  const attendees = String(input.attendees || '')
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((email) => ({ email }))

  const payload = {
    summary: String(input.summary || '').trim(),
    description: String(input.description || '').trim() || undefined,
    location: String(input.location || '').trim() || undefined,
    attendees: attendees.length ? attendees : undefined,
  }

  if (input.allDay) {
    const startDate = String(input.startDate || '').trim()
    const endDate = String(input.endDate || '').trim() || startDate

    if (!startDate || !endDate) {
      throw new Error('Informe as datas inicial e final do evento.')
    }

    const endDateValue = new Date(`${endDate}T00:00:00`)
    endDateValue.setDate(endDateValue.getDate() + 1)

    payload.start = { date: startDate }
    payload.end = { date: endDateValue.toISOString().slice(0, 10) }
  } else {
    const startDateTime = String(input.startDateTime || '').trim()
    const endDateTime = String(input.endDateTime || '').trim()
    const timeZone = String(input.timeZone || 'America/Sao_Paulo').trim()

    if (!startDateTime || !endDateTime) {
      throw new Error('Informe o início e o fim do evento.')
    }

    payload.start = {
      dateTime: new Date(startDateTime).toISOString(),
      timeZone,
    }
    payload.end = {
      dateTime: new Date(endDateTime).toISOString(),
      timeZone,
    }
  }

  return payload
}

export function mapGoogleEvent(event) {
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime)
  const startDate = event.start?.date || ''
  const endExclusiveDate = event.end?.date || startDate
  const endInclusiveDate = endExclusiveDate
    ? new Date(new Date(`${endExclusiveDate}T00:00:00`).getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : startDate

  return {
    id: event.id,
    summary: event.summary || 'Sem título',
    description: event.description || '',
    location: event.location || '',
    htmlLink: event.htmlLink || '',
    status: event.status || '',
    startDateTime: event.start?.dateTime || '',
    endDateTime: event.end?.dateTime || '',
    startDate,
    endDate: isAllDay ? endInclusiveDate : '',
    timeZone: event.start?.timeZone || event.end?.timeZone || '',
    allDay: isAllDay,
    attendees: Array.isArray(event.attendees) ? event.attendees.map((attendee) => attendee.email).filter(Boolean) : [],
    meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.entryPointType === 'video')?.uri || '',
  }
}

export { GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_SCOPES }
