import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { updateLocalSaasClient } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function PUT(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { clientId } = await context.params
  const payload = await request.json()

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const currentResponse = await fetch(`${API_URL}/clients/${clientId}`, {
      headers,
      cache: 'no-store',
    })

    const currentClient = currentResponse.ok ? await currentResponse.json().catch(() => ({})) : {}
    const response = await fetch(`${API_URL}/clients/${clientId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...payload,
        business_data: {
          ...(currentClient.business_data || {}),
          ...((payload.business_data && typeof payload.business_data === 'object') ? payload.business_data : {}),
        },
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || data?.detail || 'Não foi possível atualizar o cliente.')
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    try {
      const client = await updateLocalSaasClient(token, clientId, payload)
      return NextResponse.json(client)
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível atualizar o cliente.',
        },
        { status: 500 }
      )
    }
  }
}
