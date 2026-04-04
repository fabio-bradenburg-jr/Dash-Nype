import {
  ArchitectShell,
  InitialBadge,
  PageIntro,
  SectionHeader,
  StatCard,
} from '@/components/dashboard/architect-shell'
import { getHomeOverview } from '@/lib/server/platform-api'
import { requirePlatformPageSession } from '@/lib/server/platform-auth'

const riskClientsFallback = [
  {
    name: 'Nebula Media',
    plan: 'Enterprise Plan',
    label: 'AI Risk Alert',
    tone: 'danger',
    note: 'Conversion rates dipped below the 12% benchmark for three straight weeks across EMEA.',
    score: '24/100',
    progress: '24%',
  },
  {
    name: 'Zenith Global',
    plan: 'SaaS Growth Plan',
    label: 'Review Required',
    tone: 'warning',
    note: "Engagement flattened after the Q3 update while a competitor launched aggressive conquesting campaigns.",
    score: '58/100',
    progress: '58%',
  },
  {
    name: 'Luxe Interior',
    plan: 'Retainer Standard',
    label: 'Critical Action',
    tone: 'danger',
    note: "Primary stakeholder signals show high abandonment risk and a weakened relationship with the account.",
    score: '12/100',
    progress: '12%',
  },
]

const quickActions = [
  { icon: 'add_circle', label: 'Onboard New Client' },
  { icon: 'edit_document', label: 'Create Agency Report' },
  { icon: 'mail', label: 'Campaign Outreach' },
]

export default async function HomePage() {
  const { user, access } = await requirePlatformPageSession()
  const overview = await getHomeOverview()
  const riskClients = overview.riskClients.length
    ? overview.riskClients.map((client) => ({
        name: client.name,
        plan: client.companyName,
        label: client.alerts[0]?.type?.replaceAll('_', ' ') ?? 'Risk Alert',
        tone:
          client.churnScore && client.churnScore >= 61
            ? 'danger'
            : client.churnScore && client.churnScore >= 31
              ? 'warning'
              : 'primary',
        note: client.alerts[0]?.description ?? 'Client flagged in the risk engine.',
        score: `${client.healthScore ?? 0}/100`,
        progress: `${client.healthScore ?? 0}%`,
      }))
    : riskClientsFallback

  return (
    <ArchitectShell
      activeNav="home"
      topTitle="Architect"
      userName={user.user_metadata?.full_name || user.email || 'User'}
      userRole={access.role || 'authenticated'}
    >
      <PageIntro
        kicker="Dashboard Home"
        title="Welcome back, Master User"
        description="Agency status is stable, the team is shipping well, and the highest-risk accounts are already surfaced here so the next action is always obvious."
        badge="Optimal"
      />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <StatCard label="Total Clients" value={String(overview.clientsCount)} meta="portfolio monitored" accent="primary" icon="group" />
        <StatCard label="Open Operations" value={String(overview.activeTasks)} meta="tasks in flight" accent="success" icon="payments" />
        <StatCard label="Active Alarms" value={String(overview.unresolvedAlerts)} meta="needs prioritization" accent="warning" icon="warning" />
        <StatCard label="Clients at Risk" value={String(riskClients.length)} meta="watchlist now" accent="danger" icon="person_remove" />
      </section>

      <section
        className="home-main-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
          gap: '2rem',
          alignItems: 'start',
        }}
      >
        <div>
          <SectionHeader title="Clients at Risk" action={<span>View All Intelligence</span>} />

          <div style={{ display: 'grid', gap: '1rem' }}>
            {riskClients.map((client) => {
              const progressColor =
                client.tone === 'danger' ? '#ba1a1a' : client.tone === 'warning' ? '#d97706' : '#4744e5'

              return (
                <article
                  className="home-risk-card"
                  key={client.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr) 110px',
                    gap: '1.5rem',
                    alignItems: 'center',
                    border: '1px solid rgba(199, 196, 216, 0.4)',
                    borderRadius: '1.25rem',
                    padding: '1.25rem',
                    background: 'rgba(255, 255, 255, 0.88)',
                    boxShadow: '0 18px 40px rgba(26, 27, 32, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <InitialBadge label={client.name.slice(0, 2).toUpperCase()} tone={client.tone} />
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 800 }}>{client.name}</h4>
                      <p style={{ color: '#767587', fontSize: '0.78rem', marginTop: '0.2rem' }}>{client.plan}</p>
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        display: 'inline-flex',
                        marginBottom: '0.55rem',
                        borderRadius: '0.5rem',
                        background: client.tone === 'danger' ? 'rgba(186, 26, 26, 0.1)' : 'rgba(217, 119, 6, 0.12)',
                        color: progressColor,
                        padding: '0.2rem 0.45rem',
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {client.label}
                    </span>
                    <p style={{ color: '#464555', fontSize: '0.84rem', lineHeight: 1.6 }}>{client.note}</p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: progressColor, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
                      {client.score}
                    </div>
                    <div
                      style={{
                        height: '0.35rem',
                        marginTop: '0.65rem',
                        borderRadius: '999px',
                        background: 'rgba(199, 196, 216, 0.3)',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ width: client.progress, height: '100%', background: progressColor }} />
                    </div>
                    <span
                      style={{
                        display: 'block',
                        marginTop: '0.45rem',
                        color: '#767587',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Health Score
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <section
            style={{
              border: '2px dashed rgba(199, 196, 216, 0.5)',
              borderRadius: '1.25rem',
              background: 'rgba(244, 243, 249, 0.9)',
              padding: '1.5rem',
            }}
          >
            <h4
              style={{
                marginBottom: '1.2rem',
                color: '#767587',
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Operations Hub
            </h4>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.8rem',
                    border: '1px solid rgba(199, 196, 216, 0.35)',
                    borderRadius: '0.9rem',
                    background: '#fff',
                    padding: '0.95rem 1rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#1a1b20',
                    textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ color: '#4744e5' }}>
                    {action.icon}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          </section>

          <section
            style={{
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(199, 196, 216, 0.4)',
              borderRadius: '1.25rem',
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '1.5rem',
              boxShadow: '0 18px 40px rgba(71, 68, 229, 0.08)',
            }}
          >
            <div style={{ position: 'absolute', right: '-1rem', bottom: '-1rem', opacity: 0.06 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '7rem' }}>
                psychology
              </span>
            </div>
            <h4
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#4744e5',
                fontSize: '0.72rem',
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                auto_awesome
              </span>
              Strategy Insight
            </h4>
            <p style={{ marginTop: '1rem', color: '#464555', fontSize: '0.92rem', lineHeight: 1.7 }}>
              Agency-wide performance is up <strong style={{ color: '#00864d' }}>8.2%</strong>. The retention bottleneck is
              concentrated in the SaaS early-stage segment, so Q4 capacity should lean into technical SEO and recovery pods.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid rgba(199, 196, 216, 0.35)',
              }}
            >
              <span style={{ color: '#767587', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Updated 2m ago
              </span>
              <button type="button" style={{ color: '#4744e5', fontSize: '0.8rem', fontWeight: 800, background: 'none', border: 0 }}>
                Optimize
              </button>
            </div>
          </section>
        </div>
      </section>

      <style>{`
        @media (max-width: 1080px) {
          .home-main-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 820px) {
          .home-risk-card {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </ArchitectShell>
  )
}
