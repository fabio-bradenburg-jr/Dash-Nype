'use client'

import { useEffect, useMemo, useState } from 'react'
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

import { AiAssistantPanel } from '@/components/saas/ai-assistant-panel'
import { AiIntegrationPanel } from '@/components/saas/ai-integration-panel'
import { ClientKnowledgePanel } from '@/components/saas/client-knowledge-panel'
import { ThemePanel } from '@/components/saas/theme-panel'
import LegacyDashboardShell from '@/components/dashboard/DashboardShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientContextBundle, KnowledgeSource, MetricCard, PlatformSnapshot } from '@/lib/saas/types'

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
  if (format === 'percent') return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`
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

const fixedLegacyMetricKeys = [
  'spend',
  'impressions',
  'clicks',
  'cpc',
  'ctr',
  'totalConversions',
] as const

const optionalLegacyMetricKeys = [
  'cpm',
  'reach',
  'frequency',
  'conversionRate',
  'purchaseValue',
] as const

const legacyResultGroups = [
  {
    key: 'purchases',
    title: 'Compras',
    description: 'Resultado de vendas atribuídas no período',
    resultLabel: 'Compras',
    costLabel: 'Custo por compra',
    metricKey: 'purchases',
    costMetricKey: 'costPerPurchase',
    tone: 'from-emerald-500 to-teal-700',
  },
  {
    key: 'leads',
    title: 'Cadastros',
    description: 'Conversões em leads atribuídas no período',
    resultLabel: 'Cadastros',
    costLabel: 'Custo por cadastro',
    metricKey: 'leads',
    costMetricKey: 'costPerLead',
    tone: 'from-amber-500 to-orange-600',
  },
  {
    key: 'messages',
    title: 'Mensagens iniciadas',
    description: 'Conversas iniciadas em canais de mensagem',
    resultLabel: 'Mensagens iniciadas',
    costLabel: 'Custo por mensagem iniciada',
    metricKey: 'messages',
    costMetricKey: 'costPerMessage',
    tone: 'from-sky-500 to-blue-700',
  },
  {
    key: 'reach',
    title: 'Alcance',
    description: 'Entrega das campanhas classificadas como alcance',
    resultLabel: 'Pessoas alcançadas',
    costLabel: 'Custo por alcance',
    metricKey: 'reachResults',
    costMetricKey: 'costPerReach',
    tone: 'from-cyan-500 to-slate-700',
  },
  {
    key: 'truplays',
    title: 'TruPlays',
    description: 'Resultados das campanhas de vídeo no período',
    resultLabel: 'TruPlays',
    costLabel: 'Custo por TruPlay',
    metricKey: 'thruplays',
    costMetricKey: 'costPerTruplay',
    tone: 'from-violet-500 to-slate-800',
  },
] as const

const chartMetricOptions = [
  { key: 'spend', label: 'Investimento', format: 'currency' },
  { key: 'conversions', label: 'Conversões totais', format: 'number' },
  { key: 'purchases', label: 'Compras', format: 'number' },
  { key: 'leads', label: 'Cadastros', format: 'number' },
  { key: 'messages', label: 'Mensagens iniciadas', format: 'number' },
  { key: 'roas', label: 'ROAS', format: 'ratio' },
  { key: 'cpa', label: 'CPA', format: 'currency' },
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
    reach: campaign.reach || 0,
    ctr: campaign.ctr || 0,
    cpc: campaign.cpc || 0,
    cpm: campaign.cpm || 0,
    frequency: campaign.frequency || 0,
    conversionRate: campaign.conversion_rate || 0,
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
  const [metaApiToken, setMetaApiToken] = useState('')
  const [savingMetaApiToken, setSavingMetaApiToken] = useState(false)
  const [metaApiTokenMessage, setMetaApiTokenMessage] = useState('')
  const [showClientForm, setShowClientForm] = useState(false)
  const [primaryChartMetric, setPrimaryChartMetric] = useState('spend')
  const [secondaryChartMetric, setSecondaryChartMetric] = useState('conversions')
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
  const legacyDashboardClients = useMemo(() => {
    return snapshot.clients.map((client) => {
      const clientIntegrations = snapshot.integrations.filter((integration) => integration.client_id === client.id)
      const metaIntegration = clientIntegrations.find((integration) => integration.provider === 'meta_ads')
      const agendorIntegration = clientIntegrations.find((integration) => integration.provider === 'agendor')
      const businessData = (client.business_data || {}) as Record<string, unknown>
      const businessIntegrations = (businessData.integrations || {}) as Record<string, unknown>

      return {
        id: client.id,
        name: client.name,
        company: client.company,
        dashboardEnabled: true,
        operationEnabled: false,
        dashboardColor: 'blue',
        dashboardVisibleIntegrationKeys: ['meta_ads', 'rd_station'],
        metaAdAccountId: metaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''),
        rdStationAccountId: agendorIntegration?.account_name || String(businessData.agendorAccountId || ''),
        rdPipelineId: String(businessData.agendorAccountId || ''),
        rdStationToken: String(businessIntegrations.agendorToken || ''),
        funnelSteps: ['impressions', 'clicks', 'leads', 'purchases'],
        activeDashboardTemplateId: '',
        dashboardTemplates: [],
      }
    })
  }, [snapshot.clients, snapshot.integrations])
  const positiveMetrics = clientDashboard.overview_metrics.slice(0, 3)
  const metricsByKey = new Map(
    clientDashboard.overview_metrics.map((metric) => {
      const normalized = metricKey(metric)
      return [metricAliases[normalized] || metric.key || normalized, metric]
    })
  )
  const getMetric = (key: string) => metricsByKey.get(key)
  const configuredDashboardMetricKeys = Array.isArray(selectedClient.business_data?.dashboardMetricKeys)
    ? selectedClient.business_data.dashboardMetricKeys.map((item) => String(item))
    : []
  const fixedLegacyMetrics = [
    ...fixedLegacyMetricKeys,
    ...optionalLegacyMetricKeys.filter((key) => {
      const metric = getMetric(key)
      return configuredDashboardMetricKeys.includes(key) || Boolean(metric?.value)
    }),
  ]
    .map((key) => metricsByKey.get(key))
    .filter((metric): metric is MetricCard => Boolean(metric))
  const legacyObjectiveCards = legacyResultGroups.map((group) => {
    const resultMetric = getMetric(group.metricKey)
    const costMetric = getMetric(group.costMetricKey)

    return {
      ...group,
      resultValue: resultMetric?.value || 0,
      resultFormat: resultMetric?.format || 'number',
      costValue: costMetric?.value || 0,
      costFormat: costMetric?.format || 'currency',
    }
  })
  const hasActiveObjectiveResult = legacyObjectiveCards.some((group) => ['purchases', 'leads', 'messages'].includes(group.key) && group.resultValue > 0)
  const visibleObjectiveCards = legacyObjectiveCards.filter((group) => {
    if (['reach', 'truplays'].includes(group.key)) {
      return group.resultValue > 0 || configuredDashboardMetricKeys.includes(group.metricKey)
    }

    if (hasActiveObjectiveResult) return group.resultValue > 0
    return ['purchases', 'leads', 'messages'].includes(group.key)
  })
  const primaryChartConfig = chartMetricOptions.find((option) => option.key === primaryChartMetric) || chartMetricOptions[0]
  const secondaryChartConfig = chartMetricOptions.find((option) => option.key === secondaryChartMetric) || chartMetricOptions[1]
  const distributionData = [
    { name: 'Compras', value: getMetric('purchases')?.value || 0, color: '#3b82f6' },
    { name: 'Leads', value: getMetric('leads')?.value || 0, color: '#10b981' },
    { name: 'Mensagens', value: getMetric('messages')?.value || 0, color: '#f59e0b' },
    { name: 'Cliques sem conversão', value: getMetric('clicksWithoutConversion')?.value || 0, color: '#475569' },
  ]
  const chartHasDistribution = distributionData.some((item) => item.value > 0)
  const funnelStages = clientDashboard.funnel.length
    ? clientDashboard.funnel
    : [
        { stage_name: 'Impressões', volume: getMetric('impressions')?.value || 0, conversion_rate: null },
        { stage_name: 'Cliques', volume: getMetric('clicks')?.value || 0, conversion_rate: null },
        { stage_name: 'Leads', volume: getMetric('leads')?.value || 0, conversion_rate: null },
        { stage_name: 'Compras', volume: getMetric('purchases')?.value || 0, conversion_rate: null },
      ]
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
    { key: 'reach', label: 'Alcance', format: 'number' },
    { key: 'ctr', label: 'CTR', format: 'percent' },
    { key: 'cpc', label: 'CPC', format: 'currency' },
    { key: 'cpm', label: 'CPM', format: 'currency' },
    { key: 'frequency', label: 'Frequência', format: 'decimal' },
    { key: 'conversionRate', label: 'Taxa de conversão', format: 'percent' },
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

  async function handleSaveMetaApiToken() {
    if (!metaApiToken.trim()) return

    setSavingMetaApiToken(true)
    setMetaApiTokenMessage('')
    try {
      const response = await fetch('/api/saas/meta/manual-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: metaApiToken.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível salvar a API da Meta.')
      }

      const accountsResponse = await fetch('/api/saas/meta/adaccounts', { cache: 'no-store' })
      const accountsData = await accountsResponse.json()
      const accounts = accountsData.accounts || []
      setMetaAccounts(accounts)
      setMetaConnectionPending(true)
      if (accounts[0]?.id) {
        setSelectedMetaAccountId(accounts[0].id)
      }
      setMetaApiToken('')
      setMetaApiTokenMessage(
        accounts.length
          ? 'API da Meta salva. As contas de anúncio já estão disponíveis no cadastro do cliente.'
          : 'API da Meta salva. Se nenhuma conta aparecer, confira permissões do token.'
      )
    } catch (error) {
      setMetaApiTokenMessage(error instanceof Error ? error.message : 'Não foi possível salvar a API da Meta.')
    } finally {
      setSavingMetaApiToken(false)
    }
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
          {!showDashs ? (
          <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))] p-5 shadow-[0_26px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.15),transparent_46%),radial-gradient(circle_at_bottom,rgba(15,118,110,0.18),transparent_42%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--saas-accent)]" />
                  {showOverview
                    ? 'Nype Orbit'
                    : showDashs
                    ? `Dashboard ${selectedClient.name || 'cliente'}`
                    : currentModule.title}
                </div>
                <h1 className="font-manrope text-4xl font-extrabold tracking-[-0.05em] text-slate-950 md:text-5xl">
                  {showOverview
                    ? `Boas-vindas, ${currentUserName}`
                    : showDashs
                    ? selectedClient.name || 'Dashboard do cliente'
                    : currentModule.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  {showOverview
                    ? 'Use a IA para consultar clientes, campanhas, dashs, integrações e arquivos vinculados.'
                    : showDashs
                    ? 'A seguir, apresentamos um panorama consolidado do período selecionado, separando os dados por origem para facilitar a leitura executiva da operação.'
                    : currentModule.description}
                </p>
                {showWorkspaceControls && !showDashs ? (
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
                {showDashs ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Conta de anúncio</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold">{selectedMetaIntegration?.external_account_id || selectedMetaIntegration?.account_name || 'Não vinculada'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">CRM</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold">{selectedClientIntegrations.find((integration) => integration.provider === 'agendor')?.account_name || 'Não vinculado'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Vendedor</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold">Todos os vendedores</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Demais integrações mapeadas</p>
                      <p className="mt-2 font-manrope text-xl font-extrabold">{selectedClientIntegrations.length} conta(s) vinculada(s)</p>
                    </div>
                  </div>
                ) : (
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
                )}
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
          ) : null}

          {showDashs ? (
          <section className="saas-legacy-dashboard-frame">
            <LegacyDashboardShell
              initialTab="apresentacao"
              initialActiveClientId={selectedClientId || selectedClient.id}
              initialClientsOverride={legacyDashboardClients}
            />
          </section>
          ) : null}

          {false && showDashs ? (
          <section className="space-y-6">
            <Card className="border-slate-200/70">
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">
                      <span>∞</span>
                      <span>Meta Ads</span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-500">
                    Primeiro bloco de leitura das contas de anúncio e da performance de mídia.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/70">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Leitura por objetivo</p>
                  <h2 className="mt-2 font-manrope text-2xl font-extrabold tracking-tight text-slate-950">
                    Filtro por tipo de resultado
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    O relatório considera apenas campanhas que geraram o tipo de resultado selecionado.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                  {['Compras', 'Cadastros', 'Mensagens iniciadas', 'Alcance'].map((item) => (
                    <span key={item} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-600 shadow-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <CardTitle>Resumo de resultados</CardTitle>
                    <CardDescription>Os indicadores abaixo consideram somente as campanhas enquadradas no filtro de resultado ativo.</CardDescription>
                  </div>
                  <Button variant="secondary">+ Adicionar métrica</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h3 className="font-manrope text-xl font-extrabold text-slate-950">Mídia e distribuição</h3>
                  <p className="mt-1 text-sm text-slate-500">Visão geral do investimento e da entrega da campanha.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {fixedLegacyMetrics.map((metric) => (
                    <div key={metric.key || metric.label} className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
                        <Badge tone={metric.change >= 0 ? 'green' : 'red'}>
                          {metric.change >= 0 ? '+' : ''}{metric.change}%
                        </Badge>
                      </div>
                      <p className="mt-5 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
                        {formatValue(metric.value, metric.format)}
                      </p>
                      <p className="mt-3 text-xs font-medium text-slate-400">
                        {metric.change === 0 ? 'Sem variação vs período anterior' : 'Atualizado conforme o período selecionado'}
                      </p>
                    </div>
                  ))}
                  <div className="grid min-h-[150px] place-items-center rounded-3xl border border-dashed border-slate-200/90 bg-slate-50/60 p-5 text-center text-sm text-slate-400">
                    <div>
                      <p className="text-lg font-semibold text-slate-500">+</p>
                      <p className="font-semibold">Adicionar métrica</p>
                      <p className="mt-1">Criar um novo card nessa sequência.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-3">
              {visibleObjectiveCards.map((group) => (
                <Card key={group.key} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`h-1.5 bg-gradient-to-r ${group.tone}`} />
                    <div className="p-5">
                      <p className="font-manrope text-lg font-extrabold text-slate-950">{group.title}</p>
                      <p className="mt-1 min-h-[40px] text-sm leading-5 text-slate-500">{group.description}</p>
                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{group.resultLabel}</p>
                          <p className="mt-1 font-manrope text-xl font-extrabold">{formatValue(group.resultValue, group.resultFormat)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{group.costLabel}</p>
                          <p className="mt-1 font-manrope text-xl font-extrabold">{formatValue(group.costValue, group.costFormat)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <CardTitle>Evolução das métricas</CardTitle>
                      <CardDescription>Seleção de métrica 1 e métrica 2 como no dashboard antigo.</CardDescription>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                        value={primaryChartMetric}
                        onChange={(event) => setPrimaryChartMetric(event.target.value)}
                      >
                        {chartMetricOptions.map((option) => (
                          <option key={`primary-${option.key}`} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                      <select
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                        value={secondaryChartMetric}
                        onChange={(event) => setSecondaryChartMetric(event.target.value)}
                      >
                        {chartMetricOptions.map((option) => (
                          <option key={`secondary-${option.key}`} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={clientDashboard.time_series}>
                      <defs>
                        <linearGradient id="legacyPrimaryFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--saas-primary)" stopOpacity={0.34} />
                          <stop offset="100%" stopColor="var(--saas-primary)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey={primaryChartConfig.key}
                        name={primaryChartConfig.label}
                        stroke="var(--saas-primary)"
                        fill="url(#legacyPrimaryFill)"
                        strokeWidth={3}
                      />
                      <Area
                        type="monotone"
                        dataKey={secondaryChartConfig.key}
                        name={secondaryChartConfig.label}
                        stroke="var(--saas-accent)"
                        fillOpacity={0}
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Distribuição de resultados</CardTitle>
                    <CardDescription>Leitura rápida do resultado da operação Meta desse cliente.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartHasDistribution ? distributionData : distributionData.map((item, index) => ({ ...item, value: index === 3 ? 1 : 0 }))}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={72}
                          outerRadius={104}
                          paddingAngle={2}
                        >
                          {distributionData.map((item) => (
                            <Cell key={item.name} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {distributionData.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Funil de métricas</CardTitle>
                  <CardDescription>Arraste as métricas para montar a jornada manualmente. O sistema calcula a taxa de uma etapa para outra automaticamente.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 xl:grid-cols-[0.36fr_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-bold text-slate-900">Métricas disponíveis</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {fixedLegacyMetrics.slice(0, 8).map((metric) => (
                      <span key={`available-${metric.key || metric.label}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                        + {metric.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {funnelStages.map((stage, index) => {
                    const previousVolume = index > 0 ? funnelStages[index - 1].volume : 0
                    const rate = index > 0 ? Number(((stage.volume / Math.max(previousVolume, 1)) * 100).toFixed(1)) : null

                    return (
                      <div key={`${stage.stage_name}-${index}`} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{stage.stage_name}</p>
                          <span className="text-xs font-semibold text-rose-500">Remover</span>
                        </div>
                        <p className="mt-4 font-manrope text-3xl font-extrabold text-slate-950">{formatValue(stage.volume, 'number')}</p>
                        <p className="mt-2 text-sm text-slate-500">{rate === null ? 'Topo do funil' : `${formatValue(rate, 'percent')} da etapa anterior`}</p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Ranking de localização</CardTitle>
                    <CardDescription>Top cidades do recorte atual, como no painel de rankings do legado.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-[180px]">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Resultado por idade</CardTitle>
                    <CardDescription>Faixas etárias separadas pelo resultado ativo.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientDashboard.age_performance.map((row, index) => (
                    <div key={row.range} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">#{index + 1} {row.range}</span>
                        <span className="font-semibold text-slate-950">{row.roas.toFixed(2)}x</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-[var(--saas-accent)]" style={{ width: `${Math.min(row.roas * 22, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Top 5 por criativos</CardTitle>
                    <CardDescription>Camada de criativos do dashboard antigo.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientDashboard.top_creatives.map((creative, index) => (
                    <div key={creative.creative} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">#{index + 1} {creative.creative}</p>
                        <p className="text-xs text-slate-500">Criativo no recorte atual</p>
                      </div>
                      <span className="font-semibold text-slate-950">{creative.roas.toFixed(2)}x</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <CardTitle>Campanhas do cliente ({clientDashboard.campaigns.length})</CardTitle>
                    <CardDescription>Tabela pronta para reunião com as colunas do dashboard antigo.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    {['Buscar campanha', 'Todos os status', 'Ordenar por investimento'].map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-2">{item}</span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-3 pr-5 font-medium">Status</th>
                      <th className="pb-3 pr-5 font-medium">Campanha</th>
                      {campaignColumns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap pb-3 pr-5 font-medium">{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientDashboard.campaigns.length > 0 ? (
                      clientDashboard.campaigns.map((campaign) => (
                        <tr key={campaign.campaign_name}>
                          <td className="py-4 pr-5"><Badge tone={campaign.status === 'ACTIVE' ? 'green' : 'yellow'}>{statusLabel(campaign.status.toLowerCase())}</Badge></td>
                          <td className="py-4 pr-5">
                            <p className="font-semibold text-slate-900">{campaign.campaign_name}</p>
                            <p className="text-xs capitalize text-slate-400">{campaign.source.replace('_', ' ')}</p>
                          </td>
                          {campaignColumns.map((column) => (
                            <td key={column.key} className="whitespace-nowrap py-4 pr-5">
                              {column.key === 'totalConversions' ? (
                                <div>
                                  <strong>{formatValue(getCampaignValue(campaign, column.key), column.format)}</strong>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {campaign.purchases || 0} compras, {campaign.leads || 0} leads, {campaign.messages || 0} mensagens
                                  </p>
                                </div>
                              ) : (
                                formatValue(getCampaignValue(campaign, column.key), column.format)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={campaignColumns.length + 2} className="py-10 text-center text-slate-500">
                          Nenhuma campanha encontrada para esse cliente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
          ) : null}

          {showClients ? (
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
                      <p className="font-semibold text-slate-900">Login com Facebook</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Entre com sua conta do Facebook para buscar as contas de anúncio disponíveis. No cadastro do cliente você escolhe qual conta alimenta o dash.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={handleConnectMeta}>
                      Entrar com Facebook
                    </Button>
                  </div>
                  {metaPending ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
                      Meta conectada temporariamente. As contas disponíveis já podem ser selecionadas no cadastro do cliente.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-4">
                  <p className="font-semibold text-slate-900">Código/API token da Meta</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Se preferir não usar o login do Facebook, cole aqui o access token da Meta. Ele libera a listagem de contas de anúncio no cadastro do cliente.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <input
                      className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                      type="password"
                      value={metaApiToken}
                      onChange={(event) => setMetaApiToken(event.target.value)}
                      placeholder="Cole o access token da Meta"
                    />
                    <Button onClick={handleSaveMetaApiToken} disabled={savingMetaApiToken || !metaApiToken.trim()} type="button">
                      {savingMetaApiToken ? 'Salvando...' : 'Salvar API'}
                    </Button>
                  </div>
                  {metaApiTokenMessage ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {metaApiTokenMessage}
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
