import DashboardShell from '@/components/dashboard/DashboardShell'

export const dynamic = 'force-dynamic'

export default function RootPage() {
  return <DashboardShell initialTab="home" />
}
