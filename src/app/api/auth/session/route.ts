import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { getLocalSessionUser } from '@/lib/server/platform-auth-fallback'

const API_URL = getPlatformApiUrl()

export async function GET() {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error('Sessão remota inválida')
    }

    const user = await response.json()
    return NextResponse.json({ authenticated: true, user })
  } catch {
    try {
      const user = await getLocalSessionUser(token)
      return NextResponse.json({ authenticated: true, user, fallback: true })
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }
  }
}
