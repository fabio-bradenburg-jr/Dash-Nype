import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import DashboardShell from '@/components/dashboard/DashboardShell'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

export const dynamic = 'force-dynamic'

const ROOT_TABS = new Set(['assistant', 'clientes', 'apresentacao', 'usuarios', 'settings'])

export default async function RootPage({ searchParams }) {
  const cookieStore = await cookies()
  const hasAccessToken = Boolean(cookieStore.get(PLATFORM_AUTH_COOKIE)?.value)

  if (!hasAccessToken) {
    redirect('/login')
  }

  const params = await searchParams
  const requestedTab = typeof params?.tab === 'string' ? params.tab : 'assistant'
  const initialTab = ROOT_TABS.has(requestedTab) ? requestedTab : 'assistant'

  return <DashboardShell initialTab={initialTab} />
}
