import { NextResponse } from 'next/server'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

const ALLOWED_DOMAINS = ['app.assessorialp.com.br']

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
  const domain = host.split(':')[0].toLowerCase()
  const hasAuthCookie = Boolean(request.cookies.get(PLATFORM_AUTH_COOKIE)?.value)

  // Block any domain that is not in the allowed list
  // (allow localhost and Vercel preview deployments for development)
  const isLocalDev = domain === 'localhost' || domain.endsWith('.localhost')
  const isVercelPreview = domain.endsWith('.vercel.app')
  if (!isLocalDev && !isVercelPreview && !ALLOWED_DOMAINS.includes(domain)) {
    return new NextResponse(
      '<!DOCTYPE html><html><head><title>Acesso não autorizado</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc"><div style="text-align:center"><h1 style="color:#0f172a">Acesso não autorizado</h1><p style="color:#64748b">Este domínio não está autorizado a acessar a plataforma.</p></div></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html' } }
    )
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
