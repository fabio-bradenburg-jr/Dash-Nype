import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArchitectShell, PageIntro, SectionHeader, StatCard } from '@/components/dashboard/architect-shell'
import { requirePlatformPageSession } from '@/lib/server/platform-auth'
import { getClientDetail } from '@/lib/server/platform-api'

export default async function ClienteDetalhePage({ params }) {
  const { user, access } = await requirePlatformPageSession()
  const { clientId } = await params

  if (!access.canManageClients && access.viewableClientIds.length && !access.viewableClientIds.includes(clientId)) {
    redirect('/clientes')
  }

  const detail = await getClientDetail(clientId)

  if (!detail) {
    notFound()
  }

  const healthTone = detail.metrics.healthScore >= 80 ? '#00864d' : detail.metrics.healthScore >= 60 ? '#d97706' : '#ba1a1a'
  const churnTone = detail.metrics.churnScore >= 61 ? '#ba1a1a' : detail.metrics.churnScore >= 31 ? '#d97706' : '#00864d'

  return (
    <ArchitectShell
      activeNav="clientes"
      topTitle={detail.client.name}
      topSubtitle="Client Dashboard"
      userName={user.user_metadata?.full_name || user.email || 'User'}
      userRole={access.role || 'authenticated'}
    >
      <PageIntro
        kicker="Client Overview"
        title={`${detail.client.name} performance command`}
        description={`${detail.client.companyName} agora tem um quadro dedicado interno. Para apresentar métricas ao cliente, use o dashboard legado de apresentação.`}
        badge={normalizeLifecycle(detail.client.status)}
      />

      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href="/clientes" style={{ color: 'var(--button-primary, var(--accent-blue))', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Back to clients
        </Link>

        <Link
          href={`/clientes/${detail.client.id}/apresentacao`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderRadius: '0.95rem',
            background: 'linear-gradient(135deg, var(--button-primary, var(--accent-blue)), var(--button-primary-hover, color-mix(in srgb, var(--accent-blue) 78%, #0f172a 22%)))',
            color: '#fff',
            padding: '0.85rem 1rem',
            fontSize: '0.82rem',
            fontWeight: 900,
            textDecoration: 'none',
            boxShadow: '0 16px 30px rgba(var(--accent-rgb), 0.18)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            slideshow
          </span>
          Open client presentation
        </Link>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard label="Fee" value={formatCurrency(detail.metrics.fee)} meta="monthly recurring" accent="primary" icon="receipt_long" />
        <StatCard label="Revenue" value={formatCurrency(detail.metrics.revenue)} meta="latest synced revenue" accent="success" icon="payments" />
        <StatCard label="ROI" value={`${detail.metrics.roi.toFixed(1)}x`} meta={`without fee ${detail.metrics.roiWithoutFee.toFixed(1)}x`} accent="primary" icon="query_stats" />
        <StatCard label="Health Score" value={String(detail.metrics.healthScore)} meta={detail.metrics.healthBand} accent={detail.metrics.healthScore >= 80 ? 'success' : detail.metrics.healthScore >= 60 ? 'warning' : 'danger'} icon="favorite" />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '2rem' }}>
        <div style={{ display: 'grid', gap: '2rem' }}>
          <section style={panelStyle}>
            <SectionHeader title="Financial Performance" />
            <div style={metricGridStyle}>
              <Metric label="Investment" value={formatCurrency(detail.metrics.investment)} />
              <Metric label="LTV" value={formatCurrency(detail.metrics.ltv)} />
              <Metric label="Margin" value={`${detail.metrics.marginPercent.toFixed(1)}%`} />
              <Metric label="MM/F" value={detail.metrics.mmf.toFixed(2)} />
            </div>
          </section>

          <section style={panelStyle}>
            <SectionHeader title="Open Alerts" action={<span>{detail.alerts.length} signals</span>} />
            <div style={{ display: 'grid', gap: '1rem' }}>
              {detail.alerts.length ? detail.alerts.map((alert) => (
                <article key={alert.id || alert.description} style={{ border: '1px solid rgba(199,196,216,0.32)', borderRadius: '1rem', padding: '1rem', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.92rem' }}>{alert.title || alert.type.replaceAll('_', ' ')}</strong>
                    <span style={{ color: alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? '#ba1a1a' : '#d97706', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>
                      {alert.severity}
                    </span>
                  </div>
                  <p style={{ color: '#464555', fontSize: '0.84rem', lineHeight: 1.6 }}>{alert.description}</p>
                </article>
              )) : <EmptyState copy="No unresolved alerts for this client right now." />}
            </div>
          </section>

          <section style={panelStyle}>
            <SectionHeader title="Operational Queue" action={<span>{detail.tasks.length} items</span>} />
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {detail.tasks.length ? detail.tasks.map((task) => (
                <article key={task.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: '1rem', alignItems: 'center', borderBottom: '1px solid rgba(199,196,216,0.18)', paddingBottom: '0.85rem' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>{task.title}</strong>
                    <span style={{ color: '#767587', fontSize: '0.74rem' }}>{task.description || 'Client delivery stream'}</span>
                  </div>
                  <span style={{ color: mapPriorityColor(task.priority), fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>{task.priority}</span>
                  <span style={{ color: '#5a5e6f', fontSize: '0.72rem', fontWeight: 800 }}>{normalizeTaskStatus(task.status)}</span>
                </article>
              )) : <EmptyState copy="No active tasks linked to this client yet." />}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: '1.5rem', alignSelf: 'start' }}>
          <section style={{ ...panelStyle, background: '#1a1b20', color: '#fff', boxShadow: '0 24px 48px rgba(26,27,32,0.24)' }}>
            <SectionHeader title="Risk Snapshot" action={<span style={{ color: 'rgba(255,255,255,0.7)' }}>{detail.metrics.churnBand}</span>} />
            <div style={{ display: 'grid', gap: '1rem' }}>
              <RiskLine label="Health" value={`${detail.metrics.healthScore}/100`} tone={healthTone} />
              <RiskLine label="Churn" value={`${detail.metrics.churnScore}`} tone={churnTone} />
              <RiskLine label="Stakeholder" value={detail.client.ownerName || 'Not informed'} tone="#c1c1ff" />
            </div>
          </section>

          <section style={panelStyle}>
            <SectionHeader title="Client Card" />
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <InfoRow label="Company" value={detail.client.companyName} />
              <InfoRow label="Owner" value={detail.client.ownerName || 'Not informed'} />
              <InfoRow label="Email" value={detail.client.ownerEmail || 'Not informed'} />
              <InfoRow label="CNPJ" value={detail.client.cnpj || 'Not informed'} />
              <InfoRow label="Lifecycle" value={normalizeLifecycle(detail.client.status)} />
            </div>
          </section>
        </aside>
      </section>
    </ArchitectShell>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ borderRadius: '1rem', background: '#fff', padding: '1rem', border: '1px solid rgba(199,196,216,0.28)' }}>
      <span style={{ display: 'block', color: '#767587', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 900 }}>{value}</strong>
    </div>
  )
}

function RiskLine({ label, value, tone }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.35rem' }}>
        <span style={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.74rem' }}>{label}</span>
        <strong style={{ color: '#fff', fontSize: '0.8rem' }}>{value}</strong>
      </div>
      <div style={{ height: '0.35rem', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        <div style={{ width: '72%', height: '100%', background: tone }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
      <span style={{ color: '#767587', fontSize: '0.76rem', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#1a1b20', fontSize: '0.82rem', fontWeight: 800, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function EmptyState({ copy }) {
  return <p style={{ color: '#767587', fontSize: '0.84rem' }}>{copy}</p>
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function normalizeLifecycle(status) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'ONBOARDING') return 'Onboarding'
  if (status === 'PAUSED') return 'Paused'
  if (status === 'AT_RISK') return 'At Risk'
  if (status === 'CHURNED') return 'Churned'
  return status ?? 'Unknown'
}

function normalizeTaskStatus(status) {
  if (status === 'IN_PROGRESS') return 'In progress'
  if (status === 'DONE') return 'Done'
  if (status === 'BLOCKED') return 'Blocked'
  return 'Open'
}

function mapPriorityColor(priority) {
  if (priority === 'URGENT') return '#ba1a1a'
  if (priority === 'HIGH') return '#d97706'
  if (priority === 'MEDIUM') return '#5a5e6f'
  return '#00864d'
}

const panelStyle = {
  borderRadius: '1.4rem',
  background: 'rgba(244,243,249,0.96)',
  padding: '1.5rem',
  border: '1px solid rgba(199,196,216,0.28)',
}

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '1rem',
}
