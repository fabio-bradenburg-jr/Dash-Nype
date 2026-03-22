import { NextResponse } from 'next/server'
import {
  createMetaAuthorizationUrl,
  getAuthorizedMetaConnectionContext,
  setMetaOauthCookie,
} from '@/lib/server/meta-connection'

export async function GET(request) {
  try {
    const { accessContext } = await getAuthorizedMetaConnectionContext({ requireEdit: true })
    const returnTo = request.nextUrl.searchParams.get('return_to') || '/settings'
    const authorization = await createMetaAuthorizationUrl(request, accessContext.workspaceId, returnTo)
    const response = NextResponse.redirect(authorization.url)

    await setMetaOauthCookie(response, {
      state: authorization.state,
      workspaceId: accessContext.workspaceId,
      returnTo: authorization.returnTo,
    })

    return response
  } catch (error) {
    const fallback = new URL('/settings', request.url)
    fallback.searchParams.set('meta_error', error.message || 'Não foi possível iniciar a conexão com a Meta.')
    return NextResponse.redirect(fallback)
  }
}
