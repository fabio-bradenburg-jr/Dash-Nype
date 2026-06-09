import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { ALLOWED_DOMAINS, parseDomain } from '@/lib/server/domain-config'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const domain = parseDomain(host)

  // Allow local development and Vercel preview deployments
  if (
    domain === 'localhost' ||
    domain.endsWith('.localhost') ||
    domain.endsWith('.vercel.app')
  ) {
    return NextResponse.next()
  }

  if (!ALLOWED_DOMAINS.includes(domain)) {
    return new NextResponse(
      '<!DOCTYPE html><html><head><title>Acesso não autorizado</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc"><div style="text-align:center"><h1 style="color:#0f172a">Acesso não autorizado</h1><p style="color:#64748b">Este domínio não está autorizado a acessar a plataforma.</p></div></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html' } }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
