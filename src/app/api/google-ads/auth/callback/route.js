import { NextResponse } from 'next/server'
import {
  clearGoogleAdsOauthCookie,
  exchangeGoogleAdsAuthorizationCode,
  fetchGoogleAdsProfile,
  getAuthorizedGoogleAdsContext,
  getGoogleAdsOauthCookie,
  getPlatformGoogleAdsContext,
  getWorkspaceGoogleAdsConnection,
  saveWorkspaceGoogleAdsConnection,
} from '@/lib/server/google-ads'

function buildReturnUrl(request, returnTo) {
  const fallback = new URL('/', request.url)
  fallback.searchParams.set('tab', 'settings')
  if (!returnTo || typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) return fallback
  return new URL(returnTo, request.url)
}

export async function GET(request) {
  let redirectUrl = buildReturnUrl(request)

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const oauthCookie = await getGoogleAdsOauthCookie()

    if (!code || !state || !oauthCookie?.state || oauthCookie.state !== state) {
      throw new Error('A confirmação do Google Ads expirou. Tente conectar novamente.')
    }

    let context = null
    try {
      context = await getPlatformGoogleAdsContext({ requireEdit: true })
    } catch {
      context = await getAuthorizedGoogleAdsContext({ requireEdit: true })
    }

    const { adminSupabase, accessContext } = context
    if (!accessContext.canEditIntegrations) {
      throw new Error('Sem permissão para gerenciar a conexão do Google Ads.')
    }
    if (oauthCookie.workspaceId && oauthCookie.workspaceId !== accessContext.workspaceId) {
      throw new Error('O workspace do retorno do Google Ads não confere com a sessão atual.')
    }

    const token = await exchangeGoogleAdsAuthorizationCode(request, code)
    const profile = await fetchGoogleAdsProfile(token.access_token)
    const currentConnection = await getWorkspaceGoogleAdsConnection(adminSupabase, accessContext.workspaceId)

    await saveWorkspaceGoogleAdsConnection(adminSupabase, accessContext.workspaceId, {
      googleSub: profile.sub,
      googleEmail: profile.email,
      googleName: profile.name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      currentRefreshToken: currentConnection?.refresh_token,
      tokenType: token.token_type,
      scope: token.scope,
      expiryDate: token.expires_in
        ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
        : null,
    })

    redirectUrl = buildReturnUrl(request, oauthCookie.returnTo)
    redirectUrl.searchParams.set('google_ads_connected', '1')
    const response = NextResponse.redirect(redirectUrl)
    await clearGoogleAdsOauthCookie(response)
    return response
  } catch (error) {
    redirectUrl.searchParams.set('google_ads_error', error.message || 'Não foi possível concluir a conexão com o Google Ads.')
    const response = NextResponse.redirect(redirectUrl)
    await clearGoogleAdsOauthCookie(response)
    return response
  }
}
