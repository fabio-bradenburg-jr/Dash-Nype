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
import { Building2, ChevronRight, Cpu, LayoutDashboard, LineChart, LogOut, Moon, Settings2, ShieldCheck, Sparkles, Sun, Users } from 'lucide-react'

import { AiAssistantPanel } from '@/components/saas/ai-assistant-panel'
import { AiIntegrationPanel } from '@/components/saas/ai-integration-panel'
import { ThemePanel } from '@/components/saas/theme-panel'
import LegacyDashboardShell from '@/components/dashboard/DashboardShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createDashboardTemplate } from '@/lib/dashboard-storage'
import { ClientContextBundle, KnowledgeSource, MetricCard, PlatformSnapshot } from '@/lib/saas/types'

const SAAS_THEME_STORAGE_KEY = 'nype-orbit-saas-theme'

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

function normalizePipelineValues(values: unknown): string[] {
  if (Array.isArray(values)) {
    return values.map((item) => String(item || '').trim()).filter(Boolean)
  }

  return String(values || '')
    .split(/[\n,;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
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
  const [currentTheme, setCurrentTheme] = useState(snapshot.theme)
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [themeModeSaving, setThemeModeSaving] = useState(false)
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
    dashboardName: '',
    main_goal: 'leads',
    metaAdAccountId: '',
    agendorToken: '',
    agendorAccountIds: [] as string[],
    dashboardButtonColor: currentTheme.primaryColor || '#0f766e',
    dashboardAccentColor: currentTheme.accentColor || '#f97316',
    logoUrl: '',
  })
  const [clientPipelineDraft, setClientPipelineDraft] = useState('')
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(
    extractKnowledgeSourcesFromBusinessData(snapshot.selectedClient.business_data as Record<string, unknown>)
  )
  const [showClientEditModal, setShowClientEditModal] = useState(false)
  const [editingClient, setEditingClient] = useState<PlatformSnapshot['clients'][number] | null>(null)
  const [editingClientSaving, setEditingClientSaving] = useState(false)
  const [editingClientForm, setEditingClientForm] = useState({
    dashboardName: '',
    logoUrl: '',
    metaAdAccountId: '',
    agendorToken: '',
    agendorAccountIds: [] as string[],
  })
  const [editingPipelineDraft, setEditingPipelineDraft] = useState('')
  const selectedClientIntegrations = clientIntegrations
  const selectedMetaIntegration = selectedClientIntegrations.find((integration) => integration.provider === 'meta_ads')
  const selectedAgendorPipelines = normalizePipelineValues(
    selectedClient.business_data?.agendorAccountIds ||
      selectedClientIntegrations.find((integration) => integration.provider === 'agendor')?.account_name ||
      selectedClient.business_data?.agendorAccountId
  )
  const legacyDashboardClients = useMemo(() => {
    return snapshot.clients.map((client) => {
      const clientIntegrations = snapshot.integrations.filter((integration) => integration.client_id === client.id)
      const metaIntegration = clientIntegrations.find((integration) => integration.provider === 'meta_ads')
      const agendorIntegration = clientIntegrations.find((integration) => integration.provider === 'agendor')
      const businessData = (client.business_data || {}) as Record<string, unknown>
      const businessIntegrations = (businessData.integrations || {}) as Record<string, unknown>
      const dashboardTheme = (businessData.dashboardTheme || {}) as Record<string, unknown>
      const dashboardTemplates =
        Array.isArray(businessData.dashboardTemplates) && businessData.dashboardTemplates.length
          ? businessData.dashboardTemplates
          : [createDashboardTemplate({ name: 'Modelo principal' })]
      const activeDashboardTemplateId =
        typeof businessData.activeDashboardTemplateId === 'string' && businessData.activeDashboardTemplateId
          ? businessData.activeDashboardTemplateId
          : String(dashboardTemplates[0]?.id || '')
      const funnelSteps = Array.isArray(businessData.funnelSteps)
        ? businessData.funnelSteps.map((step) => String(step)).filter(Boolean)
        : ['impressions', 'clicks', 'leads', 'purchases']

      return {
        id: client.id,
        name: String(businessData.dashboardDisplayName || client.name),
        company: client.company,
        dashboardEnabled: true,
        operationEnabled: false,
        dashboardColor: String(dashboardTheme.buttonColor || businessData.dashboardButtonColor || currentTheme.primaryColor || '#0f766e'),
        dashboardAccentColor: String(dashboardTheme.accentColor || businessData.dashboardAccentColor || currentTheme.accentColor || '#f97316'),
        logoUrl: String(businessData.logoUrl || ''),
        dashboardVisibleIntegrationKeys: ['meta_ads', 'rd_station'],
        metaAdAccountId: metaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''),
        rdStationAccountId:
          agendorIntegration?.account_name ||
          normalizePipelineValues(businessData.agendorAccountIds || businessData.agendorAccountId).join(', '),
        rdPipelineId: normalizePipelineValues(businessData.agendorAccountIds || businessData.agendorAccountId).join(', '),
        rdStationToken: String(businessIntegrations.agendorToken || ''),
        funnelSteps,
        activeDashboardTemplateId,
        dashboardTemplates,
      }
    })
  }, [currentTheme.accentColor, currentTheme.primaryColor, snapshot.clients, snapshot.integrations])
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
  const metaPendingFromQuery = searchParams.get('meta_pending') === '1' || searchParams.get('meta_connected') === '1'
  const metaPending = metaConnectionPending
  const currentModule = moduleCopy[activeModule]
  const showOverview = activeModule === 'overview'
  const showDashs = activeModule === 'dashs'
  const showClients = activeModule === 'clients'
  const showSettings = activeModule === 'settings'
  const showWorkspaceControls = activeModule !== 'overview' && activeModule !== 'settings'
  const isDarkMode = currentTheme.darkMode

  function readStoredTheme() {
    if (typeof window === 'undefined') return null

    try {
      const rawTheme = localStorage.getItem(SAAS_THEME_STORAGE_KEY)
      if (!rawTheme) return null
      return JSON.parse(rawTheme) as Partial<typeof snapshot.theme>
    } catch {
      return null
    }
  }

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
    const storedTheme = readStoredTheme()
    setCurrentTheme({
      ...snapshot.theme,
      ...(storedTheme || {}),
    })
  }, [snapshot.theme])

  useEffect(() => {
    const storedTheme = readStoredTheme()
    if (!storedTheme) return

    setCurrentTheme((current) => ({
      ...current,
      ...storedTheme,
    }))
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--saas-primary', currentTheme.primaryColor)
    root.style.setProperty('--saas-accent', currentTheme.accentColor)
    root.style.setProperty('--saas-surface', currentTheme.backgroundColor)
    root.style.setProperty('--accent-blue', currentTheme.primaryColor)
    root.style.setProperty('--accent-orange', currentTheme.accentColor)
    root.style.setProperty('--main', currentTheme.primaryColor)
    root.style.setProperty('--accent', currentTheme.accentColor)
    root.dataset.uiMode = currentTheme.darkMode ? 'dark' : 'light'
  }, [currentTheme])

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
      'meta_connected',
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
        if (data.connected || accounts.length > 0 || metaPendingFromQuery) {
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

  async function handleToggleColorMode() {
    const nextTheme = {
      ...currentTheme,
      darkMode: !currentTheme.darkMode,
    }

    setCurrentTheme(nextTheme)
    setThemeModeSaving(true)

    if (typeof window !== 'undefined') {
      localStorage.setItem(SAAS_THEME_STORAGE_KEY, JSON.stringify(nextTheme))
    }

    try {
      await fetch('/api/saas/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextTheme),
      })
    } catch {
      return
    } finally {
      setThemeModeSaving(false)
    }
  }

  async function handleCreateClient() {
    const selectedAccount = metaAccounts.find((account) => account.id === clientForm.metaAdAccountId)
    const initialDashboardTemplate = createDashboardTemplate({ name: 'Modelo principal' })
    const agendorPipelines = normalizePipelineValues(clientForm.agendorAccountIds)
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
            dashboardTemplates: [initialDashboardTemplate],
            activeDashboardTemplateId: initialDashboardTemplate.id,
            dashboardDisplayName: clientForm.dashboardName || clientForm.name,
            metaAdAccountId: clientForm.metaAdAccountId,
            agendorAccountId: agendorPipelines.join(', '),
            agendorAccountIds: agendorPipelines,
            dashboardButtonColor: clientForm.dashboardButtonColor,
            dashboardAccentColor: clientForm.dashboardAccentColor,
            logoUrl: clientForm.logoUrl,
            dashboardTheme: {
              buttonColor: clientForm.dashboardButtonColor,
              accentColor: clientForm.dashboardAccentColor,
            },
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
            account_name: agendorPipelines.join(', ') || `${clientForm.name} Agendor`,
            external_account_id: agendorPipelines.join('|') || `agendor-${createdClient.id}`,
            access_token: clientForm.agendorToken,
          }),
        })
      }

      setShowClientForm(false)
      setClientForm({
        name: '',
        company: '',
        dashboardName: '',
        main_goal: 'leads',
        metaAdAccountId: '',
        agendorToken: '',
        agendorAccountIds: [],
        dashboardButtonColor: currentTheme.primaryColor || '#0f766e',
        dashboardAccentColor: currentTheme.accentColor || '#f97316',
        logoUrl: '',
      })
      setClientPipelineDraft('')
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
    window.location.href = `/api/meta/auth/start?return_to=/`
  }

  function openClientEditModal(client: PlatformSnapshot['clients'][number]) {
    const businessData = (client.business_data || {}) as Record<string, unknown>
    const clientMetaIntegration = snapshot.integrations.find(
      (integration) => integration.client_id === client.id && integration.provider === 'meta_ads'
    )
    const clientAgendorIntegration = snapshot.integrations.find(
      (integration) => integration.client_id === client.id && integration.provider === 'agendor'
    )

    setEditingClient(client)
    setSelectedClientId(client.id)
    const agendorPipelineValues = normalizePipelineValues(
      businessData.agendorAccountIds || clientAgendorIntegration?.account_name || businessData.agendorAccountId
    )
    setEditingClientForm({
      dashboardName: String(businessData.dashboardDisplayName || client.name || ''),
      logoUrl: String(businessData.logoUrl || ''),
      metaAdAccountId: clientMetaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''),
      agendorToken: String(((businessData.integrations || {}) as Record<string, unknown>).agendorToken || ''),
      agendorAccountIds: agendorPipelineValues,
    })
    setEditingPipelineDraft('')
    setSelectedMetaAccountId(clientMetaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''))
    setShowClientEditModal(true)
  }

  async function handleSaveClientSetup() {
    if (!editingClient) return

    const agendorPipelines = normalizePipelineValues(editingClientForm.agendorAccountIds)
    setEditingClientSaving(true)
    try {
      const response = await fetch(`/api/saas/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_data: {
            dashboardDisplayName: editingClientForm.dashboardName,
            logoUrl: editingClientForm.logoUrl,
            metaAdAccountId: editingClientForm.metaAdAccountId,
            agendorAccountId: agendorPipelines.join(', '),
            agendorAccountIds: agendorPipelines,
            integrations: {
              agendorToken: editingClientForm.agendorToken,
            },
          },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível atualizar o cliente.')
      }

      if (editingClientForm.metaAdAccountId) {
        const selectedAccount = metaAccounts.find((account) => account.id === editingClientForm.metaAdAccountId)
        if (selectedAccount) {
          await fetch('/api/saas/meta/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: editingClient.id,
              accountId: selectedAccount.id,
              accountName: selectedAccount.name,
            }),
          })
        }
      }

      if (editingClientForm.agendorToken.trim()) {
        await fetch('/api/saas/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: editingClient.id,
            provider: 'agendor',
            account_name: agendorPipelines.join(', ') || `${editingClient.name} Agendor`,
            external_account_id: agendorPipelines.join('|') || `agendor-${editingClient.id}`,
            access_token: editingClientForm.agendorToken,
          }),
        })
      }

      setShowClientEditModal(false)
      setEditingClient(null)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a configuração do cliente.')
    } finally {
      setEditingClientSaving(false)
    }
  }

  function handleClientLogoUpload(file: File | undefined) {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setClientForm((current) => ({ ...current, logoUrl: reader.result?.toString() || '' }))
    }
    reader.readAsDataURL(file)
  }

  function handleEditingClientLogoUpload(file: File | undefined) {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setEditingClientForm((current) => ({ ...current, logoUrl: reader.result?.toString() || '' }))
    }
    reader.readAsDataURL(file)
  }

  function addPipelineToClientForm() {
    const value = clientPipelineDraft.trim()
    if (!value) return

    setClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.includes(value)
        ? current.agendorAccountIds
        : [...current.agendorAccountIds, value],
    }))
    setClientPipelineDraft('')
  }

  function removePipelineFromClientForm(pipeline: string) {
    setClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.filter((item) => item !== pipeline),
    }))
  }

  function addPipelineToEditingForm() {
    const value = editingPipelineDraft.trim()
    if (!value) return

    setEditingClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.includes(value)
        ? current.agendorAccountIds
        : [...current.agendorAccountIds, value],
    }))
    setEditingPipelineDraft('')
  }

  function removePipelineFromEditingForm(pipeline: string) {
    setEditingClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.filter((item) => item !== pipeline),
    }))
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
      className={`min-h-screen ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
      style={{
        background: isDarkMode
          ? 'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--saas-primary) 20%, transparent), transparent 28%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--saas-accent) 18%, transparent), transparent 24%), radial-gradient(circle at 50% 100%, rgba(148,163,184,0.08), transparent 34%), linear-gradient(180deg,#020617,#0f172a 54%,#020617)'
          : 'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--saas-primary) 18%, transparent), transparent 28%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--saas-accent) 22%, transparent), transparent 24%), radial-gradient(circle at 50% 100%, rgba(15,23,42,0.05), transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--saas-surface) 94%, white), #ffffff)',
      }}
    >
      <div className="flex min-h-screen w-full gap-4 px-3 py-4 sm:px-4 lg:gap-6 lg:px-6 xl:px-8">
        <aside className={`relative sticky top-4 hidden h-[calc(100vh-2rem)] flex-none flex-col rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#020617,#0f172a)] py-7 text-white shadow-[0_30px_100px_rgba(2,6,23,0.36)] transition-all duration-300 lg:flex ${isSidebarCollapsed ? 'w-[92px] px-3' : 'w-[272px] px-6 xl:w-[292px]'}`}>
          <div className={`mb-8 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              {currentTheme.logoUrl ? (
                <img src={currentTheme.logoUrl} alt="Logo Nype Orbit" className="h-full w-full rounded-2xl object-contain p-2" />
              ) : (
                <Sparkles className="h-6 w-6" />
              )}
            </div>
            {!isSidebarCollapsed ? (
            <div>
              <p className="font-manrope text-lg font-extrabold">Nype Orbit</p>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Marketing OS</p>
            </div>
            ) : null}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              className={`grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white ${isSidebarCollapsed ? 'absolute left-1/2 top-6 -translate-x-1/2' : 'ml-auto'}`}
              aria-label={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              title={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isSidebarCollapsed ? '' : 'rotate-180'}`} />
            </button>
          </div>
          <nav className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = item.key === activeModule
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveModule(item.key)}
                  className={`flex w-full items-center rounded-2xl py-3 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.12)]'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  } ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}
                  type="button"
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {!isSidebarCollapsed ? item.label : null}
                </button>
              )
            })}
          </nav>
          <div className={`mt-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] ${isSidebarCollapsed ? 'p-3' : 'p-5'}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              {!isSidebarCollapsed ? <p className="text-sm font-semibold">Segurança multi-tenant</p> : null}
            </div>
            {!isSidebarCollapsed ? (
              <p className="mt-2 text-sm leading-6 text-white/60">Cada usuário acessa somente os clientes, dashs e integrações vinculados ao próprio tenant.</p>
            ) : null}
          </div>
          <div className={`mt-3 flex ${isSidebarCollapsed ? 'flex-col gap-2' : 'items-center gap-2'}`}>
            <button
              type="button"
              onClick={handleToggleColorMode}
              disabled={themeModeSaving}
              className={`flex items-center rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-70 ${isSidebarCollapsed ? 'justify-center px-0' : 'flex-1 gap-3 px-4'}`}
              title={currentTheme.darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              aria-label={currentTheme.darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {currentTheme.darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!isSidebarCollapsed ? (themeModeSaving ? 'Salvando...' : currentTheme.darkMode ? 'Modo claro' : 'Modo escuro') : null}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`flex items-center rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
              {!isSidebarCollapsed ? 'Sair' : null}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {!showDashs ? (
          <section className={`relative overflow-hidden rounded-[34px] p-5 backdrop-blur-xl ${isDarkMode ? 'border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.94))] shadow-[0_26px_80px_rgba(0,0,0,0.35)]' : 'border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))] shadow-[0_26px_80px_rgba(15,23,42,0.08)]'}`}>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.15),transparent_46%),radial-gradient(circle_at_bottom,rgba(15,118,110,0.18),transparent_42%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <h1 className={`font-manrope text-4xl font-extrabold tracking-[-0.05em] md:text-5xl ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                  {showOverview
                    ? `Boas-vindas, ${currentUserName}`
                    : showDashs
                    ? selectedClient.name || 'Dashboard do cliente'
                    : currentModule.title}
                </h1>
                <p className={`mt-4 max-w-2xl text-base leading-7 ${isDarkMode ? 'text-white/65' : 'text-slate-600'}`}>
                  {showOverview
                    ? 'Use a IA para consultar clientes, campanhas, dashs, integrações e arquivos vinculados.'
                    : showDashs
                    ? 'A seguir, apresentamos um panorama consolidado do período selecionado, separando os dados por origem para facilitar a leitura executiva da operação.'
                    : currentModule.description}
                </p>
                {showWorkspaceControls && !showDashs ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  {positiveMetrics.map((metric) => (
                    <div key={metric.label} className={`rounded-2xl px-4 py-3 shadow-sm ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/80 bg-white/90'}`}>
                      <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>{metric.label}</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{formatValue(metric.value, metric.format)}</p>
                    </div>
                  ))}
                </div>
                ) : null}
              </div>
              {showWorkspaceControls ? (
              <div className="grid gap-3 xl:min-w-[420px]">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <select
                    className={`h-12 rounded-2xl px-4 text-sm font-medium shadow-sm ${isDarkMode ? 'border border-white/10 bg-slate-950/70 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
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
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Conta de anúncio</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{selectedMetaIntegration?.external_account_id || selectedMetaIntegration?.account_name || 'Não vinculada'}</p>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>CRM</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{selectedAgendorPipelines.join(', ') || 'Não vinculado'}</p>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Vendedor</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Todos os vendedores</p>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Demais integrações mapeadas</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{selectedClientIntegrations.length} conta(s) vinculada(s)</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Integrações</p>
                      <p className={`mt-2 font-manrope text-2xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{selectedClientIntegrations.length}</p>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/70 bg-white/80'}`}>
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Objetivo</p>
                      <p className={`mt-2 font-manrope text-xl font-extrabold capitalize ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{objectiveLabel(selectedClient.main_goal)}</p>
                    </div>
                  </div>
                )}
                {loadingClientContext ? (
                  <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${isDarkMode ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border border-amber-200 bg-amber-50 text-amber-700'}`}>
                    Carregando o contexto completo do cliente selecionado...
                  </div>
                ) : null}
              </div>
              ) : (
                <div className={`rounded-[30px] p-5 shadow-sm xl:min-w-[360px] ${isDarkMode ? 'border border-white/10 bg-white/5' : 'border border-slate-200/80 bg-white/80'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Atalho inteligente</p>
                  <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
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
              initialAppLogoUrl={currentTheme.logoUrl || ''}
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
          <section className="grid gap-6">
            <Card className={isDarkMode ? 'border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.92))] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]' : ''}>
              <CardHeader>
                <div>
                  <CardTitle className={isDarkMode ? 'text-white' : ''}>Clientes cadastrados</CardTitle>
                  <CardDescription className={isDarkMode ? 'text-white/60' : ''}>Clique em um cliente para abrir a configuração rápida de conta Meta e API do Agendor.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {snapshot.clients.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {snapshot.clients.map((client) => {
                      const isActiveClient = client.id === selectedClient.id
                      const clientIntegrationsCount = snapshot.integrations.filter((integration) => integration.client_id === client.id).length

                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => openClientEditModal(client)}
                          className={`group flex min-h-[148px] flex-col justify-between rounded-[28px] border px-5 py-4 text-left transition ${
                            isActiveClient
                              ? 'border-[var(--saas-primary)] bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(249,115,22,0.08))] shadow-[0_18px_45px_rgba(15,23,42,0.08)]'
                              : isDarkMode
                                ? 'border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
                                : 'border-slate-200/80 bg-white/90 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`truncate font-manrope text-xl font-extrabold ${isActiveClient || isDarkMode ? 'text-white' : 'text-slate-950'}`}>{client.name}</p>
                              <p className={`mt-1 truncate text-sm ${isActiveClient ? 'text-white/60' : isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>{client.company}</p>
                            </div>
                            <ChevronRight className={`h-5 w-5 flex-none ${isActiveClient ? 'text-[var(--saas-primary)]' : 'text-slate-300 transition group-hover:text-slate-500'}`} />
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className={`rounded-2xl px-3 py-2 ${isDarkMode && !isActiveClient ? 'bg-slate-950/60' : 'bg-white/80'}`}>
                              <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Objetivo</p>
                              <p className={`mt-1 text-sm font-bold capitalize ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{objectiveLabel(client.main_goal)}</p>
                            </div>
                            <div className={`rounded-2xl px-3 py-2 ${isDarkMode && !isActiveClient ? 'bg-slate-950/60' : 'bg-white/80'}`}>
                              <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Integrações</p>
                              <p className={`mt-1 text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{clientIntegrationsCount}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className={`rounded-[28px] px-6 py-10 text-center ${isDarkMode ? 'border border-dashed border-white/10 bg-white/5' : 'border border-dashed border-slate-200 bg-slate-50/70'}`}>
                    <p className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Nenhum cliente cadastrado ainda.</p>
                    <p className={`mt-2 text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>Crie o primeiro cliente para começar a montar os dashboards.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          ) : null}

          {showSettings ? (
          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <ThemePanel
              initialTheme={currentTheme}
              onThemeChange={setCurrentTheme}
              onThemeSaved={setCurrentTheme}
            />

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
                      <p className="font-semibold text-slate-900">Conexão global via Facebook</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Conecte uma vez a conta Facebook da agência para listar todas as contas de anúncio disponíveis. No cadastro do cliente você apenas seleciona a conta correta.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={handleConnectMeta}>
                      Conectar Facebook da agência
                    </Button>
                  </div>
                  {metaPending ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
                      Meta conectada globalmente. As contas disponíveis já podem ser selecionadas no cadastro de qualquer cliente.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-4">
                  <p className="font-semibold text-slate-900">Token/API global da Meta</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Se preferir não usar o login do Facebook, cole aqui um access token da Meta uma única vez. A última opção conectada, Facebook ou token, fica ativa para listar as contas dos clientes.
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
              isDarkMode={isDarkMode}
            />
          </section>
          ) : null}

          {showClients ? (
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

      {showClientEditModal && editingClient ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[34px] border border-white/80 bg-white p-6 shadow-[0_40px_120px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Editar cliente</p>
                <h2 className="mt-2 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
                  {editingClient.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Selecione a conta de anúncio da Meta e informe a API/token do Agendor para este cliente.
                </p>
              </div>
              <button
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600"
                onClick={() => {
                  setShowClientEditModal(false)
                  setEditingClient(null)
                }}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-5">
              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-semibold text-slate-900">Identidade do dashboard</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Ajuste o nome exibido no dash e a logo usada na apresentação do cliente.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    Nome exibido no dashboard
                    <input
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                      value={editingClientForm.dashboardName}
                      onChange={(event) => setEditingClientForm((current) => ({ ...current, dashboardName: event.target.value }))}
                      placeholder="Ex.: Dashboard Schmidt"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-[96px_1fr] md:items-center">
                    <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white">
                      {editingClientForm.logoUrl ? (
                        <img src={editingClientForm.logoUrl} alt="Logo do dashboard" className="h-full w-full object-contain p-2" />
                      ) : (
                        <span className="px-2 text-center text-[11px] font-semibold text-slate-400">Sem logo</span>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-slate-600">
                        Logo do dashboard
                        <input
                          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm"
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleEditingClientLogoUpload(event.target.files?.[0])}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-600">
                        URL da logo
                        <input
                          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none"
                          value={editingClientForm.logoUrl}
                          onChange={(event) => setEditingClientForm((current) => ({ ...current, logoUrl: event.target.value }))}
                          placeholder="https://..."
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">Meta Ads</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Escolha a conta da Meta já conectada globalmente para vincular ao cliente.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setActiveModule('settings')} type="button">
                    Configurações
                  </Button>
                </div>
                <select
                  className="mt-4 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                  value={editingClientForm.metaAdAccountId}
                  onChange={(event) => setEditingClientForm((current) => ({ ...current, metaAdAccountId: event.target.value }))}
                >
                  <option value="">{loadingMetaAccounts ? 'Carregando contas...' : 'Selecione uma conta de anúncio'}</option>
                  {metaAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-semibold text-slate-900">Agendor</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Informe o token/API e adicione quantos pipelines comerciais quiser para este cliente.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    API / Token do Agendor
                    <input
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                      type="password"
                      value={editingClientForm.agendorToken}
                      onChange={(event) => setEditingClientForm((current) => ({ ...current, agendorToken: event.target.value }))}
                      placeholder="Cole o token do Agendor"
                    />
                  </label>
                  <div className="grid gap-2 text-sm font-medium text-slate-600">
                    Pipelines do Agendor
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                        value={editingPipelineDraft}
                        onChange={(event) => setEditingPipelineDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addPipelineToEditingForm()
                          }
                        }}
                        placeholder="Digite um pipeline e pressione Enter"
                      />
                      <Button variant="secondary" onClick={addPipelineToEditingForm} type="button">
                        Adicionar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editingClientForm.agendorAccountIds.length > 0 ? (
                        editingClientForm.agendorAccountIds.map((pipeline) => (
                          <button
                            key={pipeline}
                            type="button"
                            onClick={() => removePipelineFromEditingForm(pipeline)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            title="Remover pipeline"
                          >
                            {pipeline} ×
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum pipeline adicionado ainda.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowClientEditModal(false)
                  setEditingClient(null)
                }}
                type="button"
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveClientSetup} disabled={editingClientSaving} type="button">
                {editingClientSaving ? 'Salvando...' : 'Salvar cliente'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
                  Nome exibido no dashboard
                  <input
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                    value={clientForm.dashboardName}
                    onChange={(event) => setClientForm((current) => ({ ...current, dashboardName: event.target.value }))}
                    placeholder="Ex.: Dashboard Clínica Pulse"
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
                <p className="font-semibold text-slate-900">Tema deste dashboard</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Cada cliente pode ter cores próprias no dash, sem alterar o tema global do app.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    Fundo dos botões
                    <input
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
                      type="color"
                      value={clientForm.dashboardButtonColor}
                      onChange={(event) => setClientForm((current) => ({ ...current, dashboardButtonColor: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    Cor complementar
                    <input
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
                      type="color"
                      value={clientForm.dashboardAccentColor}
                      onChange={(event) => setClientForm((current) => ({ ...current, dashboardAccentColor: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[96px_1fr] md:items-center">
                    <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white">
                      {clientForm.logoUrl ? (
                      <img src={clientForm.logoUrl} alt="Logo do dashboard" className="h-full w-full object-contain p-2" />
                      ) : (
                      <span className="px-2 text-center text-[11px] font-semibold text-slate-400">Sem logo</span>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-slate-600">
                      Logo do dashboard
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm"
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleClientLogoUpload(event.target.files?.[0])}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-600">
                      URL da logo
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none"
                        value={clientForm.logoUrl}
                        onChange={(event) => setClientForm((current) => ({ ...current, logoUrl: event.target.value }))}
                        placeholder="https://..."
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">Meta Ads</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Selecione a conta de anúncio. Caso a lista esteja vazia, conecte o Facebook da agência ou salve o token global em Configurações.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setActiveModule('settings')} type="button">
                    Configurar Meta
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
                  Informe a API/token e adicione quantos pipelines comerciais quiser para esse cliente.
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
                  <div className="grid gap-2 text-sm font-medium text-slate-600">
                    Pipelines do Agendor
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                        value={clientPipelineDraft}
                        onChange={(event) => setClientPipelineDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addPipelineToClientForm()
                          }
                        }}
                        placeholder="Digite um pipeline e pressione Enter"
                      />
                      <Button variant="secondary" onClick={addPipelineToClientForm} type="button">
                        Adicionar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {clientForm.agendorAccountIds.length > 0 ? (
                        clientForm.agendorAccountIds.map((pipeline) => (
                          <button
                            key={pipeline}
                            type="button"
                            onClick={() => removePipelineFromClientForm(pipeline)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            title="Remover pipeline"
                          >
                            {pipeline} ×
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum pipeline adicionado ainda.</p>
                      )}
                    </div>
                  </div>
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
