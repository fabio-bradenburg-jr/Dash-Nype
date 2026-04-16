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
  ArrowUpRight,
  Building2,
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
import { AiIntegrationPanel } from '@/components/saas/ai-integration-panel'
import { ClientKnowledgePanel } from '@/components/saas/client-knowledge-panel'
import { ThemePanel } from '@/components/saas/theme-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientContextBundle, KnowledgeSource, PlatformSnapshot } from '@/lib/saas/types'

const navigation = [
  { key: 'overview', label: 'Visão geral', icon: Cpu },
  { key: 'dashs', label: 'Dashs', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'settings', label: 'Configurações', icon: Settings2 },
] as const

type NavigationKey = (typeof navigation)[number]['key']

const moduleCopy: Record<NavigationKey, { title: string; description: string }> = {
  overview: {
    title: 'IA inteligente',
    description: 'Converse com a IA sobre clientes, campanhas, dashs, integrações e fontes vinculadas.',
  },
  dashs: {
    title: 'Dashs de performance',
    description: 'Métricas, campanhas, funil e leitura executiva do cliente selecionado.',
  },
  clients: {
    title: 'Gestão de clientes',
    description: 'Carteira, perfil do cliente, integrações, fontes de conhecimento e criação de novos clientes.',
  },
  settings: {
    title: 'Configurações',
    description: 'Tema, Meta Ads, IA e ajustes da experiência do SaaS.',
  },
}

function formatValue(value: number, format: string) {
  if (format === 'currency') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
  if (format === 'percent') return `${value}%`
  if (format === 'ratio') return `${value.toFixed(2)}x`
  if (format === 'decimal') return value.toFixed(2).replace('.', ',')
  return new Intl.NumberFormat('pt-BR').format(value)
}

function metricKey(metric: { key?: string | null; label: string }) {
  return String(metric.key || metric.label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
}

const legacyMetricGroups = [
  {
    title: 'Mídia',
    keys: ['spend', 'impressions', 'cpm', 'reach', 'frequency', 'clicks', 'cpc', 'ctr'],
  },
  {
    title: 'Conversão',
    keys: ['totalConversions', 'conversionRate', 'purchases', 'costPerPurchase', 'leads', 'costPerLead', 'messages', 'costPerMessage'],
  },
  {
    title: 'Receita',
    keys: ['purchaseValue', 'averageTicket', 'clicksWithoutConversion', 'roas'],
  },
] as const

const metricAliases: Record<string, string> = {
  totalconversions: 'totalConversions',
  conversoestotais: 'totalConversions',
  conversionrate: 'conversionRate',
  taxadeconversao: 'conversionRate',
  purchasevalue: 'purchaseValue',
  faturamento: 'purchaseValue',
  costperpurchase: 'costPerPurchase',
  custoporcompra: 'costPerPurchase',
  averageticket: 'averageTicket',
  ticketmedio: 'averageTicket',
  costperlead: 'costPerLead',
  custoporlead: 'costPerLead',
  costpermessage: 'costPerMessage',
  customensagem: 'costPerMessage',
  clickswithoutconversion: 'clicksWithoutConversion',
  cliquessemconversao: 'clicksWithoutConversion',
  roasconsolidado: 'roas',
}

function getCampaignValue(campaign: PlatformSnapshot['clientDashboard']['campaigns'][number], key: string) {
  const map: Record<string, number> = {
    spend: campaign.spend,
    totalConversions: campaign.conversions,
    purchases: campaign.purchases || 0,
    leads: campaign.leads || 0,
    messages: campaign.messages || 0,
    cpa: campaign.cpa,
    roas: campaign.roas,
    purchaseValue: campaign.purchase_value || campaign.spend * campaign.roas,
    clicks: campaign.clicks || 0,
    impressions: campaign.impressions || 0,
    ctr: campaign.ctr || 0,
    cpc: campaign.cpc || 0,
  }

  return map[key] || 0
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
  const [activeModule, setActiveModule] = useState<NavigationKey>('overview')
  const [currentUserName, setCurrentUserName] = useState('Usuário')
  const [selectedClientId, setSelectedClientId] = useState(snapshot.selectedClient.id)
  const [selectedClient, setSelectedClient] = useState(snapshot.selectedClient)
  const [clientDashboard, setClientDashboard] = useState(snapshot.clientDashboard)
  const [clientIntegrations, setClientIntegrations] = useState(
    snapshot.integrations.filter((integration) => integration.client_id === snapshot.selectedClient.id)
  )
  const [loadingClientContext, setLoadingClientContext] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [linkingMeta, setLinkingMeta] = useState(false)
  const [loadingMetaAccounts, setLoadingMetaAccounts] = useState(false)
  const [metaConnectionPending, setMetaConnectionPending] = useState(false)
  const [metaAccounts, setMetaAccounts] = useState<Array<{ id: string; name: string; clientId: string }>>([])
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState('')
  const [showClientForm, setShowClientForm] = useState(false)
  const [clientForm, setClientForm] = useState({
    name: '',
    company: '',
    main_goal: 'leads',
    metaAdAccountId: '',
    agendorToken: '',
    agendorAccountId: '',
  })
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(
    extractKnowledgeSourcesFromBusinessData(snapshot.selectedClient.business_data as Record<string, unknown>)
  )
  const selectedClientIntegrations = clientIntegrations
  const selectedMetaIntegration = selectedClientIntegrations.find((integration) => integration.provider === 'meta_ads')
  const positiveMetrics = clientDashboard.overview_metrics.slice(0, 3)
  const metricsByKey = new Map(
    clientDashboard.overview_metrics.map((metric) => {
      const normalized = metricKey(metric)
      return [metricAliases[normalized] || metric.key || normalized, metric]
    })
  )
  const legacyMetrics = legacyMetricGroups.map((group) => ({
    ...group,
    metrics: group.keys
      .map((key) => metricsByKey.get(key))
      .filter(Boolean),
  }))
  const campaignColumns = [
    { key: 'spend', label: 'Investimento', format: 'currency' },
    { key: 'totalConversions', label: 'Conversões', format: 'number' },
    { key: 'purchases', label: 'Compras', format: 'number' },
    { key: 'leads', label: 'Leads', format: 'number' },
    { key: 'messages', label: 'Mensagens', format: 'number' },
    { key: 'cpa', label: 'CPA', format: 'currency' },
    { key: 'roas', label: 'ROAS', format: 'ratio' },
    { key: 'purchaseValue', label: 'Faturamento', format: 'currency' },
    { key: 'clicks', label: 'Cliques', format: 'number' },
    { key: 'impressions', label: 'Impressões', format: 'number' },
    { key: 'ctr', label: 'CTR', format: 'percent' },
    { key: 'cpc', label: 'CPC', format: 'currency' },
  ]
  const selectedClientFromQuery = searchParams.get('selected_client')
  const metaPendingFromQuery = searchParams.get('meta_pending') === '1'
  const metaPending = metaConnectionPending
  const currentModule = moduleCopy[activeModule]
  const showOverview = activeModule === 'overview'
  const showDashs = activeModule === 'dashs'
  const showClients = activeModule === 'clients'
  const showSettings = activeModule === 'settings'
  const showWorkspaceControls = activeModule !== 'overview'

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
    async function loadSessionUser() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        const data = await response.json()
        const user = data?.user || {}
        const name = String(user.full_name || user.fullName || user.name || user.email || '').trim()
        if (name) {
          setCurrentUserName(name.includes('@') ? name.split('@')[0] : name.split(' ')[0])
        }
      } catch {
        setCurrentUserName('Usuário')
      }
    }

    loadSessionUser()
  }, [])

  useEffect(() => {
    async function loadClientContext() {
      if (!selectedClientId) return
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
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const transientParams = [
      'meta_error',
      'meta_pending',
      'meta_client_id',
      'google_drive_error',
      'google_drive_connected',
      'selected_client',
    ]
    let changed = false

    transientParams.forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param)
        changed = true
      }
    })

    if (changed) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  useEffect(() => {
    async function loadMetaAccounts() {
      setLoadingMetaAccounts(true)
      try {
        const response = await fetch('/api/saas/meta/adaccounts', { cache: 'no-store' })
        const data = await response.json()
        const accounts = data.accounts || []
        setMetaAccounts(accounts)
        if (accounts.length > 0 || metaPendingFromQuery) {
          setMetaConnectionPending(true)
        }
        if (accounts[0]?.id) {
          setSelectedMetaAccountId(accounts[0].id)
        }
      } finally {
        setLoadingMetaAccounts(false)
      }
    }

    loadMetaAccounts()
  }, [metaPendingFromQuery])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function handleCreateClient() {
    const selectedAccount = metaAccounts.find((account) => account.id === clientForm.metaAdAccountId)
    setCreatingClient(true)
    try {
      const response = await fetch('/api/saas/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientForm.name,
          company: clientForm.company || clientForm.name,
          niche: 'Dashboard',
          average_ticket: 0,
          main_goal: clientForm.main_goal,
          ltv: 0,
          start_date: new Date().toISOString().slice(0, 10),
          status: 'active',
          target_roas: 2.5,
          business_data: {
            dashboardEnabled: true,
            dashboardVisibleIntegrationKeys: ['meta_ads', 'agendor'],
            funnelSteps: ['impressions', 'clicks', 'leads', 'purchases'],
            metaAdAccountId: clientForm.metaAdAccountId,
            agendorAccountId: clientForm.agendorAccountId,
            integrations: {
              agendorToken: clientForm.agendorToken,
            },
          },
        }),
      })
      const createdClient = await response.json()

      if (!response.ok) {
        throw new Error(createdClient?.error || createdClient?.detail || 'Não foi possível criar o cliente.')
      }

      if (clientForm.metaAdAccountId && selectedAccount) {
        await fetch('/api/saas/meta/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: createdClient.id,
            accountId: selectedAccount.id,
            accountName: selectedAccount.name,
          }),
        })
      }

      if (clientForm.agendorToken.trim()) {
        await fetch('/api/saas/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: createdClient.id,
            provider: 'agendor',
            account_name: clientForm.agendorAccountId || `${clientForm.name} Agendor`,
            external_account_id: clientForm.agendorAccountId || `agendor-${createdClient.id}`,
            access_token: clientForm.agendorToken,
          }),
        })
      }

      setShowClientForm(false)
      setClientForm({
        name: '',
        company: '',
        main_goal: 'leads',
        metaAdAccountId: '',
        agendorToken: '',
        agendorAccountId: '',
      })
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível criar o cliente.')
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
    const clientParam = selectedClient.id ? `client_id=${encodeURIComponent(selectedClient.id)}&` : ''
    window.location.href = `/api/saas/meta/start?${clientParam}return_to=/`
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
      <div className="flex min-h-screen w-full gap-4 px-3 py-4 sm:px-4 lg:gap-6 lg:px-6 xl:px-8">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[272px] flex-none flex-col rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#020617,#0f172a)] px-6 py-7 text-white shadow-[0_30px_100px_rgba(2,6,23,0.36)] lg:flex xl:w-[292px]">
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
              const active = item.key === activeModule
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveModule(item.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.12)]'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  type="button"
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
            <p className="mt-2 text-sm leading-6 text-white/60">Cada usuário acessa somente os clientes, dashs e integrações vinculados ao próprio tenant.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))] p-5 shadow-[0_26px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.15),transparent_46%),radial-gradient(circle_at_bottom,rgba(15,118,110,0.18),transparent_42%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--saas-accent)]" />
                  {showOverview ? 'Nype Orbit' : currentModule.title}
                </div>
                <h1 className="font-manrope text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">
                  {showOverview
                    ? `Boas-vindas, ${currentUserName}`
                    : activeModule === 'dashs'
                    ? 'Métricas, CRM e entrega ao cliente em uma única plataforma.'
                    : currentModule.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  {showOverview
                    ? 'Use a IA para consultar clientes, campanhas, dashs, integrações e arquivos vinculados.'
                    : activeModule === 'dashs'
                    ? 'Dados unificados de campanha, sync com CRM e leitura premium de performance para a agência inteira.'
                    : currentModule.description}
                </p>
                {showWorkspaceControls ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  {positiveMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{metric.label}</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold text-slate-950">{formatValue(metric.value, metric.format)}</p>
                    </div>
                  ))}
                </div>
                ) : null}
              </div>
              {showWorkspaceControls ? (
              <div className="grid gap-3 xl:min-w-[420px]">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <select
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm"
                    disabled={snapshot.clients.length === 0}
                    value={selectedClientId || selectedClient.id}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                  >
                    {snapshot.clients.length > 0 ? (
                      snapshot.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))
                    ) : (
                      <option value="">Nenhum cliente cadastrado</option>
                    )}
                  </select>
                  <Button variant="secondary" className="h-12" onClick={handleSyncSources} disabled={syncing}>
                    {syncing ? 'Sincronizando...' : 'Sincronizar'}
                  </Button>
                  <Button className="h-12" onClick={() => setShowClientForm((value) => !value)}>
                    Novo cliente
                  </Button>
                  <Button className="h-12" variant="ghost" onClick={handleLogout}>Sair</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
              ) : (
                <div className="rounded-[30px] border border-slate-200/80 bg-white/80 p-5 shadow-sm xl:min-w-[360px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Atalho inteligente</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Pergunte sobre a carteira inteira ou selecione um cliente para consultar desempenho, campanhas, CRM e arquivos vinculados.
                  </p>
                </div>
              )}
            </div>
          </section>

          {showDashs ? (
          <section className="space-y-4">
            <Card className="border-slate-200/70">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Dashboard antigo, visual novo</p>
                  <h2 className="mt-2 font-manrope text-2xl font-extrabold tracking-tight text-slate-950">
                    Mesma leitura de mídia, conversão e receita do dash legado
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Mantém os indicadores de Meta Ads do dashboard anterior: investimento, alcance, cliques, custos, conversões, compras, leads, mensagens, faturamento e ROAS.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                  {['Últimos 7 dias', 'Campanhas ativas', 'Meta Ads', 'Agendor'].map((item) => (
                    <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 2xl:grid-cols-3">
              {legacyMetrics.map((group) => (
                <Card key={group.title} className="border-slate-200/70">
                  <CardHeader>
                    <div>
                      <CardTitle>{group.title}</CardTitle>
                      <CardDescription>
                        {group.title === 'Mídia'
                          ? 'Entrega e custo de tráfego.'
                          : group.title === 'Conversão'
                          ? 'Resultados e eficiência por objetivo.'
                          : 'Receita atribuída e retorno.'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {group.metrics.map((metric) => (
                      <div key={metric.label} className="rounded-3xl border border-slate-200/70 bg-white/85 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium leading-5 text-slate-500">{metric.label}</p>
                          <Badge tone={metric.change >= 0 ? 'green' : 'red'}>
                            {metric.change >= 0 ? '+' : ''}{metric.change}%
                          </Badge>
                        </div>
                        <p className="mt-4 font-manrope text-2xl font-extrabold tracking-tight text-slate-950">
                          {formatValue(metric.value, metric.format)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          ) : null}

          {showDashs ? (
          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Linha do tempo de performance</CardTitle>
                  <CardDescription>Investimento, conversões, compras, leads, mensagens e ROAS no mesmo recorte do dash antigo.</CardDescription>
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
                    <Area type="monotone" dataKey="purchases" stroke="#10b981" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" dataKey="leads" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" dataKey="messages" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Resultados por objetivo</CardTitle>
                  <CardDescription>Mesmo bloco do dash antigo: volume e custo médio por compra, cadastro e mensagem.</CardDescription>
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
          ) : null}

          {showDashs ? (
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
          ) : null}

          {showDashs || showClients ? (
          <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Tabela de campanhas</CardTitle>
                  <CardDescription>Colunas do dashboard antigo para leitura de mídia, resultado, receita e eficiência.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-3 font-medium">Campanha</th>
                      <th className="pb-3 font-medium">Status</th>
                      {campaignColumns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap pb-3 pr-5 font-medium">{column.label}</th>
                      ))}
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
                        {campaignColumns.map((column) => (
                          <td key={column.key} className="whitespace-nowrap py-4 pr-5">
                            {formatValue(getCampaignValue(campaign, column.key), column.format)}
                          </td>
                        ))}
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
                    <CardDescription>Dados do negócio, objetivo do dash e status do cliente.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div>
                      <p className="font-manrope text-2xl font-extrabold">{selectedClient.name}</p>
                      <p className="text-sm text-slate-500">{selectedClient.niche} • {selectedClient.company}</p>
                    </div>
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
                      <p className="text-sm text-slate-500">Status</p>
                      <p className="mt-2 text-xl font-bold capitalize">{statusLabel(selectedClient.status)}</p>
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
              />
            </div>
          </section>
          ) : null}

          {showSettings ? (
          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <ThemePanel initialTheme={snapshot.theme} />

            <AiIntegrationPanel />

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>API da Meta</CardTitle>
                  <CardDescription>Conecte a credencial global da Meta para listar as contas de anúncio no cadastro do cliente.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">Meta Ads</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Use essa conexão para buscar as contas de anúncio disponíveis. No cadastro do cliente você escolhe qual conta alimenta o dash.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={handleConnectMeta}>
                      Vincular Meta
                    </Button>
                  </div>
                  {metaPending ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
                      Meta conectada temporariamente. As contas disponíveis já podem ser selecionadas no cadastro do cliente.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Integrações do dash</CardTitle>
                  <CardDescription>O cadastro novo fica restrito a Meta Ads e Agendor, seguindo a estrutura de dados do dash antigo.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  'Meta: token global em Configurações e conta de anúncio no cliente.',
                  'Agendor: API/token e referência da conta/pipeline no cadastro do cliente.',
                  'Dash: métricas, campanha, funil e resultados preservam a leitura do modelo antigo no visual novo.',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
          ) : null}

          {showOverview ? (
          <section>
            <AiAssistantPanel
              client={selectedClient}
              clients={snapshot.clients}
              selectedClientId={selectedClientId}
              knowledgeSources={knowledgeSources}
              onClientChange={setSelectedClientId}
            />
          </section>
          ) : null}

          {showClients || showSettings ? (
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="bg-slate-950 text-white">
              <CardHeader>
                  <div>
                    <CardTitle className="text-white">Mapa de módulos</CardTitle>
                    <CardDescription className="text-white/60">A plataforma centraliza clientes, integrações, dashboards e IA contextual.</CardDescription>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'CRM de clientes', icon: Building2, copy: 'CRUD completo, perfil do negócio, integrações vinculadas e escopo por tenant.' },
                  { label: 'Analytics de marketing', icon: LineChart, copy: 'Métricas unificadas, análise de funil, insights e leitura de ROAS.' },
                  { label: 'IA contextual', icon: Users, copy: 'Perguntas sobre clientes, campanhas, CRM, dashs e arquivos vinculados ao tenant.' },
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
                    <CardDescription>Acesso rápido ao estágio e valor das contas dentro do tenant.</CardDescription>
                  </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.clients.length > 0 ? (
                  snapshot.clients.map((client) => (
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
                      <ChevronRight className={`h-4 w-4 ${client.id === selectedClientId ? 'text-white/60' : 'text-slate-400'}`} />
                    </button>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm leading-6 text-slate-500">
                    Nenhum cliente cadastrado ainda. Use “Novo cliente” para criar o primeiro dash com Meta e Agendor.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          ) : null}
        </main>
      </div>

      {showClientForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[34px] border border-white/80 bg-white p-6 shadow-[0_40px_120px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Novo cliente</p>
                <h2 className="mt-2 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
                  Dados para o dash
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Cadastre somente as fontes que alimentam o dashboard: cliente, conta Meta e API do Agendor.
                </p>
              </div>
              <button
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600"
                onClick={() => setShowClientForm(false)}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-slate-600">
                  Nome do cliente
                  <input
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                    value={clientForm.name}
                    onChange={(event) => setClientForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex.: Clínica Pulse"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-600">
                  Empresa
                  <input
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                    value={clientForm.company}
                    onChange={(event) => setClientForm((current) => ({ ...current, company: event.target.value }))}
                    placeholder="Mesmo nome, se preferir"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-slate-600">
                Objetivo principal do dash
                <select
                  className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                  value={clientForm.main_goal}
                  onChange={(event) => setClientForm((current) => ({ ...current, main_goal: event.target.value }))}
                >
                  <option value="leads">Leads</option>
                  <option value="sales">Vendas</option>
                  <option value="messages">Mensagens</option>
                </select>
              </label>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">Meta Ads</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Selecione a conta de anúncio. Caso a lista esteja vazia, vincule a API da Meta em Configurações.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={handleConnectMeta} type="button">
                    Vincular API
                  </Button>
                </div>
                <select
                  className="mt-4 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                  value={clientForm.metaAdAccountId}
                  onChange={(event) => setClientForm((current) => ({ ...current, metaAdAccountId: event.target.value }))}
                >
                  <option value="">
                    {loadingMetaAccounts ? 'Carregando contas...' : 'Selecione uma conta de anúncio'}
                  </option>
                  {metaAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-semibold text-slate-900">Agendor</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Informe a API/token e a referência da conta ou pipeline comercial desse cliente.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    API / Token do Agendor
                    <input
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                      type="password"
                      value={clientForm.agendorToken}
                      onChange={(event) => setClientForm((current) => ({ ...current, agendorToken: event.target.value }))}
                      placeholder="Token do Agendor"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    Conta / Pipeline
                    <input
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                      value={clientForm.agendorAccountId}
                      onChange={(event) => setClientForm((current) => ({ ...current, agendorAccountId: event.target.value }))}
                      placeholder="ID, pipeline ou referência"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 md:flex-row md:justify-end">
                <Button variant="secondary" onClick={() => setShowClientForm(false)} type="button">
                  Cancelar
                </Button>
                <Button onClick={handleCreateClient} disabled={creatingClient || !clientForm.name.trim()} type="button">
                  {creatingClient ? 'Criando cliente...' : 'Criar cliente e dash'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
