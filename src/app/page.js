import DashboardShell from '@/components/dashboard/DashboardShell'

export const dynamic = 'force-dynamic'

const ROOT_TABS = new Set(['assistant', 'clientes', 'apresentacao', 'usuarios', 'settings'])

export default async function RootPage({ searchParams }) {
  const params = await searchParams
  const requestedTab = typeof params?.tab === 'string' ? params.tab : 'assistant'
  const initialTab = ROOT_TABS.has(requestedTab) ? requestedTab : 'assistant'

  return <DashboardShell initialTab={initialTab} />
}
