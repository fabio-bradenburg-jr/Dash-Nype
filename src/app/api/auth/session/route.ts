import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

const API_URL = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? 'http://localhost:8000/api/v1'

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
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const user = await response.json()
    return NextResponse.json({ authenticated: true, user })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
