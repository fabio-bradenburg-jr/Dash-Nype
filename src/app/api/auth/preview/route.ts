import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createPreviewAccessToken } from '@/lib/server/platform-auth-fallback'

export async function POST() {
  try {
    const token = await createPreviewAccessToken()
    const response = NextResponse.json({ ok: true, preview: true })
    response.cookies.set({
      name: PLATFORM_AUTH_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Não foi possível liberar o acesso de preview.' }, { status: 500 })
  }
}
