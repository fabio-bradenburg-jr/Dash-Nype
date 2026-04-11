import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createGoogleDriveAuthorizationUrl } from '@/lib/server/google-drive-oauth'

export async function GET(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', '/')
    return NextResponse.redirect(loginUrl)
  }

  try {
    const url = new URL(request.url)
    const clientId = String(url.searchParams.get('client_id') || '').trim()
    const returnTo = url.searchParams.get('return_to') || '/'

    if (!clientId) {
      const fallback = new URL('/', request.url)
      fallback.searchParams.set('google_drive_error', 'Selecione um cliente antes de conectar o Google Drive.')
      return NextResponse.redirect(fallback)
    }

    const authorizationUrl = await createGoogleDriveAuthorizationUrl(request, clientId, returnTo)
    return NextResponse.redirect(authorizationUrl)
  } catch (error) {
    const fallback = new URL('/', request.url)
    fallback.searchParams.set(
      'google_drive_error',
      error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com o Google Drive.'
    )
    return NextResponse.redirect(fallback)
  }
}
