import { NextResponse } from 'next/server'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

const legacyPrefixes = [
  '/home',
  '/clientes',
  '/operacao',
  '/dashboard',
  '/usuarios',
  '/produtos',
  '/contexto',
  '/calendar',
  '/clickup',
  '/monday',
  '/assistant',
  '/apresentacao',
  '/privacy',
  '/login',
  '/saas',
]

export function proxy(request) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''
  const hasAuthCookie = Boolean(request.cookies.get(PLATFORM_AUTH_COOKIE)?.value)

  if (host === 'app.nype.company' || host === 'nype.company') {
    const url = request.nextUrl.clone()
    url.protocol = 'https:'
    url.host = 'app.assessorialp.com.br'
    return NextResponse.redirect(url, 308)
  }

  if (pathname === '/login') {
    // A tela de login valida a sessão no client. Não redirecionamos só por cookie,
    // porque um token expirado aqui causaria loop entre /login e /.
    return NextResponse.next()
  }

  if (pathname === '/') {
    if (!hasAuthCookie) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', '/')
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  const isLegacyRoute = legacyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

  if (isLegacyRoute) {
    const url = request.nextUrl.clone()
    url.pathname = hasAuthCookie ? '/' : '/login'
    if (!hasAuthCookie) {
      url.searchParams.set('next', '/')
    }
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
