import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const response = await fetch(`${API_URL}/integrations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a integração.' }, { status: 500 })
  }
}
