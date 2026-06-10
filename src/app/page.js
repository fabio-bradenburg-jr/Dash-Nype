import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/saas/dashboard-shell'
import { getPlatformSnapshot } from '@/lib/saas/api'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const cookieStore = await cookies()
  const hasAccessToken = Boolean(cookieStore.get(PLATFORM_AUTH_COOKIE)?.value)

  if (!hasAccessToken) {
    redirect('/login')
  }

  const snapshot = await getPlatformSnapshot()

  return <DashboardShell snapshot={snapshot} />
}
