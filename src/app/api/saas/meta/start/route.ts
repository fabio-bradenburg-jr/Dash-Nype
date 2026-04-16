import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createMetaAuthorizationUrl } from '@/lib/server/meta-connection'

const META_SAAS_COOKIE = 'meta_saas_oauth'

export async function GET(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', '/')
    return NextResponse.redirect(loginUrl)
  }

  try {
    const url = new URL(request.url)
    const clientId = url.searchParams.get('client_id')
    const returnTo = url.searchParams.get('return_to') || '/'

    const authorization = await createMetaAuthorizationUrl(
      {
        headers: new Headers(request.headers),
        nextUrl: url,
        url: request.url,
      } as never,
      clientId || 'global-meta',
      returnTo
    )

    const response = NextResponse.redirect(authorization.url)
    response.cookies.set({
      name: META_SAAS_COOKIE,
      value: Buffer.from(
        JSON.stringify({
          state: authorization.state,
          clientId: clientId || '',
          returnTo,
        })
      ).toString('base64url'),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    })

    return response
  } catch (error) {
    const fallback = new URL('/', request.url)
    fallback.searchParams.set(
      'meta_error',
      error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com a Meta.'
    )
    return NextResponse.redirect(fallback)
  }
}
