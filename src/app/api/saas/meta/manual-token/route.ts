import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

const META_SAAS_PENDING_COOKIE = 'meta_saas_pending'

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const accessToken = String(body.accessToken || body.token || '').trim()

    if (!accessToken) {
      return NextResponse.json({ error: 'Informe o código/API token da Meta.' }, { status: 400 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: META_SAAS_PENDING_COOKIE,
      value: Buffer.from(
        JSON.stringify({
          clientId: '',
          accessToken,
          tokenType: 'Bearer',
          scope: 'manual',
          expiryDate: null,
          metaUserId: '',
          metaUserName: 'Token manual',
        })
      ).toString('base64url'),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar o token da Meta.' }, { status: 500 })
  }
}
