import { NextResponse } from 'next/server'
import {
  clearMetaOauthCookie,
  exchangeMetaAuthorizationCode,
  exchangeMetaLongLivedToken,
  getAuthorizedMetaConnectionContext,
  getMetaOauthCookie,
  getMetaProfile,
  saveWorkspaceMetaConnection,
} from '@/lib/server/meta-connection'
import { getDashboardState, saveDashboardState } from '@/lib/server/dashboard-store'

export async function GET(request) {
  const redirectUrl = new URL('/settings', request.url)

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const oauthCookie = await getMetaOauthCookie()

    if (!code || !state || !oauthCookie?.state || oauthCookie.state !== state) {
      throw new Error('A confirmação da Meta expirou. Tente conectar novamente.')
    }

    const { supabase, accessContext } = await getAuthorizedMetaConnectionContext({ requireEdit: true })

    if (oauthCookie.workspaceId && oauthCookie.workspaceId !== accessContext.workspaceId) {
      throw new Error('O workspace do retorno da Meta não confere com a sessão atual.')
    }

    const shortLivedToken = await exchangeMetaAuthorizationCode(request, code)
    const longLivedToken = await exchangeMetaLongLivedToken(request, shortLivedToken.access_token)
    const metaProfile = await getMetaProfile(longLivedToken.access_token)

    await saveWorkspaceMetaConnection(supabase, accessContext.workspaceId, {
      metaUserId: metaProfile.id,
      metaUserName: metaProfile.name,
      accessToken: longLivedToken.access_token,
      tokenType: longLivedToken.token_type,
      scope: shortLivedToken.scope || longLivedToken.scope,
      expiryDate: longLivedToken.expires_in
        ? new Date(Date.now() + Number(longLivedToken.expires_in) * 1000).toISOString()
        : null,
    })

    const dashboardState = await getDashboardState(supabase, accessContext)
    await saveDashboardState(supabase, accessContext, {
      ...dashboardState,
      globalIntegrations: {
        ...(dashboardState.globalIntegrations || {}),
        metaConnectionMode: 'oauth',
      },
    })

    redirectUrl.pathname = oauthCookie.returnTo || '/settings'
    redirectUrl.searchParams.set('meta_connected', '1')

    const response = NextResponse.redirect(redirectUrl)
    await clearMetaOauthCookie(response)
    return response
  } catch (error) {
    redirectUrl.searchParams.set('meta_error', error.message || 'Não foi possível concluir a conexão com a Meta.')
    const response = NextResponse.redirect(redirectUrl)
    await clearMetaOauthCookie(response)
    return response
  }
}
