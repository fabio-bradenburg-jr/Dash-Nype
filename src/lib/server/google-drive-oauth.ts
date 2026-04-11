import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'

const GOOGLE_DRIVE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ')

const GOOGLE_DRIVE_COOKIE = 'google_drive_oauth'

type DriveOauthCookie = {
  state: string
  clientId: string
  returnTo: string
}

type DriveConnection = {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expiry_date?: number
  google_email?: string
  google_name?: string
  google_picture?: string
  google_sub?: string
}

function getBaseUrl(request: Request) {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export function getGoogleDriveRedirectUri(request: Request) {
  return process.env.GOOGLE_DRIVE_REDIRECT_URI || `${getBaseUrl(request)}/api/saas/google-drive/callback`
}

function getGoogleConfig(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para conectar o Google Drive.')
  }

  return {
    clientId,
    clientSecret,
    redirectUri: getGoogleDriveRedirectUri(request),
  }
}

function sanitizeReturnTo(value: string | null) {
  if (!value) return '/'
  return value.startsWith('/') ? value : '/'
}

function secretKey() {
  const base = process.env.GOOGLE_DRIVE_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'change-me'
  return createHash('sha256').update(base).digest()
}

export function encryptDriveConnection(payload: DriveConnection) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptDriveConnection(payload: string): DriveConnection | null {
  try {
    const buffer = Buffer.from(payload, 'base64url')
    const iv = buffer.subarray(0, 12)
    const tag = buffer.subarray(12, 28)
    const encrypted = buffer.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    return JSON.parse(decrypted) as DriveConnection
  } catch {
    return null
  }
}

function serializeCookie(payload: DriveOauthCookie) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function parseCookie(value?: string) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as DriveOauthCookie
  } catch {
    return null
  }
}

export async function setGoogleDriveOauthCookie(payload: DriveOauthCookie) {
  const store = await cookies()
  store.set(GOOGLE_DRIVE_COOKIE, serializeCookie(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })
}

export async function getGoogleDriveOauthCookie() {
  const store = await cookies()
  return parseCookie(store.get(GOOGLE_DRIVE_COOKIE)?.value)
}

export async function clearGoogleDriveOauthCookie() {
  const store = await cookies()
  store.set(GOOGLE_DRIVE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function createGoogleDriveAuthorizationUrl(request: Request, clientId: string, returnTo: string) {
  const { clientId: googleClientId, redirectUri } = getGoogleConfig(request)
  const state = globalThis.crypto?.randomUUID?.() || `${clientId}-${Date.now()}`

  await setGoogleDriveOauthCookie({
    state,
    clientId,
    returnTo: sanitizeReturnTo(returnTo),
  })

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPE,
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleDriveAuthorizationCode(request: Request, code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig(request)
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
    cache: 'no-store',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Não foi possível autorizar o Google Drive.')
  }

  return payload
}

export async function refreshGoogleDriveAccessToken(request: Request, connection: DriveConnection) {
  if (!connection.refresh_token) {
    return connection
  }

  const expiresAt = Number(connection.expiry_date || 0)
  if (expiresAt && Date.now() < expiresAt - 60_000) {
    return connection
  }

  const { clientId, clientSecret } = getGoogleConfig(request)
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
    cache: 'no-store',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Não foi possível atualizar o token do Google Drive.')
  }

  return {
    ...connection,
    access_token: payload.access_token,
    token_type: payload.token_type || connection.token_type || 'Bearer',
    scope: payload.scope || connection.scope,
    expiry_date: Date.now() + Number(payload.expires_in || 3600) * 1000,
  } satisfies DriveConnection
}

export async function fetchGoogleDriveProfile(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Não foi possível identificar a conta Google.')
  }
  return payload
}

export async function listGoogleDriveFiles(accessToken: string) {
  const params = new URLSearchParams({
    pageSize: '12',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,webViewLink,iconLink,modifiedTime)',
    q: "trashed = false",
  })

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Não foi possível listar arquivos do Google Drive.')
  }

  return Array.isArray(payload.files) ? payload.files : []
}
