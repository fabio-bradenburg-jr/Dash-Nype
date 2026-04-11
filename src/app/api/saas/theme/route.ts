import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

const API_URL = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? 'http://localhost:8000/api/v1'

export async function PUT(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const response = await fetch(`${API_URL}/settings/theme`, {
      method: 'PUT',
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
    return NextResponse.json({ error: 'Unable to save theme.' }, { status: 500 })
  }
}
