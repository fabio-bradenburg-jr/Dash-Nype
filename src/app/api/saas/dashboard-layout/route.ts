import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { updateLocalSaasClientDashboardLayout } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function PUT(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const payload = await request.json()
  const clientId = String(payload.clientId || '').trim()

  if (!clientId) {
    return NextResponse.json({ error: 'Cliente obrigatório para salvar o layout.' }, { status: 400 })
  }

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
        business_data: {
          ...(currentClient.business_data || {}),
          dashboardTemplates: Array.isArray(payload.dashboardTemplates) ? payload.dashboardTemplates : [],
          activeDashboardTemplateId: String(payload.activeDashboardTemplateId || ''),
          funnelSteps: Array.isArray(payload.funnelSteps) ? payload.funnelSteps : [],
          dashboardButtonColor: String(payload.dashboardButtonColor || ''),
          dashboardAccentColor: String(payload.dashboardAccentColor || ''),
          logoUrl: String(payload.logoUrl || ''),
          dashboardTheme:
            payload.dashboardTheme && typeof payload.dashboardTheme === 'object'
              ? payload.dashboardTheme
              : {
                  buttonColor: String(payload.dashboardButtonColor || ''),
                  accentColor: String(payload.dashboardAccentColor || ''),
                },
        },
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || data?.detail || 'Não foi possível salvar o layout pelo backend principal.')
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    try {
      const client = await updateLocalSaasClientDashboardLayout(token, payload)
      return NextResponse.json({ client })
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível salvar o layout do dashboard.',
        },
        { status: 500 }
      )
    }
  }
}
