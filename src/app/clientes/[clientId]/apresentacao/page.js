import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { getClientDetail } from '@/lib/server/platform-api'
import { requirePlatformPageSession } from '@/lib/server/platform-auth'
import { buildLegacyClientRecordFromDetail } from '@/lib/server/legacy-client-record'

export default async function ClienteApresentacaoPage({ params }) {
  const { access } = await requirePlatformPageSession()
  const { clientId } = await params

  if (!access.canManageClients && access.viewableClientIds.length && !access.viewableClientIds.includes(clientId)) {
    redirect('/clientes')
  }

  const detail = await getClientDetail(clientId)
  const initialClientRecord = buildLegacyClientRecordFromDetail(detail)

  return <DashboardShell initialTab="apresentacao" initialActiveClientId={clientId} initialClientRecord={initialClientRecord} />
}
