import { DashboardShell } from '@/components/saas/dashboard-shell'
import { getPlatformSnapshot } from '@/lib/saas/api'

export const dynamic = 'force-dynamic'

export default async function SaaSPage() {
  const snapshot = await getPlatformSnapshot()

  return <DashboardShell snapshot={snapshot} />
}
