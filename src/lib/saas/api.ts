import { cookies } from 'next/headers'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { demoPlatformSnapshot } from '@/lib/saas/mock-data'
import { PlatformSnapshot } from '@/lib/saas/types'

const API_URL = getPlatformApiUrl()
const DEMO_TOKEN = process.env.NEXT_PUBLIC_PLATFORM_DEMO_TOKEN

async function apiFetch<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: token || DEMO_TOKEN ? { Authorization: `Bearer ${token || DEMO_TOKEN}` } : {},
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${path}`)
  }

  return response.json()
}

export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  try {
    const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
    const clients = await apiFetch<PlatformSnapshot['clients']>('/clients', token)
    const selectedClient = clients[0]
    if (!selectedClient) {
      const operations = await apiFetch<PlatformSnapshot['operations']>('/dashboards/operations', token).catch(
        () => demoPlatformSnapshot.operations
      )
      return {
        ...demoPlatformSnapshot,
        operations: {
          ...operations,
          total_clients: clients.length,
          active_clients: clients.filter((client) => client.status === 'active').length,
          client_health: [],
        },
      }
    }

    const [clientDashboard, operations, checklist, tasks, integrations] = await Promise.all([
      apiFetch<PlatformSnapshot['clientDashboard']>(`/dashboards/clients/${selectedClient.id}`, token),
      apiFetch<PlatformSnapshot['operations']>('/dashboards/operations', token),
      apiFetch<PlatformSnapshot['checklist']>(`/clients/${selectedClient.id}/checklist`, token),
      apiFetch<PlatformSnapshot['tasks']>(`/clients/${selectedClient.id}/tasks`, token),
      apiFetch<PlatformSnapshot['integrations']>('/integrations', token),
    ])

    return {
      ...demoPlatformSnapshot,
      clients,
      selectedClient,
      clientDashboard,
      operations,
      checklist,
      tasks,
      integrations,
    }
  } catch {
    return demoPlatformSnapshot
  }
}
