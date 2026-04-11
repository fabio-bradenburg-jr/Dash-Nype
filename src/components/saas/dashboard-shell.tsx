'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  Cpu,
  LayoutDashboard,
  Link2,
  LineChart,
  ShieldCheck,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react'

import { FunnelBuilder } from '@/components/saas/funnel-builder'
import { AiAssistantPanel } from '@/components/saas/ai-assistant-panel'
import { ClientKnowledgePanel } from '@/components/saas/client-knowledge-panel'
import { ThemePanel } from '@/components/saas/theme-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientContextBundle, KnowledgeSource, PlatformSnapshot } from '@/lib/saas/types'

const navigation = [
  { label: 'Visão geral', icon: LayoutDashboard },
  { label: 'Clientes', icon: Users },
  { label: 'Operações', icon: Activity },
  { label: 'Projetos', icon: BriefcaseBusiness },
  { label: 'IA', icon: Cpu },
  { label: 'Configurações', icon: Settings2 },
]

function formatValue(value: number, format: string) {
  if (format === 'currency') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
  if (format === 'percent') return `${value}%`
  if (format === 'ratio') return `${value.toFixed(2)}x`
  return new Intl.NumberFormat('pt-BR').format(value)
}

function healthTone(band: string) {
  if (band === 'green') return 'green'
  if (band === 'yellow') return 'yellow'
  if (band === 'red') return 'red'
  return 'slate'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    todo: 'a fazer',
    in_progress: 'em andamento',
    done: 'concluída',
    active: 'ativo',
    onboarding: 'onboarding',
    paused: 'pausado',
    connected: 'conectado',
  }
  return map[status] || status.replace('_', ' ')
}

function objectiveLabel(objective: string) {
  const map: Record<string, string> = {
    purchases: 'compras',
    leads: 'leads',
    messages: 'mensagens',
  }
  return map[objective] || objective
}

function extractKnowledgeSourcesFromBusinessData(businessData: Record<string, unknown> | undefined): KnowledgeSource[] {
  const rawSources = Array.isArray(businessData?.knowledge_sources) ? businessData.knowledge_sources : []

  return rawSources
    .map((item, index) => {
      const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const title = String(source.title || '').trim()
      const url = String(source.url || '').trim()
      if (!title || !url) return null

      return {
        id: String(source.id || `source-${index + 1}`),
        title,
        url,
        type: ['google_drive_folder', 'google_sheets', 'google_docs', 'link'].includes(String(source.type || ''))
          ? (source.type as KnowledgeSource['type'])
          : 'link',
        notes: String(source.notes || '').trim(),
      }
    })
    .filter(Boolean) as KnowledgeSource[]
}

export function DashboardShell({ snapshot }: { snapshot: PlatformSnapshot }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedClientId, setSelectedClientId] = useState(snapshot.selectedClient.id)
  const [selectedClient, setSelectedClient] = useState(snapshot.selectedClient)
  const [clientDashboard, setClientDashboard] = useState(snapshot.clientDashboard)
  const [checklist, setChecklist] = useState(snapshot.checklist)
  const [tasks, setTasks] = useState(snapshot.tasks)
  const [clientIntegrations, setClientIntegrations] = useState(
    snapshot.integrations.filter((integration) => integration.client_id === snapshot.selectedClient.id)
  )
  const [loadingClientContext, setLoadingClientContext] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [linkingMeta, setLinkingMeta] = useState(false)
  const [loadingMetaAccounts, setLoadingMetaAccounts] = useState(false)
  const [metaAccounts, setMetaAccounts] = useState<Array<{ id: string; name: string; clientId: string }>>([])
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState('')
  const [showClientForm, setShowClientForm] = useState(false)
  const [clientForm, setClientForm] = useState({
    name: '',
    company: '',
    niche: '',
    average_ticket: '0',
    main_goal: 'leads',
    ltv: '0',
    start_date: new Date().toISOString().slice(0, 10),
    status: 'onboarding',
    target_roas: '2.5',
  })
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(
    extractKnowledgeSourcesFromBusinessData(snapshot.selectedClient.business_data as Record<string, unknown>)
  )
  const selectedClientIntegrations = clientIntegrations
  const selectedMetaIntegration = selectedClientIntegrations.find((integration) => integration.provider === 'meta_ads')
  const positiveMetrics = clientDashboard.overview_metrics.slice(0, 3)
  const metaError = searchParams.get('meta_error')
  const metaPending = searchParams.get('meta_pending') === '1'
  const googleDriveError = searchParams.get('google_drive_error')
  const googleDriveConnected = searchParams.get('google_drive_connected') === '1'
  const selectedClientFromQuery = searchParams.get('selected_client')

  async function reloadClientContext(clientId: string) {
    const response = await fetch(`/api/saas/client-context?clientId=${encodeURIComponent(clientId)}`, {
      cache: 'no-store',
    })
    const data = (await response.json()) as ClientContextBundle
    if (!response.ok) {
      throw new Error('Não foi possível carregar o cliente selecionado.')
    }

    setSelectedClient(data.client)
    setClientDashboard(data.clientDashboard)
    setChecklist(data.checklist)
    setTasks(data.tasks)
    setClientIntegrations(data.integrations)
    setKnowledgeSources(
      extractKnowledgeSourcesFromBusinessData(data.client.business_data as Record<string, unknown>)
    )
  }

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--saas-primary', snapshot.theme.primaryColor)
    root.style.setProperty('--saas-accent', snapshot.theme.accentColor)
    root.style.setProperty('--saas-surface', snapshot.theme.backgroundColor)
  }, [snapshot.theme])

  useEffect(() => {
    async function loadClientContext() {
      if (selectedClientId === selectedClient.id) return
      setLoadingClientContext(true)
      try {
        await reloadClientContext(selectedClientId)
      } finally {
        setLoadingClientContext(false)
      }
    }

    loadClientContext()
  }, [selectedClient.id, selectedClientId])

  useEffect(() => {
    if (selectedClientFromQuery && selectedClientFromQuery !== selectedClientId) {
      setSelectedClientId(selectedClientFromQuery)
    }
  }, [selectedClientFromQuery, selectedClientId])

  useEffect(() => {
    async function loadMetaAccounts() {
      if (!metaPending) return
      setLoadingMetaAccounts(true)
      try {
        const response = await fetch('/api/saas/meta/adaccounts', { cache: 'no-store' })
        const data = await response.json()
        const accounts = data.accounts || []
        setMetaAccounts(accounts)
        if (accounts[0]?.id) {
          setSelectedMetaAccountId(accounts[0].id)
        }
      } finally {
        setLoadingMetaAccounts(false)
      }
    }

    loadMetaAccounts()
  }, [metaPending])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function handleCreateClient() {
    setCreatingClient(true)
    try {
      await fetch('/api/saas/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...clientForm,
          average_ticket: Number(clientForm.average_ticket),
          ltv: Number(clientForm.ltv),
          target_roas: Number(clientForm.target_roas),
          business_data: {},
        }),
      })
      setShowClientForm(false)
      router.refresh()
    } finally {
      setCreatingClient(false)
    }
  }

  async function handleSyncSources() {
    if (selectedClientIntegrations.length === 0) return
    setSyncing(true)
    try {
      await fetch('/api/saas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationIds: selectedClientIntegrations.map((integration) => integration.id) }),
      })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  function handleConnectMeta() {
    window.location.href = `/api/saas/meta/start?client_id=${encodeURIComponent(selectedClient.id)}&return_to=/`
  }

  async function handleLinkMetaAccount() {
    const selectedAccount = metaAccounts.find((account) => account.id === selectedMetaAccountId)
    if (!selectedAccount) return

    setLinkingMeta(true)
    try {
      await fetch('/api/saas/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          accountId: selectedAccount.id,
          accountName: selectedAccount.name,
        }),
      })
      router.replace('/')
      router.refresh()
    } finally {
      setLinkingMeta(false)
    }
  }

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background:
          'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--saas-primary) 18%, transparent), transparent 28%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--saas-accent) 22%, transparent), transparent 24%), radial-gradient(circle at 50% 100%, rgba(15,23,42,0.05), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--saas-surface) 94%, white), #ffffff)',
      }}
    >
      <div className="mx-auto flex max-w-[1640px] gap-6 px-4 py-6 lg:px-8">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[292px] flex-col rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#020617,#0f172a)] px-6 py-7 text-white shadow-[0_30px_100px_rgba(2,6,23,0.36)] lg:flex">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
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
                <button
                  key={item.label}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    item.label === 'Visão geral'
                      ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.12)]'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="mt-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <p className="text-sm font-semibold">Segurança multi-tenant</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/60">As visões de admin e operação ficam limitadas ao tenant autenticado e só expõem a própria carteira.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {metaError ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
              {metaError}
            </div>
          ) : null}
          {googleDriveError ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
              {googleDriveError}
            </div>
          ) : null}
          {googleDriveConnected ? (
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
              Google Drive conectado com sucesso ao cliente selecionado.
            </div>
          ) : null}

          <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))] p-5 shadow-[0_26px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.15),transparent_46%),radial-gradient(circle_at_bottom,rgba(15,118,110,0.18),transparent_42%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--saas-accent)]" />
                  Central da operação
                </div>
                <h1 className="font-manrope text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">
                  Métricas, CRM, operação e entrega ao cliente em uma única plataforma.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  Dados unificados de campanha, sync com CRM, saúde da carteira e fluxos operacionais em uma camada premium de controle para a agência inteira.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {positiveMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{metric.label}</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold text-slate-950">{formatValue(metric.value, metric.format)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 xl:min-w-[420px]">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <select
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm"
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                  >
                    {snapshot.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" className="h-12" onClick={handleSyncSources} disabled={syncing}>
                    {syncing ? 'Sincronizando...' : 'Sincronizar'}
                  </Button>
                  <Button className="h-12" onClick={() => setShowClientForm((value) => !value)}>
                    {showClientForm ? 'Fechar' : 'Novo cliente'}
                  </Button>
                  <Button className="h-12" variant="ghost" onClick={handleLogout}>Sair</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Saúde</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-manrope text-2xl font-extrabold">{clientDashboard.health_score}</span>
                      <Badge tone={healthTone(clientDashboard.health_band)}>{clientDashboard.health_band}</Badge>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Integrações</p>
                    <p className="mt-2 font-manrope text-2xl font-extrabold">{selectedClientIntegrations.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Objetivo</p>
                    <p className="mt-2 font-manrope text-xl font-extrabold capitalize">{objectiveLabel(selectedClient.main_goal)}</p>
                  </div>
                </div>
                {loadingClientContext ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                    Carregando o contexto completo do cliente selecionado...
                  </div>
                ) : null}
                {showClientForm ? (
                  <div className="grid gap-3 rounded-[28px] border border-slate-200/70 bg-white/90 p-4 shadow-sm md:grid-cols-2">
                    {[
                      { key: 'name', label: 'Nome', type: 'text' },
                      { key: 'company', label: 'Empresa', type: 'text' },
                      { key: 'niche', label: 'Nicho', type: 'text' },
                      { key: 'average_ticket', label: 'Ticket médio', type: 'number' },
                      { key: 'ltv', label: 'LTV', type: 'number' },
                      { key: 'start_date', label: 'Data de início', type: 'date' },
                      { key: 'target_roas', label: 'ROAS alvo', type: 'number' },
                    ].map((field) => (
                      <label key={field.key} className="grid gap-2 text-sm font-medium text-slate-600">
                        {field.label}
                        <input
                          className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                          type={field.type}
                          value={clientForm[field.key as keyof typeof clientForm]}
                          onChange={(event) =>
                            setClientForm((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <label className="grid gap-2 text-sm font-medium text-slate-600">
                      Objetivo
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                        value={clientForm.main_goal}
                        onChange={(event) => setClientForm((current) => ({ ...current, main_goal: event.target.value }))}
                      >
                        <option value="leads">Leads</option>
                        <option value="sales">Vendas</option>
                        <option value="messages">Mensagens</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-600">
                      Status
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                        value={clientForm.status}
                        onChange={(event) => setClientForm((current) => ({ ...current, status: event.target.value }))}
                      >
                        <option value="onboarding">Onboarding</option>
                        <option value="active">Ativo</option>
                        <option value="paused">Pausado</option>
                      </select>
                    </label>
                    <div className="md:col-span-2">
                      <Button className="h-12 w-full" onClick={handleCreateClient} disabled={creatingClient}>
                        {creatingClient ? 'Criando cliente...' : 'Criar cliente'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {clientDashboard.overview_metrics.map((metric) => (
              <Card key={metric.label} className="overflow-hidden border-slate-200/70">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                    <Badge tone={metric.change >= 0 ? 'green' : 'red'}>{metric.change >= 0 ? '+' : ''}{metric.change}%</Badge>
                  </div>
                  <p className="mt-5 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
                    {formatValue(metric.value, metric.format)}
                  </p>
                  <div className="mt-4 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(16, Math.min(Math.abs(metric.change) * 10, 100))}%`,
                        background: 'linear-gradient(90deg, var(--saas-primary), var(--saas-accent))',
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Linha do tempo de performance</CardTitle>
                  <CardDescription>Investimento, conversões e ROAS unificados entre Meta, Google, LinkedIn e Agendor.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={clientDashboard.time_series}>
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
                  <CardTitle>Resultados por objetivo</CardTitle>
                  <CardDescription>Resultados normalizados em um modelo unificado de conversão.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {clientDashboard.results_by_objective.map((item) => (
                  <div key={item.objective} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold capitalize text-slate-900">{objectiveLabel(item.objective)}</p>
                      <p className="text-sm text-slate-500">{item.volume.toLocaleString('pt-BR')} volume</p>
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
                    <p className="mt-3 text-sm text-slate-500">{formatValue(item.cost_per_result, 'currency')} por resultado</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr_1fr]">
            <FunnelBuilder initialStages={clientDashboard.funnel} />

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Insights de público</CardTitle>
                  <CardDescription>Principais cidades e faixas etárias por performance normalizada.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientDashboard.top_cities}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="city" stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--saas-primary)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {clientDashboard.age_performance.map((row) => (
                    <div key={row.range} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                      <span className="text-sm font-medium text-slate-600">{row.range}</span>
                      <span className="font-semibold text-slate-950">{row.roas.toFixed(2)}x de ROAS</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Distribuição de criativos</CardTitle>
                  <CardDescription>Melhores criativos e divisão de eficiência de receita.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clientDashboard.top_creatives.map((item) => ({ name: item.creative, value: item.roas }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={3}
                      >
                        {clientDashboard.top_creatives.map((item, index) => (
                          <Cell key={item.creative} fill={['#0f766e', '#f97316', '#0f172a'][index % 3]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {clientDashboard.top_creatives.map((creative) => (
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
                  <CardTitle>Tabela de campanhas</CardTitle>
                  <CardDescription>Visão de aquisição com CPA e ROAS normalizados.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-3 font-medium">Campanha</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Investimento</th>
                      <th className="pb-3 font-medium">Conversões</th>
                      <th className="pb-3 font-medium">CPA</th>
                      <th className="pb-3 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientDashboard.campaigns.map((campaign) => (
                      <tr key={campaign.campaign_name}>
                        <td className="py-4">
                          <div>
                            <p className="font-semibold text-slate-900">{campaign.campaign_name}</p>
                            <p className="text-xs capitalize text-slate-400">{campaign.source.replace('_', ' ')}</p>
                          </div>
                        </td>
                        <td className="py-4"><Badge tone={campaign.status === 'ACTIVE' ? 'green' : 'yellow'}>{statusLabel(campaign.status.toLowerCase())}</Badge></td>
                        <td className="py-4">{formatValue(campaign.spend, 'currency')}</td>
                        <td className="py-4">{campaign.conversions}</td>
                        <td className="py-4">{formatValue(campaign.cpa, 'currency')}</td>
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
                    <CardTitle>Perfil do cliente</CardTitle>
                    <CardDescription>Dados do negócio, health score do tenant e status operacional.</CardDescription>
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
                  <div className="rounded-[26px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(15,118,110,0.08),rgba(249,115,22,0.1))] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pulso do negócio</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Orçamento de {String((selectedClient.business_data as Record<string, unknown>)?.monthly_budget ?? 'N/A')} com ciclo de {String((selectedClient.business_data as Record<string, unknown>)?.sales_cycle_days ?? 'N/A')} dias.
                        </p>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-slate-500" />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Ticket médio</p>
                      <p className="mt-2 text-xl font-bold">{formatValue(selectedClient.average_ticket, 'currency')}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">LTV</p>
                      <p className="mt-2 text-xl font-bold">{formatValue(selectedClient.ltv, 'currency')}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Objetivo</p>
                      <p className="mt-2 text-xl font-bold capitalize">{objectiveLabel(selectedClient.main_goal)}</p>
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
                    <CardTitle>Integrações</CardTitle>
                    <CardDescription>Conexões da plataforma e status do último sync.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedClientIntegrations.map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                      <div>
                        <p className="font-semibold capitalize text-slate-900">{integration.provider.replace('_', ' ')}</p>
                        <p className="text-xs text-slate-400">{integration.account_name}</p>
                      </div>
                      <Badge tone={integration.status === 'connected' ? 'green' : 'yellow'}>{statusLabel(integration.status)}</Badge>
                    </div>
                  ))}
                  <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-[var(--saas-primary)]" />
                          <p className="font-semibold text-slate-900">Meta Ads</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {selectedMetaIntegration
                            ? `Conectado com ${selectedMetaIntegration.account_name}.`
                            : 'Conecte sua conta do Facebook para listar contas de anúncio e vincular ao cliente selecionado.'}
                        </p>
                      </div>
                      <Button variant="secondary" onClick={handleConnectMeta}>
                        {selectedMetaIntegration ? 'Reconectar' : 'Conectar Meta'}
                      </Button>
                    </div>

                    {metaPending ? (
                      <div className="mt-4 space-y-3 rounded-2xl border border-emerald-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">Selecionar conta de anúncio</p>
                        <p className="text-sm text-slate-500">
                          {loadingMetaAccounts
                            ? 'Carregando contas disponíveis...'
                            : 'Escolha qual conta da Meta será vinculada a este cliente.'}
                        </p>
                        {!loadingMetaAccounts && metaAccounts.length > 0 ? (
                          <>
                            <select
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                              value={selectedMetaAccountId}
                              onChange={(event) => setSelectedMetaAccountId(event.target.value)}
                            >
                              {metaAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                            <Button className="w-full" onClick={handleLinkMetaAccount} disabled={linkingMeta}>
                              {linkingMeta ? 'Vinculando conta...' : 'Vincular conta selecionada'}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <ClientKnowledgePanel
                clientId={selectedClient.id}
                sources={knowledgeSources}
                onSaved={(nextSources) => setKnowledgeSources(nextSources)}
                googleDrive={((selectedClient.business_data as Record<string, unknown>)?.google_drive_public || null) as {
                  email?: string
                  name?: string
                  picture?: string
                } | null}
              />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
            <Card>
              <CardHeader>
                  <div>
                    <CardTitle>Dashboard operacional</CardTitle>
                    <CardDescription>Visibilidade interna da carteira, saúde dos clientes e eficiência de receita.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Total de clientes', value: snapshot.operations.total_clients },
                  { label: 'Clientes ativos', value: snapshot.operations.active_clients },
                  { label: 'Taxa de churn', value: `${snapshot.operations.churn_rate}%` },
                  { label: 'LTV médio', value: formatValue(snapshot.operations.average_ltv, 'currency') },
                  { label: 'CAC', value: formatValue(snapshot.operations.cac, 'currency') },
                  { label: 'ROI médio', value: `${snapshot.operations.average_roi.toFixed(2)}x` },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-slate-200/70 bg-slate-50/85 p-4">
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-950">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <div>
                    <CardTitle>Sistema de health score</CardTitle>
                    <CardDescription>Classificação verde, amarela e vermelha com base em conversões, CPA, ROAS e inatividade.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.operations.client_health.map((client) => (
                  <div key={client.client_id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{client.client_name}</p>
                      <p className="text-xs text-slate-400">{client.roas.toFixed(2)}x de ROAS</p>
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

          <section>
            <AiAssistantPanel
              client={selectedClient}
              knowledgeSources={knowledgeSources}
              onTaskCreated={() => reloadClientContext(selectedClient.id)}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                  <div>
                    <CardTitle>Gestão de projeto</CardTitle>
                    <CardDescription>Checklist de onboarding e fila de tarefas da operação.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="space-y-4">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <CheckCircle2 className={`h-4 w-4 ${item.completed ? 'text-emerald-500' : 'text-slate-300'}`} />
                      {item.label}
                    </span>
                    <Badge tone={item.completed ? 'green' : 'yellow'}>{item.completed ? 'concluído' : 'pendente'}</Badge>
                  </div>
                ))}
                <div className="rounded-[28px] bg-slate-950 p-5 text-white">
                  <p className="text-sm uppercase tracking-[0.22em] text-white/50">Status do cliente</p>
                  <p className="mt-2 text-2xl font-bold capitalize">{statusLabel(selectedClient.status)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tarefas</CardTitle>
                  <CardDescription>Criar campanhas, ajustar criativos e otimizar a performance por cliente.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{task.description}</p>
                      </div>
                      <Badge tone={task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'yellow' : 'slate'}>
                        {statusLabel(task.status)}
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
                    <CardTitle className="text-white">Mapa de módulos</CardTitle>
                    <CardDescription className="text-white/60">A plataforma já entrega clientes, integrações, dashboards, health e gestão de projetos.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'CRM de clientes', icon: Building2, copy: 'CRUD completo, perfil do negócio, integrações vinculadas e escopo por tenant.' },
                  { label: 'Analytics de marketing', icon: LineChart, copy: 'Métricas unificadas, análise de funil, insights e leitura de ROAS.' },
                  { label: 'Workspace operacional', icon: Users, copy: 'Tarefas, checklist, risco de churn e KPIs globais da carteira.' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
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
                    <CardTitle>Carteira de clientes</CardTitle>
                    <CardDescription>Acesso rápido à saúde, estágio e valor das contas dentro do tenant.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.clients.map((client) => (
                  <button
                    key={client.id}
                    className={`flex w-full items-center justify-between rounded-3xl border px-4 py-4 text-left transition ${
                      client.id === selectedClientId
                        ? 'border-transparent bg-[linear-gradient(135deg,#020617,#0f172a)] text-white shadow-xl'
                        : 'border-slate-200/80 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div>
                      <p className="font-semibold">{client.name}</p>
                      <p className={`text-sm ${client.id === selectedClientId ? 'text-white/60' : 'text-slate-500'}`}>
                        {client.niche} • {formatValue(client.ltv, 'currency')} de LTV
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={healthTone(client.health_band)}>{client.health_score}</Badge>
                      <ChevronRight className={`h-4 w-4 ${client.id === selectedClientId ? 'text-white/60' : 'text-slate-400'}`} />
                    </div>
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
