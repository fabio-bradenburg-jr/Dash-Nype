import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'

const API_URL = getPlatformApiUrl()

export async function GET(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'ClientId obrigatório.' }, { status: 400 })
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const [clientResponse, dashboardResponse, checklistResponse, tasksResponse, integrationsResponse] = await Promise.all([
      fetch(`${API_URL}/clients/${clientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/dashboards/clients/${clientId}`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/clients/${clientId}/checklist`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/clients/${clientId}/tasks`, { headers, cache: 'no-store' }),
      fetch(`${API_URL}/integrations`, { headers, cache: 'no-store' }),
    ])

    if (!clientResponse.ok) {
      const payload = await clientResponse.json().catch(() => ({}))
      return NextResponse.json(payload, { status: clientResponse.status })
    }

    const [client, clientDashboard, checklist, tasks, integrations] = await Promise.all([
      clientResponse.json(),
      dashboardResponse.json(),
      checklistResponse.json(),
      tasksResponse.json(),
      integrationsResponse.json(),
    ])

    return NextResponse.json({
      client,
      clientDashboard,
      checklist,
      tasks,
      integrations: Array.isArray(integrations)
        ? integrations.filter((integration) => integration.client_id === clientId)
        : [],
    })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar o contexto do cliente.' }, { status: 500 })
  }
}
