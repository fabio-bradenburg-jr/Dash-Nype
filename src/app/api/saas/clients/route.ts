import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalSaasClient } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()

  try {
    const response = await fetch(`${API_URL}/clients`, {
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
  } catch (error) {
    try {
      const client = await createLocalSaasClient(token, payload)
      return NextResponse.json(client, { status: 201 })
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível criar o cliente.',
        },
        { status: 500 }
      )
    }
  }
}
