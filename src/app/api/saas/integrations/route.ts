import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { createLocalSaasIntegration, listLocalSaasIntegrations } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function GET() {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const response = await fetch(`${API_URL}/integrations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    try {
      const integrations = await listLocalSaasIntegrations(token)
      return NextResponse.json(integrations)
    } catch (fallbackError) {
      return NextResponse.json(
        { error: fallbackError instanceof Error ? fallbackError.message : 'Não foi possível carregar integrações.' },
        { status: 500 }
      )
    }
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const payload = await request.json()

  try {
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
  } catch (error) {
    try {
      const integration = await createLocalSaasIntegration(token, payload)
      return NextResponse.json(integration, { status: 201 })
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível salvar a integração.',
        },
        { status: 500 }
      )
    }
  }
}
