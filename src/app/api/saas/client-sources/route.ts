import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function PUT(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const clientId = String(body.clientId || '').trim()
    const knowledgeSources = Array.isArray(body.knowledgeSources) ? body.knowledgeSources : []

    if (!clientId) {
      return NextResponse.json({ error: 'ClientId obrigatório.' }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const currentResponse = await fetch(`${API_URL}/clients/${clientId}`, {
      headers,
      cache: 'no-store',
    })

    if (!currentResponse.ok) {
      const payload = await currentResponse.json().catch(() => ({}))
      return NextResponse.json(payload, { status: currentResponse.status })
    }

    const currentClient = await currentResponse.json()
    const response = await fetch(`${API_URL}/clients/${clientId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        business_data: {
          ...(currentClient.business_data || {}),
          knowledge_sources: knowledgeSources,
        },
      }),
      cache: 'no-store',
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar as fontes do cliente.' }, { status: 500 })
  }
}
