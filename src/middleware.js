import { NextResponse } from 'next/server'

const legacyPrefixes = [
  '/home',
  '/clientes',
  '/operacao',
  '/dashboard',
  '/settings',
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

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    return NextResponse.next()
  }

  const isLegacyRoute = legacyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

  if (isLegacyRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
