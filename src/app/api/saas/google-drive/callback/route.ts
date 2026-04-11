import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import {
  clearGoogleDriveOauthCookie,
  encryptDriveConnection,
  exchangeGoogleDriveAuthorizationCode,
  fetchGoogleDriveProfile,
  getGoogleDriveOauthCookie,
} from '@/lib/server/google-drive-oauth'

const API_URL = getPlatformApiUrl()

export async function GET(request: Request) {
  const sessionToken = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  const url = new URL(request.url)
  const code = String(url.searchParams.get('code') || '').trim()
  const state = String(url.searchParams.get('state') || '').trim()
  const error = url.searchParams.get('error')

  const oauthState = await getGoogleDriveOauthCookie()

  if (!sessionToken || !oauthState) {
    const fallback = new URL('/', request.url)
    fallback.searchParams.set('google_drive_error', 'Sessão inválida para concluir a conexão com o Google Drive.')
    return NextResponse.redirect(fallback)
  }

  if (error) {
    await clearGoogleDriveOauthCookie()
    const fallback = new URL(oauthState.returnTo || '/', request.url)
    fallback.searchParams.set('google_drive_error', error)
    fallback.searchParams.set('selected_client', oauthState.clientId)
    return NextResponse.redirect(fallback)
  }

  if (!code || oauthState.state !== state) {
    await clearGoogleDriveOauthCookie()
    const fallback = new URL(oauthState.returnTo || '/', request.url)
    fallback.searchParams.set('google_drive_error', 'O retorno do Google Drive não passou na validação de segurança.')
    fallback.searchParams.set('selected_client', oauthState.clientId)
    return NextResponse.redirect(fallback)
  }

  try {
    const tokenPayload = await exchangeGoogleDriveAuthorizationCode(request, code)
    const profile = await fetchGoogleDriveProfile(tokenPayload.access_token)

    const clientResponse = await fetch(`${API_URL}/clients/${oauthState.clientId}`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    const client = await clientResponse.json()

    if (!clientResponse.ok) {
      throw new Error(client?.detail || client?.error || 'Não foi possível localizar o cliente para salvar o Google Drive.')
    }

    const businessData = {
      ...(client.business_data || {}),
      google_drive_public: {
        email: profile.email || '',
        name: profile.name || '',
        picture: profile.picture || '',
        connected_at: new Date().toISOString(),
      },
      google_drive_connection: encryptDriveConnection({
        access_token: tokenPayload.access_token,
        refresh_token: tokenPayload.refresh_token,
        token_type: tokenPayload.token_type,
        scope: tokenPayload.scope,
        expiry_date: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
        google_email: profile.email || '',
        google_name: profile.name || '',
        google_picture: profile.picture || '',
        google_sub: profile.sub || '',
      }),
    }

    const updateResponse = await fetch(`${API_URL}/clients/${oauthState.clientId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        business_data: businessData,
      }),
      cache: 'no-store',
    })

    const updatePayload = await updateResponse.json().catch(() => ({}))
    if (!updateResponse.ok) {
      throw new Error(updatePayload?.detail || updatePayload?.error || 'Não foi possível salvar a conexão do Google Drive.')
    }

    await clearGoogleDriveOauthCookie()

    const successUrl = new URL(oauthState.returnTo || '/', request.url)
    successUrl.searchParams.set('google_drive_connected', '1')
    successUrl.searchParams.set('selected_client', oauthState.clientId)
    return NextResponse.redirect(successUrl)
  } catch (callbackError) {
    await clearGoogleDriveOauthCookie()
    const fallback = new URL(oauthState.returnTo || '/', request.url)
    fallback.searchParams.set(
      'google_drive_error',
      callbackError instanceof Error ? callbackError.message : 'Não foi possível concluir a conexão com o Google Drive.'
    )
    fallback.searchParams.set('selected_client', oauthState.clientId)
    return NextResponse.redirect(fallback)
  }
}
