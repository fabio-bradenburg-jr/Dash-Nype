import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  exchangeMetaAuthorizationCode,
  exchangeMetaLongLivedToken,
  getMetaProfile,
} from '@/lib/server/meta-connection'

const META_SAAS_COOKIE = 'meta_saas_oauth'
const META_SAAS_PENDING_COOKIE = 'meta_saas_pending'

function parseCookie(value: string | undefined) {
  if (!value) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const redirectUrl = new URL('/', request.url)

  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthCookie = parseCookie((await cookies()).get(META_SAAS_COOKIE)?.value)

    if (!code || !state || !oauthCookie?.state || oauthCookie.state !== state) {
      throw new Error('A confirmação da Meta expirou. Tente conectar novamente.')
    }

    const shortLivedToken = await exchangeMetaAuthorizationCode(
      {
        headers: new Headers(request.headers),
        nextUrl: url,
        url: request.url,
      } as never,
      code
    )
    const longLivedToken = await exchangeMetaLongLivedToken(
      {
        headers: new Headers(request.headers),
        nextUrl: url,
        url: request.url,
      } as never,
      shortLivedToken.access_token
    )
    const metaProfile = await getMetaProfile(longLivedToken.access_token)

    redirectUrl.pathname = oauthCookie.returnTo || '/'
    redirectUrl.searchParams.set('meta_pending', '1')
    if (oauthCookie.clientId) {
      redirectUrl.searchParams.set('meta_client_id', oauthCookie.clientId)
    }

    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set({
      name: META_SAAS_PENDING_COOKIE,
      value: Buffer.from(
        JSON.stringify({
          clientId: oauthCookie.clientId,
          accessToken: longLivedToken.access_token,
          tokenType: longLivedToken.token_type || 'Bearer',
          scope: shortLivedToken.scope || longLivedToken.scope || '',
          expiryDate: longLivedToken.expires_in
            ? new Date(Date.now() + Number(longLivedToken.expires_in) * 1000).toISOString()
            : null,
          metaUserId: metaProfile.id,
          metaUserName: metaProfile.name,
        })
      ).toString('base64url'),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set({
      name: META_SAAS_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return response
  } catch (error) {
    redirectUrl.searchParams.set(
      'meta_error',
      error instanceof Error ? error.message : 'Não foi possível concluir a conexão com a Meta.'
    )
    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set({
      name: META_SAAS_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return response
  }
}
