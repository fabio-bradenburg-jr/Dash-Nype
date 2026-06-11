'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Building2, ChevronRight, Cpu, FileText, LayoutDashboard, LineChart, LogOut, Moon, Settings2, ShieldCheck, Sparkles, Sun, Users } from 'lucide-react'

import { AiAssistantPanel } from '@/components/saas/ai-assistant-panel'
import { AiIntegrationPanel } from '@/components/saas/ai-integration-panel'
import { ThemePanel } from '@/components/saas/theme-panel'
import LegacyDashboardShell from '@/components/dashboard/DashboardShell'
import ReportsTab from '@/components/dashboard/ReportsTab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createDashboardTemplate } from '@/lib/dashboard-storage'
import { applyThemeMode, applyThemeVariables, getThemeMode } from '@/lib/saas/theme-presets'
import { ClientContextBundle, KnowledgeSource, MetricCard, PlatformSnapshot } from '@/lib/saas/types'

const SAAS_THEME_STORAGE_KEY = 'nype-orbit-saas-theme'

const navigation = [
  { key: 'overview', label: 'Visão geral', icon: Cpu },
  { key: 'dashs', label: 'Dashs', icon: LayoutDashboard },
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'relatorios', label: 'Relatórios', icon: FileText },
  { key: 'settings', label: 'Configurações', icon: Settings2 },
] as const

type NavigationKey = (typeof navigation)[number]['key']
type AgendorPipelineOption = {
  id: string
  name: string
  label: string
  pipelineId?: string
  pipelineName?: string
}

type ManualCrmFormValues = {
  opportunityCount: string
  qualifiedOpportunityCount: string
  wonOpportunityCount: string
  lostOpportunityCount: string
  wonRevenue: string
}

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
  relatorios: {
    title: 'Relatórios salvos',
    description: 'PDFs gerados e salvos para clientes, organizados por período.',
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

function normalizePipelineValues(values: unknown): string[] {
  if (Array.isArray(values)) {
    return values.map((item) => String(item || '').trim()).filter(Boolean)
  }

  return String(values || '')
    .split(/[\n,;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveSelectedPipelineNames(selectedIds: string[], options: AgendorPipelineOption[]) {
  if (!selectedIds.length) return []
  const optionsById = new Map(options.map((option) => [option.id, option]))
  return selectedIds.map((id) => optionsById.get(id)?.label || optionsById.get(id)?.name || id)
}

function resolveSelectedStageNames(selectedIds: string[], options: AgendorPipelineOption[]) {
  if (!selectedIds.length) return []
  const optionsById = new Map(options.map((option) => [option.id, option]))
  return selectedIds.map((id) => optionsById.get(id)?.name || optionsById.get(id)?.label || id)
}

function createEmptyManualCrmForm(): ManualCrmFormValues {
  return {
    opportunityCount: '',
    qualifiedOpportunityCount: '',
    wonOpportunityCount: '',
    lostOpportunityCount: '',
    wonRevenue: '',
  }
}

function parseManualCrmPayload(value: unknown): ManualCrmFormValues {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  return {
    opportunityCount: String(payload.opportunityCount ?? ''),
    qualifiedOpportunityCount: String(payload.qualifiedOpportunityCount ?? ''),
    wonOpportunityCount: String(payload.wonOpportunityCount ?? ''),
    lostOpportunityCount: String(payload.lostOpportunityCount ?? ''),
    wonRevenue: String(payload.wonRevenue ?? ''),
  }
}

function buildManualCrmPayload(form: ManualCrmFormValues) {
  return {
    opportunityCount: Number(form.opportunityCount || 0),
    qualifiedOpportunityCount: Number(form.qualifiedOpportunityCount || 0),
    wonOpportunityCount: Number(form.wonOpportunityCount || 0),
    lostOpportunityCount: Number(form.lostOpportunityCount || 0),
    wonRevenue: Number(form.wonRevenue || 0),
  }
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
  const [currentTheme, setCurrentTheme] = useState(() => applyThemeMode(snapshot.theme, getThemeMode(snapshot.theme)))
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
    metaAdAccountId: '',
    crmMode: 'agendor',
    agendorToken: '',
    agendorAccountIds: [] as string[],
    agendorQualifiedStageIds: [] as string[],
    manualCrm: createEmptyManualCrmForm(),
    dashboardButtonColor: currentTheme.primaryColor || '#e53935',
    dashboardAccentColor: currentTheme.accentColor || '#ef5350',
    logoUrl: '',
  })
  const [clientAgendorOptions, setClientAgendorOptions] = useState<AgendorPipelineOption[]>([])
  const [clientAgendorStageOptions, setClientAgendorStageOptions] = useState<AgendorPipelineOption[]>([])
  const [clientAgendorLoading, setClientAgendorLoading] = useState(false)
  const [clientAgendorError, setClientAgendorError] = useState('')
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
    crmMode: 'agendor',
    agendorToken: '',
    agendorAccountIds: [] as string[],
    agendorQualifiedStageIds: [] as string[],
    manualCrm: createEmptyManualCrmForm(),
  })
  const [editingAgendorOptions, setEditingAgendorOptions] = useState<AgendorPipelineOption[]>([])
  const [editingAgendorStageOptions, setEditingAgendorStageOptions] = useState<AgendorPipelineOption[]>([])
  const [editingAgendorLoading, setEditingAgendorLoading] = useState(false)
  const [editingAgendorError, setEditingAgendorError] = useState('')
  const clientAgendorFetchKeyRef = useRef('')
  const editingAgendorFetchKeyRef = useRef('')
  const selectedClientIntegrations = clientIntegrations
  const selectedMetaIntegration = selectedClientIntegrations.find((integration) => integration.provider === 'meta_ads')
  const selectedAgendorPipelines = normalizePipelineValues(
    selectedClient.business_data?.agendorPipelineNames ||
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
        dashboardColor: String(dashboardTheme.buttonColor || businessData.dashboardButtonColor || currentTheme.primaryColor || '#e53935'),
        dashboardAccentColor: String(dashboardTheme.accentColor || businessData.dashboardAccentColor || currentTheme.accentColor || '#ef5350'),
        logoUrl: String(businessData.logoUrl || ''),
        dashboardVisibleIntegrationKeys: ['meta_ads', 'rd_station'],
        metaAdAccountId: metaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''),
        rdStationAccountId:
          normalizePipelineValues(businessData.agendorPipelineNames).join(', ') ||
          agendorIntegration?.account_name ||
          normalizePipelineValues(businessData.agendorAccountIds || businessData.agendorAccountId).join(', '),
        rdPipelineId: normalizePipelineValues(businessData.agendorPipelineIds || businessData.agendorAccountIds || businessData.agendorAccountId).join(', '),
        rdQualifiedStages: normalizePipelineValues(businessData.agendorQualifiedStages || businessData.rdQualifiedStages),
        rdStationToken: String(businessIntegrations.agendorToken || ''),
        integrations: {
          rdStationToken: String(businessIntegrations.agendorToken || ''),
        },
        crmProvider: String(businessData.crmMode || '').trim().toLowerCase() === 'manual' ? 'manual' : 'agendor',
        manualCrmSummary: buildManualCrmPayload(parseManualCrmPayload(businessData.manualCrmSummary)),
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
    { name: 'Compras', value: getMetric('purchases')?.value || 0, color: 'var(--accent-blue)' },
    { name: 'Leads', value: getMetric('leads')?.value || 0, color: '#10b981' },
    { name: 'Mensagens', value: getMetric('messages')?.value || 0, color: '#f59e0b' },
    { name: 'Cliques sem conversão', value: getMetric('clicksWithoutConversion')?.value || 0, color: '#475569' },
  ]
  const chartHasDistribution = distributionData.some((item) => item.value > 0)
  const clientSelectedPipelineLabels = resolveSelectedPipelineNames(clientForm.agendorAccountIds, clientAgendorOptions)
  const editingSelectedPipelineLabels = resolveSelectedPipelineNames(editingClientForm.agendorAccountIds, editingAgendorOptions)
  const clientSelectedQualifiedStageLabels = resolveSelectedStageNames(clientForm.agendorQualifiedStageIds, clientAgendorStageOptions)
  const editingSelectedQualifiedStageLabels = resolveSelectedStageNames(editingClientForm.agendorQualifiedStageIds, editingAgendorStageOptions)
  const clientUsesManualCrm = clientForm.crmMode === 'manual'
  const editingClientUsesManualCrm = editingClientForm.crmMode === 'manual'
  const clientVisibleAgendorStages = clientAgendorStageOptions.filter(
    (stage) => !clientForm.agendorAccountIds.length || clientForm.agendorAccountIds.includes(stage.pipelineId || '')
  )
  const editingVisibleAgendorStages = editingAgendorStageOptions.filter(
    (stage) => !editingClientForm.agendorAccountIds.length || editingClientForm.agendorAccountIds.includes(stage.pipelineId || '')
  )
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
  const showRelatorios = activeModule === 'relatorios'
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
    setCurrentTheme(applyThemeMode({
      ...snapshot.theme,
      ...(storedTheme || {}),
    }, getThemeMode(storedTheme || snapshot.theme)))
  }, [snapshot.theme])

  useEffect(() => {
    const storedTheme = readStoredTheme()
    if (!storedTheme) return

    setCurrentTheme((current) => applyThemeMode({
      ...current,
      ...storedTheme,
    }, getThemeMode(storedTheme)))
  }, [])

  useEffect(() => {
    applyThemeVariables(document.documentElement, currentTheme)
  }, [currentTheme])

  useEffect(() => {
    const token = clientForm.agendorToken.trim()
    if (!showClientForm || clientForm.crmMode === 'manual' || token.length < 8) return
    if (clientAgendorFetchKeyRef.current === token && clientAgendorOptions.length > 0) return
    const timeout = window.setTimeout(() => {
      void loadAgendorPipelines(token, 'create')
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [clientForm.agendorToken, clientForm.crmMode, showClientForm, clientAgendorOptions.length])

  useEffect(() => {
    const token = editingClientForm.agendorToken.trim()
    if (!showClientEditModal || editingClientForm.crmMode === 'manual' || token.length < 8) return
    if (editingAgendorFetchKeyRef.current === token && editingAgendorOptions.length > 0) return
    const timeout = window.setTimeout(() => {
      void loadAgendorPipelines(token, 'edit')
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [editingClientForm.agendorToken, editingClientForm.crmMode, showClientEditModal, editingAgendorOptions.length])

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
    const nextTheme = applyThemeMode(currentTheme, currentTheme.darkMode ? 'light' : 'dark')

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
    const agendorPipelineNames = resolveSelectedPipelineNames(agendorPipelines, clientAgendorOptions)
    const agendorQualifiedStageNames = resolveSelectedStageNames(clientForm.agendorQualifiedStageIds, clientAgendorStageOptions)
    const usesManualCrm = clientForm.crmMode === 'manual'
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
          main_goal: 'leads',
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
            crmMode: usesManualCrm ? 'manual' : 'agendor',
            metaAdAccountId: clientForm.metaAdAccountId,
            agendorAccountId: usesManualCrm ? '' : agendorPipelines.join(', '),
            agendorAccountIds: usesManualCrm ? [] : agendorPipelines,
            agendorPipelineIds: usesManualCrm ? [] : agendorPipelines,
            agendorPipelineNames: usesManualCrm ? [] : agendorPipelineNames,
            agendorQualifiedStageIds: usesManualCrm ? [] : clientForm.agendorQualifiedStageIds,
            agendorQualifiedStages: usesManualCrm ? [] : agendorQualifiedStageNames,
            manualCrmSummary: buildManualCrmPayload(clientForm.manualCrm),
            dashboardButtonColor: clientForm.dashboardButtonColor,
            dashboardAccentColor: clientForm.dashboardAccentColor,
            logoUrl: clientForm.logoUrl,
            dashboardTheme: {
              buttonColor: clientForm.dashboardButtonColor,
              accentColor: clientForm.dashboardAccentColor,
            },
            integrations: {
              agendorToken: usesManualCrm ? '' : clientForm.agendorToken,
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

      if (!usesManualCrm && clientForm.agendorToken.trim()) {
        await fetch('/api/saas/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: createdClient.id,
            provider: 'agendor',
            account_name: agendorPipelineNames.join(', ') || `${clientForm.name} Agendor`,
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
        metaAdAccountId: '',
        crmMode: 'agendor',
        agendorToken: '',
        agendorAccountIds: [],
        agendorQualifiedStageIds: [],
        manualCrm: createEmptyManualCrmForm(),
        dashboardButtonColor: currentTheme.primaryColor || '#0f766e',
        dashboardAccentColor: currentTheme.accentColor || '#f97316',
        logoUrl: '',
      })
      setClientAgendorOptions([])
      setClientAgendorStageOptions([])
      setClientAgendorError('')
      clientAgendorFetchKeyRef.current = ''
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
      businessData.agendorPipelineIds || businessData.agendorAccountIds || clientAgendorIntegration?.account_name || businessData.agendorAccountId
    )
    setEditingClientForm({
      dashboardName: String(businessData.dashboardDisplayName || client.name || ''),
      logoUrl: String(businessData.logoUrl || ''),
      metaAdAccountId: clientMetaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''),
      crmMode: String(businessData.crmMode || '').trim().toLowerCase() === 'manual' ? 'manual' : 'agendor',
      agendorToken: String(((businessData.integrations || {}) as Record<string, unknown>).agendorToken || ''),
      agendorAccountIds: agendorPipelineValues,
      agendorQualifiedStageIds: normalizePipelineValues(businessData.agendorQualifiedStageIds || businessData.agendorQualifiedStages),
      manualCrm: parseManualCrmPayload(businessData.manualCrmSummary),
    })
    setEditingAgendorOptions([])
    setEditingAgendorStageOptions([])
    setEditingAgendorError('')
    editingAgendorFetchKeyRef.current = ''
    setSelectedMetaAccountId(clientMetaIntegration?.external_account_id || String(businessData.metaAdAccountId || ''))
    setShowClientEditModal(true)
  }

  async function handleSaveClientSetup() {
    if (!editingClient) return

    const agendorPipelines = normalizePipelineValues(editingClientForm.agendorAccountIds)
    const agendorPipelineNames = resolveSelectedPipelineNames(agendorPipelines, editingAgendorOptions)
    const agendorQualifiedStageNames = resolveSelectedStageNames(editingClientForm.agendorQualifiedStageIds, editingAgendorStageOptions)
    const usesManualCrm = editingClientForm.crmMode === 'manual'
    setEditingClientSaving(true)
    try {
      const response = await fetch(`/api/saas/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_data: {
            dashboardDisplayName: editingClientForm.dashboardName,
            logoUrl: editingClientForm.logoUrl,
            crmMode: usesManualCrm ? 'manual' : 'agendor',
            metaAdAccountId: editingClientForm.metaAdAccountId,
            agendorAccountId: usesManualCrm ? '' : agendorPipelines.join(', '),
            agendorAccountIds: usesManualCrm ? [] : agendorPipelines,
            agendorPipelineIds: usesManualCrm ? [] : agendorPipelines,
            agendorPipelineNames: usesManualCrm ? [] : agendorPipelineNames,
            agendorQualifiedStageIds: usesManualCrm ? [] : editingClientForm.agendorQualifiedStageIds,
            agendorQualifiedStages: usesManualCrm ? [] : agendorQualifiedStageNames,
            manualCrmSummary: buildManualCrmPayload(editingClientForm.manualCrm),
            integrations: {
              agendorToken: usesManualCrm ? '' : editingClientForm.agendorToken,
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

      if (!usesManualCrm && editingClientForm.agendorToken.trim()) {
        await fetch('/api/saas/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: editingClient.id,
            provider: 'agendor',
            account_name: agendorPipelineNames.join(', ') || `${editingClient.name} Agendor`,
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

  async function loadAgendorPipelines(token: string, mode: 'create' | 'edit') {
    const normalizedToken = token.trim()
    if (!normalizedToken) return

    if (mode === 'create') {
      setClientAgendorLoading(true)
      setClientAgendorError('')
      clientAgendorFetchKeyRef.current = normalizedToken
    } else {
      setEditingAgendorLoading(true)
      setEditingAgendorError('')
      editingAgendorFetchKeyRef.current = normalizedToken
    }

    try {
      const response = await fetch('/api/saas/agendor/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: normalizedToken }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível ler os pipelines do Agendor.')
      }
      const options = Array.isArray(data?.pipelines) ? (data.pipelines as AgendorPipelineOption[]) : []
      const stageOptions = Array.isArray(data?.stages) ? (data.stages as AgendorPipelineOption[]) : []
      if (mode === 'create') {
        setClientAgendorOptions(options)
        setClientAgendorStageOptions(stageOptions)
      } else {
        setEditingAgendorOptions(options)
        setEditingAgendorStageOptions(stageOptions)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível ler os pipelines do Agendor.'
      if (mode === 'create') {
        setClientAgendorError(message)
      } else {
        setEditingAgendorError(message)
      }
    } finally {
      if (mode === 'create') {
        setClientAgendorLoading(false)
      } else {
        setEditingAgendorLoading(false)
      }
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

  function togglePipelineOnClientForm(value: string) {
    setClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.includes(value)
        ? current.agendorAccountIds.filter((item) => item !== value)
        : [...current.agendorAccountIds, value],
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.filter((stageId) => {
        const stage = clientAgendorStageOptions.find((item) => item.id === stageId)
        return current.agendorAccountIds.includes(value) ? stage?.pipelineId !== value : true
      }),
    }))
  }

  function removePipelineFromClientForm(pipeline: string) {
    setClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.filter((item) => item !== pipeline),
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.filter((stageId) => {
        const stage = clientAgendorStageOptions.find((item) => item.id === stageId)
        return stage?.pipelineId !== pipeline
      }),
    }))
  }

  function togglePipelineOnEditingForm(value: string) {
    setEditingClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.includes(value)
        ? current.agendorAccountIds.filter((item) => item !== value)
        : [...current.agendorAccountIds, value],
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.filter((stageId) => {
        const stage = editingAgendorStageOptions.find((item) => item.id === stageId)
        return current.agendorAccountIds.includes(value) ? stage?.pipelineId !== value : true
      }),
    }))
  }

  function removePipelineFromEditingForm(pipeline: string) {
    setEditingClientForm((current) => ({
      ...current,
      agendorAccountIds: current.agendorAccountIds.filter((item) => item !== pipeline),
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.filter((stageId) => {
        const stage = editingAgendorStageOptions.find((item) => item.id === stageId)
        return stage?.pipelineId !== pipeline
      }),
    }))
  }

  function toggleQualifiedStageOnClientForm(value: string) {
    setClientForm((current) => ({
      ...current,
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.includes(value)
        ? current.agendorQualifiedStageIds.filter((item) => item !== value)
        : [...current.agendorQualifiedStageIds, value],
    }))
  }

  function toggleQualifiedStageOnEditingForm(value: string) {
    setEditingClientForm((current) => ({
      ...current,
      agendorQualifiedStageIds: current.agendorQualifiedStageIds.includes(value)
        ? current.agendorQualifiedStageIds.filter((item) => item !== value)
        : [...current.agendorQualifiedStageIds, value],
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
    <div className={`saas-app-shell flex min-h-screen ${isDarkMode ? 'bg-[#060607] text-white' : 'bg-[#f5f5f7] text-[#1c1c1e]'}`}>
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <section className="lg:hidden">
          <div className={`flex items-center justify-between border-b px-4 py-3 ${isDarkMode ? 'border-white/[0.06] bg-[#060607]' : 'border-black/[0.06] bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--saas-primary)]">
                {currentTheme.logoUrl ? (
                  <img src={currentTheme.logoUrl} alt="" className="h-full w-full rounded-[9px] object-contain p-1.5" />
                ) : (
                  <span className="brand-logo-mark saas-brand-logo-mark" aria-hidden="true"></span>
                )}
              </div>
              <p className={`font-manrope text-[15px] font-bold tracking-[-0.02em] ${isDarkMode ? 'text-white' : 'text-[#1c1c1e]'}`}>{currentTheme.appName || 'Assessoria LP'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleToggleColorMode} disabled={themeModeSaving} className={`grid h-8 w-8 place-items-center rounded-[9px] ${isDarkMode ? 'text-white/50' : 'text-black/50'}`}>
                {currentTheme.darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button type="button" onClick={handleLogout} className={`grid h-8 w-8 place-items-center rounded-[9px] ${isDarkMode ? 'text-white/50' : 'text-black/50'}`}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className={`flex overflow-x-auto border-b px-4 ${isDarkMode ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
            {navigation.map((item) => {
              const Icon = item.icon
              const active = item.key === activeModule
              return (
                <button
                  key={`mobile-${item.label}`}
                  onClick={() => setActiveModule(item.key)}
                  type="button"
                  className={`flex flex-none items-center gap-1.5 border-b-2 px-3 py-3 text-[12px] font-medium transition ${
                    active
                      ? 'border-[var(--saas-primary)] text-[var(--saas-primary)]'
                      : `border-transparent ${isDarkMode ? 'text-white/45' : 'text-black/45'}`
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </section>

        <aside className={`fixed left-0 top-0 z-40 hidden h-full w-[64px] flex-col items-center border-r py-5 lg:flex ${isDarkMode ? 'border-white/[0.06] bg-[#060607]' : 'border-black/[0.06] bg-white'}`}>
          {/* Logo */}
          <div className={`mb-6 grid h-9 w-9 flex-none place-items-center rounded-[11px] bg-[var(--saas-primary)]`}>
            {currentTheme.logoUrl ? (
              <img src={currentTheme.logoUrl} alt="" className="h-full w-full rounded-[11px] object-contain p-1.5" />
            ) : (
              <span className="brand-logo-mark saas-brand-logo-mark" aria-hidden="true"></span>
            )}
          </div>

          {/* Divider */}
          <div className={`mb-4 h-px w-8 ${isDarkMode ? 'bg-white/[0.08]' : 'bg-black/[0.08]'}`} />

          {/* Nav */}
          <nav className="flex flex-col items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = item.key === activeModule
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveModule(item.key)}
                  title={item.label}
                  type="button"
                  className={`group relative grid h-9 w-9 place-items-center rounded-[10px] transition-all ${
                    active
                      ? 'bg-[rgba(38,194,129,0.13)] text-[var(--saas-primary)]'
                      : isDarkMode
                      ? 'text-white/35 hover:bg-white/[0.07] hover:text-white/75'
                      : 'text-black/35 hover:bg-black/[0.06] hover:text-black/75'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {active && <span className="absolute right-0.5 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--saas-primary)]" />}
                </button>
              )
            })}
          </nav>

          {/* Bottom */}
          <div className="mt-auto flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={handleToggleColorMode}
              disabled={themeModeSaving}
              title={currentTheme.darkMode ? 'Modo claro' : 'Modo escuro'}
              className={`grid h-9 w-9 place-items-center rounded-[10px] transition-all disabled:opacity-50 ${isDarkMode ? 'text-white/35 hover:bg-white/[0.07] hover:text-white/75' : 'text-black/35 hover:bg-black/[0.06] hover:text-black/75'}`}
            >
              {currentTheme.darkMode ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className={`grid h-9 w-9 place-items-center rounded-[10px] transition-all ${isDarkMode ? 'text-white/35 hover:bg-white/[0.07] hover:text-white/75' : 'text-black/35 hover:bg-black/[0.06] hover:text-black/75'}`}
            >
              <LogOut className="h-[17px] w-[17px]" />
            </button>
          </div>
        </aside>

        <main className="ml-[64px] min-w-0 flex-1 space-y-0 pb-0">
          {!showDashs ? (
          <header className={`border-b px-4 py-4 sm:px-6 sm:py-5 ${isDarkMode ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
            <div className="mx-auto max-w-screen-xl">
            {/* Page title row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className={`font-manrope text-[18px] font-bold tracking-[-0.03em] sm:text-[20px] ${isDarkMode ? 'text-white' : 'text-[#1c1c1e]'}`}>
                  {showOverview ? `Boas-vindas, ${currentUserName}` : currentModule.title}
                </h1>
                <p className={`mt-0.5 text-[12px] sm:text-[13px] ${isDarkMode ? 'text-white/45' : 'text-black/45'}`}>
                  {showOverview ? 'Consulte clientes, campanhas e métricas com IA.' : currentModule.description}
                </p>
              </div>
              {showWorkspaceControls ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`h-8 rounded-[8px] px-2.5 text-[12px] font-medium transition sm:h-9 sm:px-3 sm:text-[13px] ${isDarkMode ? 'border border-white/[0.08] bg-white/[0.05] text-white' : 'border border-black/[0.08] bg-black/[0.04] text-[#1c1c1e]'}`}
                    disabled={snapshot.clients.length === 0}
                    value={selectedClientId || selectedClient.id}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                  >
                    {snapshot.clients.length > 0 ? (
                      snapshot.clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))
                    ) : (
                      <option value="">Nenhum cliente</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={handleSyncSources}
                    disabled={syncing}
                    className={`h-8 rounded-[8px] px-3 text-[12px] font-medium transition sm:h-9 sm:px-4 sm:text-[13px] ${isDarkMode ? 'border border-white/[0.08] bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white' : 'border border-black/[0.08] bg-black/[0.04] text-black/60 hover:bg-black/[0.07] hover:text-black'}`}
                  >
                    {syncing ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClientForm((value) => !value)}
                    className="h-8 rounded-[8px] bg-[var(--saas-primary)] px-3 text-[12px] font-semibold text-white transition hover:opacity-90 sm:h-9 sm:px-4 sm:text-[13px]"
                  >
                    Novo cliente
                  </button>
                </div>
              ) : null}
            </div>
            {/* Positive metrics strip */}
            {showWorkspaceControls && positiveMetrics.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-5">
                {positiveMetrics.map((metric) => (
                  <div key={metric.label}>
                    <p className={`text-[10px] font-medium uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/35' : 'text-black/35'}`}>{metric.label}</p>
                    <p className={`mt-0.5 font-manrope text-[16px] font-bold tracking-[-0.02em] sm:text-[18px] ${isDarkMode ? 'text-white' : 'text-[#1c1c1e]'}`}>{formatValue(metric.value, metric.format)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {loadingClientContext ? (
              <p className={`mt-2 text-[12px] ${isDarkMode ? 'text-amber-400/70' : 'text-amber-600'}`}>
                Carregando contexto do cliente...
              </p>
            ) : null}
            </div>
          </header>
          ) : null}

          <div className="mx-auto max-w-screen-xl px-4 py-5 space-y-5 sm:px-6 sm:py-6">
          {showDashs ? (
          <section className="saas-legacy-dashboard-frame">
            <LegacyDashboardShell
              initialTab="apresentacao"
              initialActiveClientId={selectedClientId || selectedClient.id}
              initialClientsOverride={legacyDashboardClients}
              initialAppLogoUrl={currentTheme.logoUrl || ''}
              externalAppMode={currentTheme.darkMode ? 'dark' : 'light'}
              externalAppAccent={currentTheme.accentColor}
              externalAppBackground={currentTheme.backgroundColor}
              externalAppPanelColor={currentTheme.panelColor}
              externalAppTextColor={currentTheme.textColor}
            />
          </section>
          ) : null}

          {false && showDashs ? (
          <section className="space-y-6">
            <Card className="border-slate-200/70">
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--saas-primary)_28%,rgba(15,23,42,0.08))] bg-[color:color-mix(in_srgb,var(--saas-primary)_10%,white)] px-4 py-2 text-sm font-bold text-[var(--saas-primary)]">
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

            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <CardTitle>Resumo de resultados</CardTitle>
                    <CardDescription>Os indicadores abaixo consideram somente as campanhas enquadradas no filtro de resultado ativo.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h3 className="font-manrope text-xl font-extrabold text-slate-950">Mídia e distribuição</h3>
                  <p className="mt-1 text-sm text-slate-500">Visão geral do investimento e da entrega da campanha.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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

                          <div className="grid gap-3 sm:grid-cols-1">
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

            <Card className="xl:col-span-2">
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
          <section className="grid gap-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Clientes cadastrados</CardTitle>
                  <CardDescription>Clique em um cliente para editar conta Meta, Agendor ou modo manual do CRM.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {snapshot.clients.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {snapshot.clients.map((client) => (
                      <button
                        key={client.id}
                        className={`flex min-h-[132px] flex-col justify-between rounded-3xl border p-5 text-left transition ${
                          client.id === selectedClientId
                            ? 'border-[var(--saas-primary)] bg-[color:color-mix(in_srgb,var(--saas-primary)_9%,white)] text-slate-950 shadow-lg'
                            : 'border-slate-200/80 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                        onClick={() => openClientEditModal(client)}
                      >
                        <div>
                          <p className="font-semibold">{client.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{client.company}</p>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>{client.niche}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm leading-6 text-slate-500">
                    Nenhum cliente cadastrado ainda. Use “Novo cliente” para criar o primeiro dash com Meta e CRM.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          ) : null}

          {showRelatorios ? (
          <section>
            <ReportsTab clients={snapshot.clients} />
          </section>
          ) : null}
          </div>
        </main>
      </div>

      {showClientEditModal && editingClient ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8">
          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_40px_120px_rgba(15,23,42,0.28)] sm:rounded-[34px] sm:p-6">
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

            <div className="mt-6 grid max-h-[calc(100vh-10rem)] gap-5 overflow-y-auto pr-1">
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
                  Se preferir não conectar o Agendor, ative o modo manual para imputar oportunidades, qualificados, vendas, perdidos e faturamento direto no dash.
                </p>
                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editingClientUsesManualCrm}
                    onChange={(event) =>
                      setEditingClientForm((current) => ({
                        ...current,
                        crmMode: event.target.checked ? 'manual' : 'agendor',
                        agendorToken: event.target.checked ? '' : current.agendorToken,
                        agendorAccountIds: event.target.checked ? [] : current.agendorAccountIds,
                        agendorQualifiedStageIds: event.target.checked ? [] : current.agendorQualifiedStageIds,
                      }))
                    }
                  />
                  Este cliente não vai conectar o Agendor e usará dados comerciais manuais no dash
                </label>
                {editingClientUsesManualCrm ? (
                  <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-950">Modo manual ativo</p>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      O dashboard vai abrir normalmente e, ao final da seção comercial, mostrará um botão para imputar os números manualmente.
                    </p>
                  </div>
                ) : (
                <>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    API / Token do Agendor
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                        type="password"
                        value={editingClientForm.agendorToken}
                        onChange={(event) => {
                          const nextToken = event.target.value
                          setEditingClientForm((current) => ({ ...current, agendorToken: nextToken }))
                          setEditingAgendorError('')
                          setEditingAgendorOptions([])
                          setEditingAgendorStageOptions([])
                          editingAgendorFetchKeyRef.current = ''
                        }}
                        placeholder="Cole o token do Agendor"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => loadAgendorPipelines(editingClientForm.agendorToken, 'edit')}
                        disabled={editingAgendorLoading || !editingClientForm.agendorToken.trim()}
                        type="button"
                      >
                        {editingAgendorLoading ? 'Lendo...' : 'Ler pipelines'}
                      </Button>
                    </div>
                  </label>
                  <div className="grid gap-2 text-sm font-medium text-slate-600">
                    Pipelines do Agendor
                    {editingAgendorError ? (
                      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{editingAgendorError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {editingAgendorOptions.length > 0 ? (
                        editingAgendorOptions.map((pipeline) => (
                          <button
                            key={pipeline.id}
                            type="button"
                            onClick={() => togglePipelineOnEditingForm(pipeline.id)}
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              editingClientForm.agendorAccountIds.includes(pipeline.id)
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {pipeline.label}
                          </button>
                        ))
                      ) : editingSelectedPipelineLabels.length > 0 ? (
                        editingSelectedPipelineLabels.map((pipeline) => (
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
                        <p className="text-sm text-slate-500">Cole o token e clique em “Ler pipelines” para escolher os pipelines do dash.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm font-medium text-slate-600">
                  Etapas qualificadas do pipeline
                  <p className="text-sm leading-6 text-slate-500">
                    Selecione quais colunas do Agendor devem contar como qualificadas no funil e em todas as taxas do dash.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editingVisibleAgendorStages.length > 0 ? (
                      editingVisibleAgendorStages.map((stage) => (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => toggleQualifiedStageOnEditingForm(stage.id)}
                          className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                            editingClientForm.agendorQualifiedStageIds.includes(stage.id)
                              ? 'border-[color:color-mix(in_srgb,var(--saas-primary)_34%,rgba(15,23,42,0.08))] bg-[color:color-mix(in_srgb,var(--saas-primary)_10%,white)] text-[color:color-mix(in_srgb,var(--saas-primary)_72%,#0f172a)]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {stage.label}
                        </button>
                      ))
                    ) : editingSelectedQualifiedStageLabels.length > 0 ? (
                      editingSelectedQualifiedStageLabels.map((stage) => (
                        <span key={stage} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          {stage}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Escolha os pipelines acima para listar as colunas disponíveis para qualificação.</p>
                    )}
                  </div>
                </div>
                </>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:justify-end">
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8">
          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/80 bg-white p-4 shadow-[0_40px_120px_rgba(15,23,42,0.28)] sm:rounded-[34px] sm:p-6">
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

            <div className="mt-6 grid max-h-[calc(100vh-10rem)] gap-4 overflow-y-auto pr-1">
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
                  Se preferir não conectar o Agendor, ative o modo manual para imputar oportunidades, qualificados, vendas, perdidos e faturamento direto no dash.
                </p>
                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={clientUsesManualCrm}
                    onChange={(event) =>
                      setClientForm((current) => ({
                        ...current,
                        crmMode: event.target.checked ? 'manual' : 'agendor',
                        agendorToken: event.target.checked ? '' : current.agendorToken,
                        agendorAccountIds: event.target.checked ? [] : current.agendorAccountIds,
                        agendorQualifiedStageIds: event.target.checked ? [] : current.agendorQualifiedStageIds,
                      }))
                    }
                  />
                  Este cliente não vai conectar o Agendor e usará dados comerciais manuais no dash
                </label>
                {clientUsesManualCrm ? (
                  <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-950">Modo manual ativo</p>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      O dashboard vai abrir normalmente e, ao final da seção comercial, mostrará um botão para imputar os números manualmente.
                    </p>
                  </div>
                ) : (
                <>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-600">
                    API / Token do Agendor
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                        type="password"
                        value={clientForm.agendorToken}
                        onChange={(event) => {
                          const nextToken = event.target.value
                          setClientForm((current) => ({ ...current, agendorToken: nextToken }))
                          setClientAgendorError('')
                          setClientAgendorOptions([])
                          setClientAgendorStageOptions([])
                          clientAgendorFetchKeyRef.current = ''
                        }}
                        placeholder="Token do Agendor"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => loadAgendorPipelines(clientForm.agendorToken, 'create')}
                        disabled={clientAgendorLoading || !clientForm.agendorToken.trim()}
                        type="button"
                      >
                        {clientAgendorLoading ? 'Lendo...' : 'Ler pipelines'}
                      </Button>
                    </div>
                  </label>
                  <div className="grid gap-2 text-sm font-medium text-slate-600">
                    Pipelines do Agendor
                    {clientAgendorError ? (
                      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{clientAgendorError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {clientAgendorOptions.length > 0 ? (
                        clientAgendorOptions.map((pipeline) => (
                          <button
                            key={pipeline.id}
                            type="button"
                            onClick={() => togglePipelineOnClientForm(pipeline.id)}
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              clientForm.agendorAccountIds.includes(pipeline.id)
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {pipeline.label}
                          </button>
                        ))
                      ) : clientSelectedPipelineLabels.length > 0 ? (
                        clientSelectedPipelineLabels.map((pipeline) => (
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
                        <p className="text-sm text-slate-500">Cole o token e clique em “Ler pipelines” para escolher os pipelines do dash.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm font-medium text-slate-600">
                  Etapas qualificadas do pipeline
                  <p className="text-sm leading-6 text-slate-500">
                    Marque as colunas que devem ser consideradas qualificadas no funil, nas taxas e nos cards comerciais.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clientVisibleAgendorStages.length > 0 ? (
                      clientVisibleAgendorStages.map((stage) => (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => toggleQualifiedStageOnClientForm(stage.id)}
                          className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                            clientForm.agendorQualifiedStageIds.includes(stage.id)
                              ? 'border-[color:color-mix(in_srgb,var(--saas-primary)_34%,rgba(15,23,42,0.08))] bg-[color:color-mix(in_srgb,var(--saas-primary)_10%,white)] text-[color:color-mix(in_srgb,var(--saas-primary)_72%,#0f172a)]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {stage.label}
                        </button>
                      ))
                    ) : clientSelectedQualifiedStageLabels.length > 0 ? (
                      clientSelectedQualifiedStageLabels.map((stage) => (
                        <span key={stage} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          {stage}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Selecione os pipelines acima para escolher quais colunas entram como qualificados.</p>
                    )}
                  </div>
                </div>
                </>
                )}
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
