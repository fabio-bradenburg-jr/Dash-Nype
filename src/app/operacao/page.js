import { ArchitectShell, InitialBadge, PageIntro, SectionHeader, StatCard } from '@/components/dashboard/architect-shell'
import { TaskCreatePanel } from '@/components/dashboard/task-create-panel'
import { TaskManagePanel } from '@/components/dashboard/task-manage-panel'
import { TaskStatusSelect } from '@/components/dashboard/task-status-select'
import { getOperationsOverview } from '@/lib/server/platform-api'
import { requirePlatformPageSession } from '@/lib/server/platform-auth'

export default async function OperacaoPage() {
  const { user, access } = await requirePlatformPageSession()
  const operations = await getOperationsOverview()
  const canManageClients = access.canManageClients
  const teamMembers = operations.teamMembers.length
    ? operations.teamMembers.map((member) => ({
        name: member.fullName,
        role: member.role,
        score: member.performanceScore,
        tone: member.performanceScore >= 90 ? 'success' : member.performanceScore >= 80 ? 'warning' : 'primary',
      }))
    : teamMembersFallback

  const tasks = operations.tasks.length
    ? operations.tasks.map((task) => ({
        id: task.id,
        name: task.title,
        title: task.title,
        description: task.description,
        area: task.clientName || task.description || 'Internal Ops',
        priority: normalizePriority(task.priority),
        priorityRaw: task.priority,
        priorityTone: mapPriorityColor(task.priority),
        due: formatDate(task.dueDate),
        dueDate: task.dueDate,
        status: task.status,
      }))
    : tasksFallback

  const activities = operations.recentActivity.length ? operations.recentActivity : activitiesFallback
  const headerActions = (
    <>
      <button type="button" style={secondaryHeaderButton}>
        Generate Report
      </button>
      {canManageClients ? <TaskCreatePanel /> : <ReadOnlyPill label="Read only" />}
    </>
  )

  return (
    <ArchitectShell
      activeNav="operacao"
      topTitle="Architect"
      topSubtitle="Operations Overview"
      headerActions={headerActions}
      userName={user.user_metadata?.full_name || user.email || 'User'}
      userRole={access.role || 'authenticated'}
    >
      <PageIntro
        kicker="Operations"
        title="Real-time execution, team allocation, and demand pressure"
        description="The operations layer now reads like a command center: active workload, throughput, ownership, and recent movement are visible at a glance."
        badge={`${operations.totals.productivityVelocity}% Velocity`}
      />

      <section className="ops-hero-grid" style={{ display: 'grid', gridTemplateColumns: '2fr repeat(2, minmax(0, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <article
          style={{
            borderRadius: '2rem',
            background: 'rgba(255,255,255,0.92)',
            padding: '1.5rem',
            boxShadow: '0 18px 40px rgba(26, 27, 32, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ color: '#5a5e6f', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Productivity Velocity
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#00864d', fontSize: '0.8rem', fontWeight: 800 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                trending_up
              </span>
              +12%
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: '1rem' }}>
            <strong style={{ fontSize: '2.6rem', fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.06em' }}>{operations.totals.productivityVelocity}%</strong>
            <div style={{ flex: 1, height: '0.5rem', borderRadius: '999px', background: 'rgba(199, 196, 216, 0.28)', marginBottom: '0.45rem', overflow: 'hidden' }}>
              <div style={{ width: '84%', height: '100%', background: '#4744e5' }} />
            </div>
          </div>
          <p style={{ marginTop: '1rem', color: '#767587', fontSize: '0.82rem' }}>Team capacity utilized across 24 active projects.</p>
        </article>

        <StatCard
          label="Active Demands"
          value={String(operations.totals.activeDemands)}
          meta={`${operations.totals.criticalDemands} critical / ${operations.totals.warningDemands} warning / ${operations.totals.healthyDemands} healthy`}
          accent="warning"
          icon="assignment_late"
        />
        <StatCard label="Team Members" value={String(operations.totals.teamMembers)} meta="active in this tenant" accent="primary" icon="groups" />
      </section>

      <section className="ops-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '2rem' }}>
        <div style={{ display: 'grid', gap: '2rem' }}>
          <section>
            <SectionHeader title="Team Performance Scorecard" action={<span>View All Members</span>} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {teamMembers.map((member) => (
                <article
                  key={member.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    borderRadius: '1.2rem',
                    background: 'rgba(244, 243, 249, 0.96)',
                    padding: '1.25rem',
                    border: '1px solid rgba(199, 196, 216, 0.35)',
                  }}
                >
                  <InitialBadge label={member.name.slice(0, 2).toUpperCase()} tone={member.tone} />
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800 }}>{member.name}</h4>
                    <p style={{ color: '#767587', fontSize: '0.76rem', marginTop: '0.2rem' }}>{member.role}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: member.score >= 90 ? '#00864d' : '#d97706', fontSize: '1.1rem', fontWeight: 900 }}>{member.score}</strong>
                    <p style={{ color: '#767587', fontSize: '0.68rem' }}>Score</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section>
            <SectionHeader title="Critical Pending Demands" action={<span>Filter: Priority</span>} />
            <div
              style={{
                overflow: 'hidden',
                borderRadius: '1.2rem',
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 18px 40px rgba(26, 27, 32, 0.05)',
              }}
            >
              <div
                className="ops-table-head"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: '1rem',
                  padding: '1rem 1.5rem',
                  borderBottom: '1px solid rgba(199, 196, 216, 0.24)',
                  color: '#5a5e6f',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <div>Task Name</div>
                <div>Priority</div>
                <div>Deadline</div>
                <div style={{ textAlign: 'right' }}>Status</div>
              </div>

              {tasks.map((task) => (
                <div
                  className="ops-table-row"
                  key={task.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: '1rem',
                    alignItems: 'center',
                    padding: '1.1rem 1.5rem',
                    borderTop: '1px solid rgba(199, 196, 216, 0.14)',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.92rem' }}>{task.name}</strong>
                    <span style={{ color: '#767587', fontSize: '0.72rem' }}>{task.area}</span>
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-flex',
                        borderRadius: '0.6rem',
                        background: `${task.priorityTone}16`,
                        color: task.priorityTone,
                        padding: '0.35rem 0.55rem',
                        fontSize: '0.66rem',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                      }}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div style={{ color: '#464555', fontSize: '0.82rem' }}>{task.due}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.6rem', color: '#767587' }}>
                    {'id' in task && canManageClients ? (
                      <>
                        <TaskStatusSelect taskId={task.id} value={task.status} />
                        <TaskManagePanel
                          task={{
                            id: task.id,
                            title: task.title,
                            description: task.description,
                            priority: task.priorityRaw,
                            status: task.status,
                            dueDate: task.dueDate,
                          }}
                        />
                      </>
                    ) : (
                      <span className="material-symbols-outlined">more_vert</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: '1.5rem', alignSelf: 'start' }}>
          <section
            style={{
              borderRadius: '1.4rem',
              background: '#1a1b20',
              color: '#fff',
              padding: '1.5rem',
              boxShadow: '0 24px 48px rgba(26, 27, 32, 0.24)',
            }}
          >
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1rem', fontWeight: 800 }}>Task Throughput (Weekly)</h3>
            <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem', height: '10rem', marginBottom: '1.5rem' }}>
              {['40%', '65%', '45%', '85%', '55%', '75%', '30%'].map((height, index) => (
                <div
                  key={height}
                  style={{
                    flex: 1,
                    height,
                    borderRadius: '0.6rem 0.6rem 0 0',
                    background: index === 3 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.18)',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.76rem' }}>Total Completed</p>
                <strong style={{ fontSize: '1.2rem', fontWeight: 800 }}>{operations.totals.completedTasks} Tasks</strong>
              </div>
              <span style={{ alignSelf: 'start', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.12)', padding: '0.3rem 0.5rem', fontSize: '0.66rem', fontWeight: 900 }}>
                +24% vs LY
              </span>
            </div>
          </section>

          <section
            style={{
              border: '1px solid rgba(199, 196, 216, 0.35)',
              borderRadius: '1.2rem',
              background: 'rgba(255,255,255,0.92)',
              padding: '1.5rem',
            }}
          >
            <SectionHeader title="Recent Activity" />
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              {activities.map((activity) => (
                <div key={activity.text} style={{ display: 'flex', gap: '0.8rem' }}>
                  <span style={{ width: '0.55rem', height: '0.55rem', borderRadius: '999px', background: activity.tone, marginTop: '0.35rem' }} />
                  <div>
                    <p style={{ color: '#1a1b20', fontSize: '0.82rem', fontWeight: 700 }}>{activity.text}</p>
                    <p style={{ color: '#767587', fontSize: '0.7rem', marginTop: '0.2rem' }}>{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" style={{ width: '100%', marginTop: '1.5rem', border: 0, borderRadius: '0.9rem', background: '#eeedf4', padding: '0.9rem 1rem', color: '#5a5e6f', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Load More Events
            </button>
          </section>
        </aside>
      </section>

      <style jsx>{`
        @media (max-width: 1080px) {
          .ops-hero-grid,
          .ops-main-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 760px) {
          .ops-table-head,
          .ops-table-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </ArchitectShell>
  )
}

const teamMembersFallback = [
  { name: 'Sarah Jenkins', role: 'Senior Strategist', score: 98, tone: 'success' },
  { name: 'Marcus Chen', role: 'Lead Developer', score: 94, tone: 'primary' },
  { name: 'Alina Vosh', role: 'UI/UX Designer', score: 88, tone: 'warning' },
  { name: 'Jordan Smith', role: 'Project Manager', score: 82, tone: 'warning' },
]

const tasksFallback = [
  { name: 'Client Q4 Audit', area: 'Portfolio A', priority: 'Immediate', priorityTone: '#ba1a1a', due: 'Oct 24, 2023', status: 'OPEN' },
  { name: 'API Middleware Sync', area: 'Internal Ops', priority: 'Medium', priorityTone: '#5a5e6f', due: 'Oct 28, 2023', status: 'IN_PROGRESS' },
  { name: 'Onboarding Assets', area: 'Creative', priority: 'Low', priorityTone: '#00864d', due: 'Nov 02, 2023', status: 'DONE' },
]

const activitiesFallback = [
  { tone: '#4744e5', text: 'Sarah Jenkins completed Q4 Design Specs', time: '2 mins ago' },
  { tone: '#00864d', text: 'New task added to Development Queue', time: '15 mins ago' },
  { tone: '#ba1a1a', text: 'Deadline alert triggered for Internal Audit', time: '1 hour ago' },
  { tone: '#5a5e6f', text: 'Weekly report exported by Alex', time: '3 hours ago' },
]

function normalizePriority(priority) {
  if (priority === 'URGENT') return 'Immediate'
  if (priority === 'HIGH') return 'High'
  if (priority === 'MEDIUM') return 'Medium'
  if (priority === 'LOW') return 'Low'
  return priority ?? 'Medium'
}

function mapPriorityColor(priority) {
  if (priority === 'URGENT') return '#ba1a1a'
  if (priority === 'HIGH' || priority === 'MEDIUM') return '#5a5e6f'
  return '#00864d'
}

function formatDate(dateString) {
  if (!dateString) return 'No deadline'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

const secondaryHeaderButton = {
  border: 0,
  borderRadius: '0.9rem',
  background: '#dee1f6',
  color: '#424657',
  padding: '0.8rem 1rem',
  fontSize: '0.78rem',
  fontWeight: 800,
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
        padding: '0.72rem 0.95rem',
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
