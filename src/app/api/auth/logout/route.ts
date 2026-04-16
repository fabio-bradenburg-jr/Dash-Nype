import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

export async function POST() {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    // O logout do SaaS novo não depende do Supabase estar configurado.
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: PLATFORM_AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
