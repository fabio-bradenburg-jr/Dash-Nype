import Link from 'next/link'
import { ArchitectShell, InitialBadge, PageIntro, SectionHeader, StatCard } from '@/components/dashboard/architect-shell'
import { ClientCreatePanel } from '@/components/dashboard/client-create-panel'
import { ClientManagePanel } from '@/components/dashboard/client-manage-panel'
import { getExecutiveOverview } from '@/lib/server/platform-api'
import { requirePlatformPageSession } from '@/lib/server/platform-auth'

const clientsFallback = [
  { name: 'Velvet & Vine', sector: 'Luxury Apparel', roi: '3.4x', roiWidth: '85%', health: 'Stable', healthTone: '#00864d', risk: '—', lifecycle: 'Active', badge: 'VV' },
  { name: 'Nebula Systems', sector: 'Enterprise SaaS', roi: '0.8x', roiWidth: '20%', health: 'Critical', healthTone: '#ba1a1a', risk: 'High', lifecycle: 'Paused', badge: 'NS' },
  { name: 'Origin Foods', sector: 'D2C Consumables', roi: '2.1x', roiWidth: '55%', health: 'Warning', healthTone: '#5a5e6f', risk: 'Low', lifecycle: 'Active', badge: 'OF' },
  { name: 'Koda Living', sector: 'Home Decor', roi: '4.2x', roiWidth: '95%', health: 'Excellent', healthTone: '#00864d', risk: '—', lifecycle: 'Active', badge: 'KL' },
]

export default async function ClientesPage() {
  const { user, access } = await requirePlatformPageSession()
  const executive = await getExecutiveOverview()
  const canManageClients = access.canManageClients
  const clients = executive.clients?.length
    ? executive.clients.map((client) => {
        const score = client.latestHealthScore ?? 0
        const healthTone = score >= 80 ? '#00864d' : score >= 60 ? '#d97706' : '#ba1a1a'
        const healthLabel = client.latestHealthBand === 'HEALTHY' ? 'Stable' : client.latestHealthBand === 'ATTENTION' ? 'Warning' : client.latestHealthBand === 'RISK' ? 'Critical' : 'Unknown'
        const churnBand = client.latestChurnBand === 'HIGH' ? 'High' : client.latestChurnBand === 'MEDIUM' ? 'Medium' : client.latestChurnBand === 'LOW' ? 'Low' : '—'

        return {
          id: client.id,
          name: client.name,
          sector: client.companyName,
          companyName: client.companyName,
          ownerName: client.ownerName,
          ownerEmail: client.ownerEmail,
          cnpj: client.cnpj,
          status: client.status,
          roi: client.latestRoi != null ? `${client.latestRoi.toFixed(1)}x` : '—',
          roiWidth: `${Math.max(8, Math.min(100, Math.round((client.latestRoi ?? 0) * 25)))}%`,
          health: healthLabel,
          healthTone,
          risk: churnBand,
          lifecycle: normalizeLifecycle(client.status),
          badge: client.name.slice(0, 2).toUpperCase(),
        }
      })
    : clientsFallback

  return (
    <ArchitectShell
      activeNav="clientes"
      topTitle="Architect"
      topSubtitle="Global Client Dashboard"
      userName={user.user_metadata?.full_name || user.email || 'User'}
      userRole={access.role || 'authenticated'}
    >
      <PageIntro
        kicker="Client Base"
        title="Portfolio view with clear signals"
        description="This layer is now organized like an executive operating system: fast search, clean ranking, risk visibility, and enough context to act without opening five tabs."
        badge={`${clients.length || 0} Active`}
      />

      <section className="clients-hero-grid" style={{ display: 'grid', gridTemplateColumns: '2fr repeat(2, minmax(0, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <article
          style={{
            borderRadius: '1.25rem',
            background: 'linear-gradient(135deg, #4744e5, #6161ff)',
            color: '#fff',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(71, 68, 229, 0.18)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
              Portfolio Growth
            </span>
            <span className="material-symbols-outlined">trending_up</span>
          </div>
          <strong style={{ display: 'block', fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.06em' }}>{executive.totals.averageRoi}x</strong>
          <p style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.84rem' }}>
            Average ROI across all active clients in the current portfolio view.
          </p>
        </article>

        <StatCard label="Revenue" value={`$${Math.round(executive.totals.revenue).toLocaleString('en-US')}`} meta="latest synced revenue" accent="success" icon="groups" />
        <StatCard label="At Risk" value={String(executive.totals.highRisk)} meta="high churn pressure" accent="danger" icon="warning" />
      </section>

      <section
        style={{
          borderRadius: '2rem',
          background: 'rgba(244, 243, 249, 0.95)',
          padding: '0.4rem',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
          marginBottom: '2rem',
        }}
      >
        <div style={{ borderRadius: '1.8rem', background: '#fff', padding: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                minWidth: 'min(100%, 24rem)',
                borderRadius: '1rem',
                background: '#e8e7ee',
                padding: '0.9rem 1rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ color: '#767587' }}>
                search
              </span>
              <span style={{ color: '#767587', fontSize: '0.9rem' }}>Search clients, industries, or owners...</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" style={controlButton('#ffdad6', '#93000a')}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                  filter_list
                </span>
                Risk Status
              </button>
              <button type="button" style={controlButton('#e8e7ee', '#464555')}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                  sort
                </span>
                Sort by ROI
              </button>
              {canManageClients ? <ClientCreatePanel /> : <ReadOnlyPill label="Read only" />}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ color: 'rgba(70, 69, 85, 0.7)', fontSize: '0.66rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  <th style={headCell}>Client Entity</th>
                  <th style={headCell}>Current ROI</th>
                  <th style={headCell}>Health Score</th>
                  <th style={headCell}>Churn Risk</th>
                  <th style={headCell}>Lifecycle</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>Management</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.name} style={{ borderTop: '1px solid rgba(199, 196, 216, 0.24)' }}>
                    <td style={bodyCell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                        <InitialBadge label={client.badge} tone={client.health === 'Critical' ? 'danger' : client.health === 'Warning' ? 'warning' : 'primary'} />
                        <div>
                          <Link href={client.id ? `/clientes/${client.id}/apresentacao` : '#'} style={{ fontWeight: 800, color: client.health === 'Critical' ? '#ba1a1a' : '#1a1b20', textDecoration: 'none' }}>
                            {client.name}
                          </Link>
                          <p style={{ color: '#767587', fontSize: '0.76rem', marginTop: '0.2rem' }}>{client.sector}</p>
                        </div>
                      </div>
                    </td>
                    <td style={bodyCell}>
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <strong style={{ color: client.healthTone, fontFamily: 'monospace', fontSize: '1rem' }}>{client.roi}</strong>
                        <div style={{ width: '4rem', height: '0.18rem', borderRadius: '999px', background: '#c7c4d8' }}>
                          <div style={{ width: client.roiWidth, height: '100%', borderRadius: '999px', background: client.healthTone }} />
                        </div>
                      </div>
                    </td>
                    <td style={bodyCell}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          borderRadius: '0.55rem',
                          background: `${client.healthTone}18`,
                          color: client.healthTone,
                          padding: '0.35rem 0.55rem',
                          fontSize: '0.7rem',
                          fontWeight: 900,
                          textTransform: 'uppercase',
                        }}
                      >
                        <span style={{ width: '0.45rem', height: '0.45rem', borderRadius: '999px', background: client.healthTone }} />
                        {client.health}
                      </span>
                    </td>
                    <td style={bodyCell}>
                      <span
                        style={{
                          display: 'inline-flex',
                          borderRadius: '0.55rem',
                          background: client.risk === 'High' ? '#dee1f6' : 'transparent',
                          color: client.risk === 'High' ? '#171b2a' : '#767587',
                          padding: client.risk === 'High' || client.risk === 'Low' ? '0.35rem 0.55rem' : '0',
                          fontSize: '0.7rem',
                          fontWeight: 900,
                          textTransform: 'uppercase',
                        }}
                      >
                        {client.risk}
                      </span>
                    </td>
                    <td style={bodyCell}>
                      <span style={{ borderRadius: '999px', background: '#e8e7ee', padding: '0.42rem 0.7rem', fontSize: '0.76rem', fontWeight: 700 }}>
                        {client.lifecycle}
                      </span>
                    </td>
                    <td style={{ ...bodyCell, textAlign: 'right' }}>
                      {'id' in client ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Link
                            href={`/clientes/${client.id}/apresentacao`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              borderRadius: '0.7rem',
                              background: '#eef0ff',
                              color: '#4744e5',
                              padding: '0.55rem 0.7rem',
                              fontSize: '0.68rem',
                              fontWeight: 900,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              textDecoration: 'none',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
                              slideshow
                            </span>
                            Present
                          </Link>

                          {canManageClients ? (
                            <ClientManagePanel
                              client={{
                                id: client.id,
                                name: client.name,
                                companyName: client.companyName,
                                ownerName: client.ownerName,
                                ownerEmail: client.ownerEmail,
                                cnpj: client.cnpj,
                                status: client.status,
                              }}
                            />
                          ) : (
                            <button type="button" style={{ border: 0, background: 'transparent', color: '#767587' }}>
                              <span className="material-symbols-outlined">visibility</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button type="button" style={{ border: 0, background: 'transparent', color: '#767587' }}>
                          <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid rgba(199, 196, 216, 0.24)',
            }}
          >
            <span style={{ color: '#767587', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Showing {clients.length} clients in this view
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {['1', '2', '3', '14'].map((page, index) => (
                <button
                  key={page}
                  type="button"
                  style={{
                    width: '2rem',
                    height: '2rem',
                    border: 0,
                    borderRadius: '0.6rem',
                    background: index === 0 ? '#4744e5' : 'transparent',
                    color: index === 0 ? '#fff' : '#464555',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                  }}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <article style={infoCardStyle('4px solid #4744e5')}>
          <SectionHeader title="Upcoming Renewals" />
          <div style={{ display: 'grid', gap: '1rem' }}>
            <InfoRow label="Solaris Retail" value="Oct 12" />
            <InfoRow label="Peak Performance" value="Oct 15" />
          </div>
        </article>

        <article style={infoCardStyle()}>
          <SectionHeader title="Resource Allocation" />
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem', height: '5rem' }}>
            {['60%', '90%', '40%', '75%', '30%'].map((height, index) => (
              <div
                key={height}
                style={{
                  flex: 1,
                  height,
                  borderRadius: '0.4rem 0.4rem 0 0',
                  background: index === 1 ? '#4744e5' : `rgba(71, 68, 229, ${0.18 + index * 0.08})`,
                }}
              />
            ))}
          </div>
          <p style={{ marginTop: '1rem', color: '#767587', fontSize: '0.76rem' }}>84% capacity utilized across teams.</p>
        </article>

        <article style={infoCardStyle()}>
          <SectionHeader title="Campaign Optimization" />
          <p style={{ color: '#464555', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Three potential growth hacks were identified for the highest-ROI accounts with enough margin to scale this quarter.
          </p>
          <button type="button" style={{ marginTop: '1rem', border: 0, background: 'transparent', color: '#4744e5', fontSize: '0.8rem', fontWeight: 800 }}>
            View Insights
          </button>
        </article>
      </section>

      <style>{`
        @media (max-width: 980px) {
          .clients-hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </ArchitectShell>
  )
}

function normalizeLifecycle(status) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'ONBOARDING') return 'Onboarding'
  if (status === 'PAUSED') return 'Paused'
  if (status === 'AT_RISK') return 'At Risk'
  if (status === 'CHURNED') return 'Churned'
  return status ?? 'Active'
}

function controlButton(background, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    border: 0,
    borderRadius: '0.8rem',
    background,
    color,
    padding: '0.75rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }
}

function ReadOnlyPill({ label }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        borderRadius: '999px',
        background: '#eeedf4',
        color: '#5a5e6f',
        padding: '0.65rem 0.85rem',
        fontSize: '0.72rem',
        fontWeight: 900,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
        visibility
      </span>
      {label}
    </span>
  )
}

const headCell = {
  padding: '0 1rem 1rem',
  textAlign: 'left',
}

const bodyCell = {
  padding: '1.15rem 1rem',
}

function infoCardStyle(borderLeft = '1px solid rgba(199, 196, 216, 0.45)') {
  return {
    borderLeft,
    borderRadius: '1.2rem',
    background: 'rgba(255,255,255,0.92)',
    padding: '1.5rem',
    boxShadow: '0 18px 40px rgba(26, 27, 32, 0.05)',
  }
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
      <span style={{ fontSize: '0.92rem' }}>{label}</span>
      <span
        style={{
          borderRadius: '0.5rem',
          background: '#e8e7ee',
          padding: '0.25rem 0.5rem',
          fontSize: '0.68rem',
          fontWeight: 800,
        }}
      >
        {value}
      </span>
    </div>
  )
}
