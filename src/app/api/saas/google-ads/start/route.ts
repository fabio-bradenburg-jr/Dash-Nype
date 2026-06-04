import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

export async function GET(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', '/')
    return NextResponse.redirect(loginUrl)
  }

  const url = new URL(request.url)
  const returnTo = url.searchParams.get('return_to') || '/'
  const legacyStart = new URL('/api/google-ads/auth/start', request.url)
  legacyStart.searchParams.set('return_to', returnTo)
  return NextResponse.redirect(legacyStart)
}
