'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  LineChart,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react'

import { FunnelBuilder } from '@/components/saas/funnel-builder'
import { ThemePanel } from '@/components/saas/theme-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformSnapshot } from '@/lib/saas/types'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Operations', icon: Activity },
  { label: 'Projects', icon: BriefcaseBusiness },
  { label: 'Settings', icon: Settings2 },
]

function formatValue(value: number, format: string) {
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  if (format === 'percent') return `${value}%`
  if (format === 'ratio') return `${value.toFixed(2)}x`
  return new Intl.NumberFormat('en-US').format(value)
}

function healthTone(band: string) {
  if (band === 'green') return 'green'
  if (band === 'yellow') return 'yellow'
  if (band === 'red') return 'red'
  return 'slate'
}

export function DashboardShell({ snapshot }: { snapshot: PlatformSnapshot }) {
  const [selectedClientId, setSelectedClientId] = useState(snapshot.selectedClient.id)
  const selectedClient = snapshot.clients.find((client) => client.id === selectedClientId) ?? snapshot.selectedClient

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--saas-primary', snapshot.theme.primaryColor)
    root.style.setProperty('--saas-accent', snapshot.theme.accentColor)
    root.style.setProperty('--saas-surface', snapshot.theme.backgroundColor)
  }, [snapshot.theme])

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background:
          'radial-gradient(circle at top left, color-mix(in srgb, var(--saas-primary) 18%, transparent), transparent 32%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--saas-accent) 18%, transparent), transparent 26%), linear-gradient(180deg, color-mix(in srgb, var(--saas-surface) 92%, white), white)',
      }}
    >
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-8">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[280px] flex-col rounded-[32px] border border-white/70 bg-slate-950 px-6 py-7 text-white shadow-[0_24px_80px_rgba(2,6,23,0.28)] lg:flex">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="font-manrope text-lg font-extrabold">Nype Orbit</p>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Marketing OS</p>
            </div>
          </div>
          <nav className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.label} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="mt-auto rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold">Multi-tenant guardrails</p>
            <p className="mt-2 text-sm text-white/60">Admin and operator views stay scoped to the authenticated tenant and only expose their own client portfolio.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <section className="rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">Agency command center</p>
                <h1 className="font-manrope text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
                  Metrics, CRM, operations, and client delivery in one SaaS surface.
                </h1>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <select
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm"
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                >
                  {snapshot.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <Button variant="secondary">Sync sources</Button>
                <Button>New client</Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {snapshot.clientDashboard.overview_metrics.map((metric) => (
              <Card key={metric.label} className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                    <Badge tone={metric.change >= 0 ? 'green' : 'red'}>{metric.change >= 0 ? '+' : ''}{metric.change}%</Badge>
                  </div>
                  <p className="mt-5 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
                    {formatValue(metric.value, metric.format)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Client performance timeline</CardTitle>
                  <CardDescription>Unified spend, conversions, and ROAS across Meta, Google, LinkedIn, and Agendor touches.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={snapshot.clientDashboard.time_series}>
                    <defs>
                      <linearGradient id="spendFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--saas-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--saas-primary)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#64748b" tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="spend" stroke="var(--saas-primary)" fill="url(#spendFill)" strokeWidth={3} />
                    <Area type="monotone" dataKey="conversions" stroke="var(--saas-accent)" fillOpacity={0} strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Results by objective</CardTitle>
                  <CardDescription>Normalized outcomes mapped into a unified conversion model.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {snapshot.clientDashboard.results_by_objective.map((item) => (
                  <div key={item.objective} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold capitalize text-slate-900">{item.objective}</p>
                      <p className="text-sm text-slate-500">{item.volume} volume</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(item.volume / 2, 100)}%`,
                          background: 'linear-gradient(90deg, var(--saas-primary), var(--saas-accent))',
                        }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">${item.cost_per_result.toFixed(2)} cost per result</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr_1fr]">
            <FunnelBuilder initialStages={snapshot.clientDashboard.funnel} />

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Audience insights</CardTitle>
                  <CardDescription>Top cities and age groups by normalized performance.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={snapshot.clientDashboard.top_cities}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="city" stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--saas-primary)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {snapshot.clientDashboard.age_performance.map((row) => (
                    <div key={row.range} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm font-medium text-slate-600">{row.range}</span>
                      <span className="font-semibold text-slate-950">{row.roas.toFixed(2)}x ROAS</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Creative distribution</CardTitle>
                  <CardDescription>Top creatives and revenue efficiency split.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={snapshot.clientDashboard.top_creatives.map((item) => ({ name: item.creative, value: item.roas }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={3}
                      >
                        {snapshot.clientDashboard.top_creatives.map((item, index) => (
                          <Cell key={item.creative} fill={['#0f766e', '#f97316', '#0f172a'][index % 3]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {snapshot.clientDashboard.top_creatives.map((creative) => (
                    <div key={creative.creative} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm font-medium text-slate-600">{creative.creative}</span>
                      <span className="font-semibold text-slate-950">{creative.roas.toFixed(2)}x</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Campaign table</CardTitle>
                  <CardDescription>Filterable acquisition view with normalized CPA and ROAS.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-3 font-medium">Campaign</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Spend</th>
                      <th className="pb-3 font-medium">Conversions</th>
                      <th className="pb-3 font-medium">CPA</th>
                      <th className="pb-3 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snapshot.clientDashboard.campaigns.map((campaign) => (
                      <tr key={campaign.campaign_name}>
                        <td className="py-4">
                          <div>
                            <p className="font-semibold text-slate-900">{campaign.campaign_name}</p>
                            <p className="text-xs capitalize text-slate-400">{campaign.source.replace('_', ' ')}</p>
                          </div>
                        </td>
                        <td className="py-4"><Badge tone={campaign.status === 'ACTIVE' ? 'green' : 'yellow'}>{campaign.status.toLowerCase()}</Badge></td>
                        <td className="py-4">${campaign.spend.toFixed(0)}</td>
                        <td className="py-4">{campaign.conversions}</td>
                        <td className="py-4">${campaign.cpa.toFixed(2)}</td>
                        <td className="py-4">{campaign.roas.toFixed(2)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Client profile</CardTitle>
                    <CardDescription>Business data, tenant health score, and operational status.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-manrope text-2xl font-extrabold">{selectedClient.name}</p>
                      <p className="text-sm text-slate-500">{selectedClient.niche} • {selectedClient.company}</p>
                    </div>
                    <Badge tone={healthTone(selectedClient.health_band)}>{selectedClient.health_band}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Average ticket</p>
                      <p className="mt-2 text-xl font-bold">${selectedClient.average_ticket.toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">LTV</p>
                      <p className="mt-2 text-xl font-bold">${selectedClient.ltv.toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Goal</p>
                      <p className="mt-2 text-xl font-bold capitalize">{selectedClient.main_goal}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Health score</p>
                      <p className="mt-2 text-xl font-bold">{selectedClient.health_score}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>Platform connections and last sync status.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {snapshot.integrations
                    .filter((integration) => integration.client_id === selectedClient.id)
                    .map((integration) => (
                      <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <p className="font-semibold capitalize text-slate-900">{integration.provider.replace('_', ' ')}</p>
                          <p className="text-xs text-slate-400">{integration.account_name}</p>
                        </div>
                        <Badge tone={integration.status === 'connected' ? 'green' : 'yellow'}>{integration.status}</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Operations dashboard</CardTitle>
                  <CardDescription>Internal team visibility for portfolio health and revenue efficiency.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Total clients', value: snapshot.operations.total_clients },
                  { label: 'Active clients', value: snapshot.operations.active_clients },
                  { label: 'Churn rate', value: `${snapshot.operations.churn_rate}%` },
                  { label: 'Average LTV', value: `$${snapshot.operations.average_ltv.toLocaleString()}` },
                  { label: 'CAC', value: `$${snapshot.operations.cac.toFixed(2)}` },
                  { label: 'Average ROI', value: `${snapshot.operations.average_roi.toFixed(2)}x` },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-950">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Health score system</CardTitle>
                  <CardDescription>Green, yellow, and red client scoring from conversions, CPA, ROAS, and inactivity.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.operations.client_health.map((client) => (
                  <div key={client.client_id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{client.client_name}</p>
                      <p className="text-xs text-slate-400">{client.roas.toFixed(2)}x ROAS</p>
                    </div>
                    <div className="text-right">
                      <Badge tone={healthTone(client.health_band)}>{client.health_band}</Badge>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{client.health_score}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <ThemePanel initialTheme={snapshot.theme} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Project management</CardTitle>
                  <CardDescription>Client onboarding checklist and operator task queue.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {snapshot.checklist.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <Badge tone={item.completed ? 'green' : 'yellow'}>{item.completed ? 'done' : 'pending'}</Badge>
                  </div>
                ))}
                <div className="rounded-[28px] bg-slate-950 p-5 text-white">
                  <p className="text-sm uppercase tracking-[0.22em] text-white/50">Client status</p>
                  <p className="mt-2 text-2xl font-bold capitalize">{selectedClient.status}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tasks</CardTitle>
                  <CardDescription>Create campaigns, adjust creatives, and optimize performance per client.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.tasks.map((task) => (
                  <div key={task.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{task.description}</p>
                      </div>
                      <Badge tone={task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'yellow' : 'slate'}>
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                      <span>{task.assignee_name}</span>
                      <span>{task.due_date}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="bg-slate-950 text-white">
              <CardHeader>
                <div>
                  <CardTitle className="text-white">Module map</CardTitle>
                  <CardDescription className="text-white/60">The platform ships with clients, integrations, dashboards, health, and project modules.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Client CRM', icon: Building2, copy: 'Full CRUD, business profile, linked integrations, and tenant scoping.' },
                  { label: 'Marketing analytics', icon: LineChart, copy: 'Unified campaign metrics, funnel analytics, insights, and ROAS reporting.' },
                  { label: 'Operator workspace', icon: Users, copy: 'Tasks, checklist status, churn watch, and global portfolio KPIs.' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-white/80" />
                        <p className="font-semibold">{item.label}</p>
                      </div>
                      <p className="mt-2 text-sm text-white/60">{item.copy}</p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Client portfolio</CardTitle>
                  <CardDescription>Quick access to health, lifecycle stage, and account value across the tenant.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.clients.map((client) => (
                  <button
                    key={client.id}
                    className={`flex w-full items-center justify-between rounded-3xl border px-4 py-4 text-left transition ${
                      client.id === selectedClientId ? 'border-transparent bg-slate-950 text-white shadow-xl' : 'border-slate-200 bg-white text-slate-900'
                    }`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div>
                      <p className="font-semibold">{client.name}</p>
                      <p className={`text-sm ${client.id === selectedClientId ? 'text-white/60' : 'text-slate-500'}`}>
                        {client.niche} • ${client.ltv.toLocaleString()} LTV
                      </p>
                    </div>
                    <Badge tone={healthTone(client.health_band)}>{client.health_score}</Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  )
}
