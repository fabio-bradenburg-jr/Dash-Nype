import { NextResponse } from 'next/server'
import {
  createMetaAuthorizationUrl,
  getAuthorizedMetaConnectionContext,
  getPlatformMetaConnectionContext,
  setMetaOauthCookie,
} from '@/lib/server/meta-connection'

export async function GET(request) {
  try {
    let context = null
    try {
      context = await getPlatformMetaConnectionContext({ requireEdit: true })
    } catch {
      context = await getAuthorizedMetaConnectionContext({ requireEdit: true })
    }

    const { accessContext } = context
    if (!accessContext.canEditIntegrations) {
      throw new Error('Sem permissão para gerenciar a conexão da Meta.')
    }

    const returnTo = request.nextUrl.searchParams.get('return_to') || '/?tab=settings'
    const authorization = await createMetaAuthorizationUrl(request, accessContext.workspaceId, returnTo)
    const response = NextResponse.redirect(authorization.url)

    await setMetaOauthCookie(response, {
      state: authorization.state,
      workspaceId: accessContext.workspaceId,
      returnTo: authorization.returnTo,
    })

    return response
  } catch (error) {
    const fallback = new URL('/', request.url)
    fallback.searchParams.set('tab', 'settings')
    fallback.searchParams.set('meta_error', error.message || 'Não foi possível iniciar a conexão com a Meta.')
    return NextResponse.redirect(fallback)
  }
}
