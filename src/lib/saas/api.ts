import { cookies } from 'next/headers'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { demoPlatformSnapshot } from '@/lib/saas/mock-data'
import { PlatformSnapshot } from '@/lib/saas/types'
import { listLocalSaasClients, listLocalSaasIntegrations } from '@/lib/saas/local-api'

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
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value

  try {
    const clients = await apiFetch<PlatformSnapshot['clients']>('/clients', token)
    const selectedClient = clients[0]
    if (!selectedClient) {
      return {
        ...demoPlatformSnapshot,
        clients,
      }
    }

    const [clientDashboard, integrations] = await Promise.all([
      apiFetch<PlatformSnapshot['clientDashboard']>(`/dashboards/clients/${selectedClient.id}`, token),
      apiFetch<PlatformSnapshot['integrations']>('/integrations', token),
    ])

    return {
      ...demoPlatformSnapshot,
      clients,
      selectedClient,
      clientDashboard,
      integrations,
    }
  } catch {
    if (token) {
      try {
        const [clients, integrations] = await Promise.all([listLocalSaasClients(token), listLocalSaasIntegrations(token)])
        return {
          ...demoPlatformSnapshot,
          clients,
          selectedClient: clients[0] || demoPlatformSnapshot.selectedClient,
          integrations,
        }
      } catch {
        return demoPlatformSnapshot
      }
    }

    return demoPlatformSnapshot
  }
}
