import { NextResponse } from 'next/server'
import {
  createGoogleAdsAuthorizationUrl,
  getAuthorizedGoogleAdsContext,
  getPlatformGoogleAdsContext,
  setGoogleAdsOauthCookie,
} from '@/lib/server/google-ads'

export async function GET(request) {
  try {
    let context = null
    try {
      context = await getPlatformGoogleAdsContext({ requireEdit: true })
    } catch {
      context = await getAuthorizedGoogleAdsContext({ requireEdit: true })
    }

    const { accessContext } = context
    if (!accessContext.canEditIntegrations) {
      throw new Error('Sem permissão para gerenciar a conexão do Google Ads.')
    }

    const returnTo = request.nextUrl.searchParams.get('return_to') || '/?tab=settings'
    const authorization = await createGoogleAdsAuthorizationUrl(request, accessContext.workspaceId, returnTo)
    const response = NextResponse.redirect(authorization.url)

    await setGoogleAdsOauthCookie(response, {
      state: authorization.state,
      workspaceId: accessContext.workspaceId,
      returnTo: authorization.returnTo,
    })

    return response
  } catch (error) {
    const fallback = new URL('/', request.url)
    fallback.searchParams.set('tab', 'settings')
    fallback.searchParams.set('google_ads_error', error.message || 'Não foi possível iniciar a conexão com o Google Ads.')
    return NextResponse.redirect(fallback)
  }
}
