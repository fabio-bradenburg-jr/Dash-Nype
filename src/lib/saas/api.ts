import { demoPlatformSnapshot } from '@/lib/saas/mock-data'
import { PlatformSnapshot } from '@/lib/saas/types'

const API_URL = process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? 'http://localhost:8000/api/v1'
const DEMO_TOKEN = process.env.NEXT_PUBLIC_PLATFORM_DEMO_TOKEN

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: DEMO_TOKEN ? { Authorization: `Bearer ${DEMO_TOKEN}` } : {},
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${path}`)
  }

  return response.json()
}

export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  try {
    const clients = await apiFetch<PlatformSnapshot['clients']>('/clients')
    const selectedClient = clients[0]
    if (!selectedClient) {
      return demoPlatformSnapshot
    }

    const [clientDashboard, operations, checklist, tasks, integrations] = await Promise.all([
      apiFetch<PlatformSnapshot['clientDashboard']>(`/dashboards/clients/${selectedClient.id}`),
      apiFetch<PlatformSnapshot['operations']>('/dashboards/operations'),
      apiFetch<PlatformSnapshot['checklist']>(`/clients/${selectedClient.id}/checklist`),
      apiFetch<PlatformSnapshot['tasks']>(`/clients/${selectedClient.id}/tasks`),
      apiFetch<PlatformSnapshot['integrations']>('/integrations'),
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
