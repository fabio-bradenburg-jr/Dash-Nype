'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@/lib/contexts/UserContext'
import { createClient } from '@/lib/supabase/client'
import {
  createClientRecord,
  createDashboardTemplate,
  DEFAULT_INTEGRATIONS,
  loadDashboardPreferences,
  saveDashboardPreferences,
} from '@/lib/dashboard-storage'
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  buildMetaSummaryFromCampaigns,
  campaignMatchesMetaResultFilters,
  extractMetaCampaignMetrics,
  getAvailableMetaResultFilters,
  normalizeMetaResultFilters,
} from '@/lib/meta-metrics'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
)

const THEMES = {
  blue: { main: '#3b82f6', glow: 'rgba(59, 130, 246, 0.18)', surface: 'rgba(59, 130, 246, 0.10)' },
  emerald: { main: '#10b981', glow: 'rgba(16, 185, 129, 0.18)', surface: 'rgba(16, 185, 129, 0.10)' },
  orange: { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.18)', surface: 'rgba(245, 158, 11, 0.10)' },
  rose: { main: '#f43f5e', glow: 'rgba(244, 63, 94, 0.18)', surface: 'rgba(244, 63, 94, 0.10)' },
  slate: { main: '#38bdf8', glow: 'rgba(56, 189, 248, 0.18)', surface: 'rgba(56, 189, 248, 0.10)' },
}

const METRIC_OPTIONS = {
  spend: { label: 'Investimento', type: 'currency' },
  impressions: { label: 'Impressões', type: 'number' },
  clicks: { label: 'Cliques', type: 'number' },
  cpc: { label: 'CPC', type: 'currency' },
  ctr: { label: 'CTR', type: 'percent' },
  purchases: { label: 'Compras', type: 'number' },
  leads: { label: 'Leads', type: 'number' },
  messages: { label: 'Mensagens', type: 'number' },
  cpa: { label: 'CPA', type: 'currency' },
  roas: { label: 'ROAS', type: 'multiplier' },
}

const DATE_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'maximum', label: 'Todo o histórico' },
  { value: 'custom', label: 'Período personalizado' },
]

const CLIENT_INTEGRATION_GROUPS = [
  {
    title: 'Google Ads',
    icon: 'bxl-google',
    accent: '#ea4335',
    description: 'Selecione a conta Google Ads referente a este cliente.',
    fields: [
      { name: 'googleAdsAccountId', label: 'Conta Google Ads do cliente', placeholder: '123-456-7890', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'TikTok Ads',
    icon: 'bxl-tiktok',
    accent: '#ff0050',
    description: 'Selecione a conta TikTok Ads que deve compor o dashboard deste cliente.',
    fields: [
      { name: 'tiktokAdsAccountId', label: 'Conta TikTok Ads do cliente', placeholder: '987654321', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'LinkedIn Ads',
    icon: 'bxl-linkedin-square',
    accent: '#0a66c2',
    description: 'Selecione a conta LinkedIn Ads usada por este cliente.',
    fields: [
      { name: 'linkedInAdsAccountId', label: 'Conta LinkedIn Ads do cliente', placeholder: 'urn:li:sponsoredAccount:123', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'RD Station',
    icon: 'bx-signal-5',
    accent: '#14b8a6',
    description: 'Separe a operação de automação e CRM do RD Station por cliente.',
    fields: [
      { name: 'rdStationToken', label: 'Chave / credencial', placeholder: 'Token do RD Station', storage: 'integrations', type: 'password' },
      { name: 'rdStationAccountId', label: 'Conta / pipeline do cliente', placeholder: 'Conta, funil ou ID do RD', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Salesforce',
    icon: 'bx-cloud',
    accent: '#60a5fa',
    description: 'Mapeie a conta do Salesforce usada na jornada desse cliente.',
    fields: [
      { name: 'salesforceToken', label: 'Chave / credencial', placeholder: 'Token ou access token', storage: 'integrations', type: 'password' },
      { name: 'salesforceAccountId', label: 'Conta / org do cliente', placeholder: 'Org ID, pipeline ou referência', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Agendor',
    icon: 'bx-briefcase-alt-2',
    accent: '#f97316',
    description: 'Deixe o Agendor separado para consultar a origem comercial correta.',
    fields: [
      { name: 'agendorToken', label: 'Chave / credencial', placeholder: 'Token do Agendor', storage: 'integrations', type: 'password' },
      { name: 'agendorAccountId', label: 'Conta / pipeline do cliente', placeholder: 'Pipeline, funil ou ID da conta', storage: 'client', type: 'text' },
    ],
  },
]

const GLOBAL_INTEGRATION_GROUPS = [
  {
    title: 'Meta Ads',
    icon: 'bxl-meta',
    accent: '#0668E1',
    description: 'Chave principal da operação para listar contas e puxar dados da Meta.',
    field: { name: 'metaAccessToken', label: 'Chave da API da Meta', placeholder: 'EAABsbCS1...' },
  },
  {
    title: 'Google Ads',
    icon: 'bxl-google',
    accent: '#ea4335',
    description: 'Credencial global da operação para futuras conexões e listagem de contas.',
    field: { name: 'googleAdsToken', label: 'Token / credencial do Google Ads', placeholder: 'Developer token ou OAuth' },
  },
  {
    title: 'TikTok Ads',
    icon: 'bxl-tiktok',
    accent: '#ff0050',
    description: 'Credencial global da operação para conectar e gerenciar contas do TikTok Ads.',
    field: { name: 'tiktokAdsToken', label: 'Token / credencial do TikTok Ads', placeholder: 'tt_...' },
  },
  {
    title: 'LinkedIn Ads',
    icon: 'bxl-linkedin-square',
    accent: '#0a66c2',
    description: 'Credencial global da operação para trabalhar com contas do LinkedIn Ads.',
    field: { name: 'linkedinAdsToken', label: 'Token OAuth 2.0 do LinkedIn Ads', placeholder: 'AQV...' },
  },
]

const META_TEMPLATE_METRIC_OPTIONS = {
  reach: {
    label: 'Alcance',
    type: 'number',
    icon: 'bx-radar',
    tone: 'blue',
    description: 'Pessoas alcançadas no período filtrado.',
  },
  cpm: {
    label: 'CPM',
    type: 'currency',
    icon: 'bx-bar-chart-alt-2',
    tone: 'purple',
    description: 'Custo por mil impressões.',
  },
  frequency: {
    label: 'Frequência',
    type: 'decimal',
    icon: 'bx-repeat',
    tone: 'gold',
    description: 'Média de exibições por pessoa alcançada.',
  },
  conversionRate: {
    label: 'Taxa de conversão',
    type: 'percent',
    icon: 'bx-git-compare',
    tone: 'emerald',
    description: 'Conversões totais divididas pelos cliques.',
  },
  averageTicket: {
    label: 'Ticket médio',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'orange',
    description: 'Faturamento atribuído dividido pelas compras.',
  },
  purchaseValue: {
    label: 'Faturamento atribuído',
    type: 'currency',
    icon: 'bx-money',
    tone: 'emerald',
    description: 'Valor total das compras atribuídas no período.',
  },
  purchases: {
    label: 'Compras',
    type: 'number',
    icon: 'bx-cart',
    tone: 'emerald',
    description: 'Total de compras atribuídas no período.',
  },
  costPerPurchase: {
    label: 'Custo por compra',
    type: 'currency',
    icon: 'bx-receipt',
    tone: 'gold',
    description: 'Investimento dividido pelas compras atribuídas.',
  },
  leads: {
    label: 'Leads',
    type: 'number',
    icon: 'bx-user-plus',
    tone: 'cyan',
    description: 'Cadastros gerados nas campanhas filtradas.',
  },
  costPerLead: {
    label: 'Custo por lead',
    type: 'currency',
    icon: 'bx-purchase-tag',
    tone: 'orange',
    description: 'Investimento dividido pelos leads gerados.',
  },
  messages: {
    label: 'Mensagens iniciadas',
    type: 'number',
    icon: 'bx-chat',
    tone: 'blue',
    description: 'Conversas iniciadas em canais de mensagem.',
  },
  costPerMessage: {
    label: 'Custo por mensagem',
    type: 'currency',
    icon: 'bx-message-square-dots',
    tone: 'pink',
    description: 'Investimento dividido pelas mensagens iniciadas.',
  },
  clicksWithoutConversion: {
    label: 'Cliques sem conversão',
    type: 'number',
    icon: 'bx-pointer',
    tone: 'purple',
    description: 'Cliques que não viraram compra, lead ou mensagem.',
  },
  roas: {
    label: 'ROAS consolidado',
    type: 'multiplier',
    icon: 'bx-line-chart',
    tone: 'blue',
    description: 'Retorno sobre investimento da leitura filtrada.',
  },
}

const RD_TEMPLATE_METRIC_OPTIONS = {
  contacts: {
    label: 'Leads totais',
    type: 'number',
    icon: 'bx-user',
    tone: 'blue',
    description: 'Contatos totais retornados pelo RD.',
  },
  contactsInPeriod: {
    label: 'Leads criados no período',
    type: 'number',
    icon: 'bx-calendar',
    tone: 'cyan',
    description: 'Contatos que entraram na base dentro do período.',
  },
  contactsMoved: {
    label: 'Leads movimentados',
    type: 'number',
    icon: 'bx-transfer',
    tone: 'purple',
    description: 'Contatos que avançaram em alguma etapa comercial.',
  },
  qualifiedDeals: {
    label: 'Negócios qualificados',
    type: 'number',
    icon: 'bx-filter-alt',
    tone: 'emerald',
    description: 'Total de negócios que passaram pelas etapas qualificadas.',
  },
  qualifiedContacts: {
    label: 'Contatos qualificados',
    type: 'number',
    icon: 'bx-check-shield',
    tone: 'emerald',
    description: 'Contatos que chegaram em etapas qualificadas.',
  },
  closeRate: {
    label: 'Taxa de fechamento',
    type: 'percent',
    icon: 'bx-badge-check',
    tone: 'emerald',
    description: 'Percentual de negócios fechados com ganho.',
  },
  dealToWonRate: {
    label: 'Taxa de negócio para venda',
    type: 'percent',
    icon: 'bx-line-chart',
    tone: 'blue',
    description: 'Conversão de negócios em vendas.',
  },
  leadToDealRate: {
    label: 'Taxa de lead para negócio',
    type: 'percent',
    icon: 'bx-trending-up',
    tone: 'cyan',
    description: 'Percentual de leads que viraram negócio.',
  },
  sourceConversionRate: {
    label: 'Conversão por origem',
    type: 'percent',
    icon: 'bx-git-branch',
    tone: 'gold',
    description: 'Conversão média da origem filtrada.',
  },
  avgLeadToWonDays: {
    label: 'Tempo médio lead -> venda',
    type: 'duration',
    icon: 'bx-time-five',
    tone: 'orange',
    description: 'Tempo médio total entre entrada do lead e venda.',
  },
  avgDealToWonDays: {
    label: 'Tempo médio negócio -> venda',
    type: 'duration',
    icon: 'bx-timer',
    tone: 'orange',
    description: 'Tempo médio entre criação do negócio e venda.',
  },
  avgLeadToWonDaysFiltered: {
    label: 'Tempo médio lead -> venda (filtro)',
    type: 'duration',
    icon: 'bx-time',
    tone: 'pink',
    description: 'Tempo médio considerando o filtro atual.',
  },
  avgDealToWonDaysFiltered: {
    label: 'Tempo médio negócio -> venda (filtro)',
    type: 'duration',
    icon: 'bx-stopwatch',
    tone: 'pink',
    description: 'Tempo médio por venda dentro do filtro atual.',
  },
  contactsWithDeals: {
    label: 'Contatos com negócio',
    type: 'number',
    icon: 'bx-briefcase-alt',
    tone: 'blue',
    description: 'Quantidade de contatos que geraram negócios.',
  },
  contactsWithWonDeals: {
    label: 'Contatos com venda',
    type: 'number',
    icon: 'bx-trophy',
    tone: 'emerald',
    description: 'Quantidade de contatos com venda ganha.',
  },
  lostContacts: {
    label: 'Contatos perdidos',
    type: 'number',
    icon: 'bx-x-circle',
    tone: 'pink',
    description: 'Contatos marcados como perda na operação.',
  },
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}%`
}

function formatMultiplier(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}x`
}

function formatDurationDays(value) {
  const days = Number(value || 0)
  if (!days) return 'Sem base'
  if (days < 1) return 'Menos de 1 dia'
  return `${days.toFixed(1).replace('.', ',')} dias`
}

function formatMetricValue(value, metricKey) {
  const type = METRIC_OPTIONS[metricKey]?.type
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(value)
  if (type === 'multiplier') return formatMultiplier(value)
  return formatNumber(value)
}

function formatDashboardMetricValue(value, type) {
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(value)
  if (type === 'multiplier') return formatMultiplier(value)
  if (type === 'decimal') return Number(value || 0).toFixed(2).replace('.', ',')
  if (type === 'duration') return formatDurationDays(value)
  return formatNumber(value)
}

function formatChartAxis(value, metricKey) {
  const type = METRIC_OPTIONS[metricKey]?.type

  if (type === 'currency') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(value || 0))
  }

  if (type === 'percent') return `${Number(value || 0).toFixed(1).replace('.', ',')}%`
  if (type === 'multiplier') return `${Number(value || 0).toFixed(1).replace('.', ',')}x`

  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function haveSameSelection(left = [], right = []) {
  if (left.length !== right.length) return false

  const leftSet = new Set(left)
  return right.every((item) => leftSet.has(item))
}

function cloneDashboardTemplates(templates = []) {
  return templates.map((template) => ({
    ...template,
    metaMetricKeys: Array.isArray(template?.metaMetricKeys) ? [...template.metaMetricKeys] : [],
    rdMetricKeys: Array.isArray(template?.rdMetricKeys) ? [...template.rdMetricKeys] : [],
  }))
}

function haveSameDashboardTemplates(left = [], right = []) {
  if (left.length !== right.length) return false

  return left.every((leftTemplate, index) => {
    const rightTemplate = right[index]
    if (!rightTemplate) return false

    return (
      leftTemplate.id === rightTemplate.id &&
      leftTemplate.name === rightTemplate.name &&
      haveSameSelection(leftTemplate.metaMetricKeys || [], rightTemplate.metaMetricKeys || []) &&
      haveSameSelection(leftTemplate.rdMetricKeys || [], rightTemplate.rdMetricKeys || [])
    )
  })
}

function getMetricData(metricKey, dayData) {
  switch (metricKey) {
    case 'spend':
      return parseFloat(dayData.spend || 0)
    case 'impressions':
      return parseInt(dayData.impressions || 0, 10)
    case 'clicks':
      return parseInt(dayData.clicks || 0, 10)
    case 'cpc':
      return parseFloat(dayData.cpc || 0)
    case 'ctr':
      return parseFloat(dayData.ctr || 0)
    case 'purchases':
      return parseInt(dayData.custom_metrics?.purchases || 0, 10)
    case 'leads':
      return parseInt(dayData.custom_metrics?.leads || 0, 10)
    case 'messages':
      return parseInt(dayData.custom_metrics?.messages || 0, 10)
    case 'cpa':
      return parseFloat(dayData.custom_metrics?.cpa || 0)
    case 'roas':
      return parseFloat(dayData.custom_metrics?.roas || 0)
    default:
      return 0
  }
}

function getSummaryMetricValue(metricKey, summary, customMetrics) {
  switch (metricKey) {
    case 'spend':
      return parseFloat(summary?.spend || 0)
    case 'impressions':
      return parseInt(summary?.impressions || 0, 10)
    case 'clicks':
      return parseInt(summary?.clicks || 0, 10)
    case 'cpc':
      return parseFloat(summary?.cpc || 0)
    case 'ctr':
      return parseFloat(summary?.ctr || 0)
    case 'purchases':
      return parseInt(customMetrics?.purchases || 0, 10)
    case 'leads':
      return parseInt(customMetrics?.leads || 0, 10)
    case 'messages':
      return parseInt(customMetrics?.messages || 0, 10)
    case 'cpa':
      return parseFloat(customMetrics?.cpa || 0)
    case 'roas':
      return parseFloat(customMetrics?.roas || 0)
    default:
      return 0
  }
}

export default function DashboardPage() {
  const { user, profile, access, loading: userLoading } = useUser()
  const supabase = createClient()
  const dashboardRef = useRef(null)
  const campaignsRef = useRef([])
  const lastMetaStructureFetchKeyRef = useRef('')
  const lastDashboardFetchKeyRef = useRef('')
  const lastBreakdownsFetchKeyRef = useRef('')
  const selectedQualifiedStagesRef = useRef([])
  const rdLeadSourceFiltersRef = useRef([])
  const metaFilteredCampaignIdsRef = useRef([])
  const metaFilteredAdsetIdsRef = useRef([])
  const metaFilteredAdIdsRef = useRef([])

  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [activeTab, setActiveTab] = useState('apresentacao')
  const [dateRange, setDateRange] = useState('last_7d')
  const [draftDateRange, setDraftDateRange] = useState('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [draftCustomSince, setDraftCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [draftCustomUntil, setDraftCustomUntil] = useState('')
  const [themeColor, setThemeColor] = useState('blue')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [metric1, setMetric1] = useState('spend')
  const [metric2, setMetric2] = useState('roas')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ACTIVE')
  const [campaignSortBy, setCampaignSortBy] = useState('spend')
  const [metaResultFilters, setMetaResultFilters] = useState([])
  const [draftMetaResultFilters, setDraftMetaResultFilters] = useState([])
  const [metaCampaignFilters, setMetaCampaignFilters] = useState([])
  const [draftMetaCampaignFilters, setDraftMetaCampaignFilters] = useState([])
  const [metaAdsetFilters, setMetaAdsetFilters] = useState([])
  const [draftMetaAdsetFilters, setDraftMetaAdsetFilters] = useState([])
  const [metaAdFilters, setMetaAdFilters] = useState([])
  const [draftMetaAdFilters, setDraftMetaAdFilters] = useState([])
  const [isMetaCampaignFilterOpen, setIsMetaCampaignFilterOpen] = useState(false)
  const [isMetaAdsetFilterOpen, setIsMetaAdsetFilterOpen] = useState(false)
  const [isMetaAdFilterOpen, setIsMetaAdFilterOpen] = useState(false)
  const [isRdDiagnosticsOpen, setIsRdDiagnosticsOpen] = useState(false)
  const [isRdSourceFilterOpen, setIsRdSourceFilterOpen] = useState(false)
  const [clients, setClients] = useState([])
  const [activeClientId, setActiveClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [adAccounts, setAdAccounts] = useState([])
  const [insights, setInsights] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [metaHierarchy, setMetaHierarchy] = useState([])
  const [breakdowns, setBreakdowns] = useState({ ages: [], cities: [], creatives: [] })
  const [isRankingsLoading, setIsRankingsLoading] = useState(false)
  const [rankingsError, setRankingsError] = useState('')
  const [rdSummary, setRdSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMetaStructureReady, setIsMetaStructureReady] = useState(false)
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [hasSyncedServerState, setHasSyncedServerState] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dragMetricKey, setDragMetricKey] = useState('')
  const [dragSourceIndex, setDragSourceIndex] = useState(null)
  const [rdSellerFilter, setRdSellerFilter] = useState('all')
  const [draftRdSellerFilter, setDraftRdSellerFilter] = useState('all')
  const [rdLeadSourceFilters, setRdLeadSourceFilters] = useState([])
  const [draftRdLeadSourceFilters, setDraftRdLeadSourceFilters] = useState([])
  const [draftFunnelSteps, setDraftFunnelSteps] = useState([])
  const [draftDashboardTemplates, setDraftDashboardTemplates] = useState([])
  const [draftDashboardTemplateId, setDraftDashboardTemplateId] = useState('')
  const [isMetaMetricLibraryOpen, setIsMetaMetricLibraryOpen] = useState(false)
  const [isRdMetricLibraryOpen, setIsRdMetricLibraryOpen] = useState(false)
  const [isQualifiedStagesVisible, setIsQualifiedStagesVisible] = useState(false)
  const [usersList, setUsersList] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'visualizador',
    clientIds: [],
  })
  const [savingUser, setSavingUser] = useState(false)
  const [globalIntegrations, setGlobalIntegrations] = useState({
    metaAccessToken: '',
    googleAdsToken: '',
    tiktokAdsToken: '',
    linkedinAdsToken: '',
  })

  const currentTheme = THEMES[themeColor] || THEMES.blue
  const role = access?.role || profile?.role || 'visualizador'
  const canManageUsers = Boolean(access?.canManageUsers)
  const canManageClients = Boolean(access?.canManageClients)
  const canViewDashboard = access?.canViewDashboard !== false
  const isMaster = role === 'master'
  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) || null,
    [clients, activeClientId]
  )
  const activeDashboardTemplates = useMemo(
    () => (Array.isArray(activeClient?.dashboardTemplates) ? activeClient.dashboardTemplates : []),
    [activeClient]
  )
  const activeDashboardTemplate = useMemo(() => {
    if (!activeDashboardTemplates.length) return null
    return (
      activeDashboardTemplates.find((template) => template.id === activeClient?.activeDashboardTemplateId) ||
      activeDashboardTemplates[0]
    )
  }, [activeDashboardTemplates, activeClient])
  const activeDraftDashboardTemplates = useMemo(
    () => (Array.isArray(draftDashboardTemplates) ? draftDashboardTemplates : []),
    [draftDashboardTemplates]
  )
  const activeDraftDashboardTemplate = useMemo(() => {
    if (!activeDraftDashboardTemplates.length) return null
    return (
      activeDraftDashboardTemplates.find((template) => template.id === draftDashboardTemplateId) ||
      activeDraftDashboardTemplates[0]
    )
  }, [activeDraftDashboardTemplates, draftDashboardTemplateId])
  const selectedManagedUser = useMemo(
    () => usersList.find((managedUser) => managedUser.id === selectedUserId) || null,
    [usersList, selectedUserId]
  )
  const activeIntegrations = activeClient?.integrations || DEFAULT_INTEGRATIONS
  const selectedAdAccount = activeClient?.metaAdAccountId || ''
  const selectedQualifiedStages = useMemo(
    () => activeClient?.rdQualifiedStages || [],
    [activeClient]
  )
  const selectedQualifiedStagesKey = useMemo(
    () => JSON.stringify([...selectedQualifiedStages].sort()),
    [selectedQualifiedStages]
  )
  const hasMetaConfigured = Boolean(selectedAdAccount && globalIntegrations.metaAccessToken)
  const hasRdConfigured = Boolean(activeIntegrations.rdStationToken)
  const hasAnyPresentationData = hasMetaConfigured || hasRdConfigured
  const activeDashboardTemplateId = activeDashboardTemplate?.id || activeDashboardTemplates[0]?.id || ''
  const activeMetaDashboardMetricKeys = useMemo(
    () => (Array.isArray(activeDashboardTemplate?.metaMetricKeys) ? activeDashboardTemplate.metaMetricKeys : []),
    [activeDashboardTemplate]
  )
  const activeRdDashboardMetricKeys = useMemo(
    () => (Array.isArray(activeDashboardTemplate?.rdMetricKeys) ? activeDashboardTemplate.rdMetricKeys : []),
    [activeDashboardTemplate]
  )
  const activeDraftDashboardTemplateId = activeDraftDashboardTemplate?.id || activeDraftDashboardTemplates[0]?.id || ''
  const draftMetaDashboardMetricKeys = useMemo(
    () => (Array.isArray(activeDraftDashboardTemplate?.metaMetricKeys) ? activeDraftDashboardTemplate.metaMetricKeys : []),
    [activeDraftDashboardTemplate]
  )
  const draftRdDashboardMetricKeys = useMemo(
    () => (Array.isArray(activeDraftDashboardTemplate?.rdMetricKeys) ? activeDraftDashboardTemplate.rdMetricKeys : []),
    [activeDraftDashboardTemplate]
  )
  const activeFunnelSteps = useMemo(
    () => activeClient?.funnelSteps || [],
    [activeClient]
  )
  const activeDraftFunnelSteps = useMemo(
    () => (Array.isArray(draftFunnelSteps) ? draftFunnelSteps : []),
    [draftFunnelSteps]
  )
  const availableMetaResultFilters = useMemo(
    () => getAvailableMetaResultFilters(campaigns),
    [campaigns]
  )
  const availableMetaCampaignOptions = useMemo(() => {
    const campaignsWithSpendMap = new Map(
      campaigns
        .filter((campaign) => campaign?.id && Number(campaign.spend || 0) > 0)
        .map((campaign) => [
          campaign.id,
          {
            id: campaign.id,
            name: campaign.name || 'Campanha sem nome',
          },
        ])
    )
    const hierarchyCampaignMap = new Map()

    metaHierarchy.forEach((item) => {
      if (!item?.campaignId || !campaignsWithSpendMap.has(item.campaignId)) return
      if (!hierarchyCampaignMap.has(item.campaignId)) {
        hierarchyCampaignMap.set(item.campaignId, {
          id: item.campaignId,
          name: item.campaignName || 'Campanha sem nome',
        })
      }
    })

    const hierarchyOptions = Array.from(hierarchyCampaignMap.values())

    if (hierarchyOptions.length > 0) {
      return hierarchyOptions.sort((campaignA, campaignB) =>
        campaignA.name.localeCompare(campaignB.name, 'pt-BR')
      )
    }

    return Array.from(campaignsWithSpendMap.values())
      .sort((campaignA, campaignB) => campaignA.name.localeCompare(campaignB.name, 'pt-BR'))
  }, [campaigns, metaHierarchy])
  const activeRdLeadSources = useMemo(() => {
    const sources = rdSummary?.availableSources || []
    if (!sources.length) return []
    if (!rdLeadSourceFilters.length) return sources
    const normalizedFilters = rdLeadSourceFilters.filter((source) => sources.includes(source))
    return normalizedFilters.length > 0 ? normalizedFilters : sources
  }, [rdSummary, rdLeadSourceFilters])
  const rdLeadSourceFiltersKey = useMemo(
    () => JSON.stringify([...rdLeadSourceFilters].sort()),
    [rdLeadSourceFilters]
  )
  const activeDraftRdLeadSources = useMemo(() => {
    const sources = rdSummary?.availableSources || []
    if (!sources.length) return []
    if (!draftRdLeadSourceFilters.length) return sources
    const normalizedFilters = draftRdLeadSourceFilters.filter((source) => sources.includes(source))
    return normalizedFilters.length > 0 ? normalizedFilters : sources
  }, [rdSummary, draftRdLeadSourceFilters])
  const normalizedMetaResultFilters = useMemo(
    () => normalizeMetaResultFilters(metaResultFilters, availableMetaResultFilters.map((item) => item.key)),
    [metaResultFilters, availableMetaResultFilters]
  )
  const normalizedDraftMetaResultFilters = useMemo(
    () => normalizeMetaResultFilters(draftMetaResultFilters, availableMetaResultFilters.map((item) => item.key)),
    [draftMetaResultFilters, availableMetaResultFilters]
  )
  const activeMetaCampaignIds = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)

    if (!availableIds.length) return []
    if (!metaCampaignFilters.length) return availableIds

    const normalizedSelection = metaCampaignFilters.filter((campaignId) => availableIds.includes(campaignId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaCampaignFilters, availableMetaCampaignOptions])
  const activeDraftMetaCampaignIds = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)

    if (!availableIds.length) return []
    if (!draftMetaCampaignFilters.length) return availableIds

    const normalizedSelection = draftMetaCampaignFilters.filter((campaignId) => availableIds.includes(campaignId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaCampaignFilters, availableMetaCampaignOptions])
  const metaFilteredCampaignIds = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaignMatchesMetaResultFilters(campaign, normalizedMetaResultFilters, availableMetaResultFilters.map((item) => item.key)))
        .filter((campaign) => activeMetaCampaignIds.length === 0 || activeMetaCampaignIds.includes(campaign.id))
        .map((campaign) => campaign.id)
        .filter(Boolean),
    [campaigns, normalizedMetaResultFilters, availableMetaResultFilters, activeMetaCampaignIds]
  )
  const metaFilteredCampaignIdsKey = useMemo(
    () => JSON.stringify(metaFilteredCampaignIds),
    [metaFilteredCampaignIds]
  )
  const draftMetaFilteredCampaignIds = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaignMatchesMetaResultFilters(campaign, normalizedDraftMetaResultFilters, availableMetaResultFilters.map((item) => item.key)))
        .filter((campaign) => activeDraftMetaCampaignIds.length === 0 || activeDraftMetaCampaignIds.includes(campaign.id))
        .map((campaign) => campaign.id)
        .filter(Boolean),
    [campaigns, normalizedDraftMetaResultFilters, availableMetaResultFilters, activeDraftMetaCampaignIds]
  )
  const availableMetaAdsetOptions = useMemo(() => {
    const adsetMap = new Map()

    metaHierarchy
      .filter((item) => metaFilteredCampaignIds.length === 0 || metaFilteredCampaignIds.includes(item.campaignId))
      .forEach((item) => {
        if (!item.adsetId) return
        if (!adsetMap.has(item.adsetId)) {
          adsetMap.set(item.adsetId, {
            id: item.adsetId,
            name: item.adsetName || 'Conjunto sem nome',
          })
        }
      })

    return Array.from(adsetMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, metaFilteredCampaignIds])
  const draftAvailableMetaAdsetOptions = useMemo(() => {
    const adsetMap = new Map()

    metaHierarchy
      .filter((item) => draftMetaFilteredCampaignIds.length === 0 || draftMetaFilteredCampaignIds.includes(item.campaignId))
      .forEach((item) => {
        if (!item.adsetId) return
        if (!adsetMap.has(item.adsetId)) {
          adsetMap.set(item.adsetId, {
            id: item.adsetId,
            name: item.adsetName || 'Conjunto sem nome',
          })
        }
      })

    return Array.from(adsetMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, draftMetaFilteredCampaignIds])
  const activeMetaAdsetIds = useMemo(() => {
    const availableIds = availableMetaAdsetOptions.map((adset) => adset.id)

    if (!availableIds.length) return []
    if (!metaAdsetFilters.length) return availableIds

    const normalizedSelection = metaAdsetFilters.filter((adsetId) => availableIds.includes(adsetId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaAdsetFilters, availableMetaAdsetOptions])
  const activeDraftMetaAdsetIds = useMemo(() => {
    const availableIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)

    if (!availableIds.length) return []
    if (!draftMetaAdsetFilters.length) return availableIds

    const normalizedSelection = draftMetaAdsetFilters.filter((adsetId) => availableIds.includes(adsetId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaAdsetFilters, draftAvailableMetaAdsetOptions])
  const availableMetaAdOptions = useMemo(() => {
    const adMap = new Map()

    metaHierarchy
      .filter((item) => metaFilteredCampaignIds.length === 0 || metaFilteredCampaignIds.includes(item.campaignId))
      .filter((item) => activeMetaAdsetIds.length === 0 || activeMetaAdsetIds.includes(item.adsetId))
      .forEach((item) => {
        if (!item.adId) return
        if (!adMap.has(item.adId)) {
          adMap.set(item.adId, {
            id: item.adId,
            name: item.adName || 'Anúncio sem nome',
          })
        }
      })

    return Array.from(adMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, metaFilteredCampaignIds, activeMetaAdsetIds])
  const draftAvailableMetaAdOptions = useMemo(() => {
    const adMap = new Map()

    metaHierarchy
      .filter((item) => draftMetaFilteredCampaignIds.length === 0 || draftMetaFilteredCampaignIds.includes(item.campaignId))
      .filter((item) => activeDraftMetaAdsetIds.length === 0 || activeDraftMetaAdsetIds.includes(item.adsetId))
      .forEach((item) => {
        if (!item.adId) return
        if (!adMap.has(item.adId)) {
          adMap.set(item.adId, {
            id: item.adId,
            name: item.adName || 'Anúncio sem nome',
          })
        }
      })

    return Array.from(adMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [metaHierarchy, draftMetaFilteredCampaignIds, activeDraftMetaAdsetIds])
  const activeMetaAdIds = useMemo(() => {
    const availableIds = availableMetaAdOptions.map((ad) => ad.id)

    if (!availableIds.length) return []
    if (!metaAdFilters.length) return availableIds

    const normalizedSelection = metaAdFilters.filter((adId) => availableIds.includes(adId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [metaAdFilters, availableMetaAdOptions])
  const activeDraftMetaAdIds = useMemo(() => {
    const availableIds = draftAvailableMetaAdOptions.map((ad) => ad.id)

    if (!availableIds.length) return []
    if (!draftMetaAdFilters.length) return availableIds

    const normalizedSelection = draftMetaAdFilters.filter((adId) => availableIds.includes(adId))
    return normalizedSelection.length > 0 ? normalizedSelection : availableIds
  }, [draftMetaAdFilters, draftAvailableMetaAdOptions])
  const metaCampaignFilterSummary = useMemo(() => {
    const totalCampaigns = availableMetaCampaignOptions.length
    const selectedCount = activeDraftMetaCampaignIds.length

    if (!totalCampaigns) return 'Nenhuma campanha disponível'
    if (selectedCount === totalCampaigns) return 'Todas as campanhas'
    if (selectedCount === 1) {
      return availableMetaCampaignOptions.find((campaign) => campaign.id === activeDraftMetaCampaignIds[0])?.name || '1 campanha selecionada'
    }

    return `${selectedCount} campanhas selecionadas`
  }, [availableMetaCampaignOptions, activeDraftMetaCampaignIds])
  const metaAdsetFilterSummary = useMemo(() => {
    const totalAdsets = draftAvailableMetaAdsetOptions.length
    const selectedCount = activeDraftMetaAdsetIds.length

    if (!totalAdsets) return 'Nenhum conjunto disponível'
    if (selectedCount === totalAdsets) return 'Todos os conjuntos'
    if (selectedCount === 1) {
      return draftAvailableMetaAdsetOptions.find((adset) => adset.id === activeDraftMetaAdsetIds[0])?.name || '1 conjunto selecionado'
    }

    return `${selectedCount} conjuntos selecionados`
  }, [draftAvailableMetaAdsetOptions, activeDraftMetaAdsetIds])
  const metaAdFilterSummary = useMemo(() => {
    const totalAds = draftAvailableMetaAdOptions.length
    const selectedCount = activeDraftMetaAdIds.length

    if (!totalAds) return 'Nenhum anúncio disponível'
    if (selectedCount === totalAds) return 'Todos os anúncios'
    if (selectedCount === 1) {
      return draftAvailableMetaAdOptions.find((ad) => ad.id === activeDraftMetaAdIds[0])?.name || '1 anúncio selecionado'
    }

    return `${selectedCount} anúncios selecionados`
  }, [draftAvailableMetaAdOptions, activeDraftMetaAdIds])
  const rdLeadSourceFilterSummary = useMemo(() => {
    const totalSources = rdSummary?.availableSources?.length || 0
    const selectedCount = activeDraftRdLeadSources.length

    if (!totalSources) return 'Nenhuma origem disponível'
    if (selectedCount === totalSources) return 'Todas as origens'
    if (selectedCount === 1) return activeDraftRdLeadSources[0] || '1 origem selecionada'

    return `${selectedCount} origens selecionadas`
  }, [rdSummary, activeDraftRdLeadSources])
  const hasPendingDashboardFilters = useMemo(() => {
    const hasDateRangeChanges = draftDateRange !== dateRange
    const hasCustomDateChanges =
      (draftDateRange === 'custom' || dateRange === 'custom') &&
      (draftCustomSince !== customSince || draftCustomUntil !== customUntil)
    const hasResultChanges = !haveSameSelection(normalizedDraftMetaResultFilters, normalizedMetaResultFilters)
    const hasCampaignChanges = !haveSameSelection(activeDraftMetaCampaignIds, activeMetaCampaignIds)
    const hasAdsetChanges = !haveSameSelection(activeDraftMetaAdsetIds, activeMetaAdsetIds)
    const hasAdChanges = !haveSameSelection(activeDraftMetaAdIds, activeMetaAdIds)
    const hasSellerChanges = draftRdSellerFilter !== rdSellerFilter
    const hasLeadSourceChanges = !haveSameSelection(activeDraftRdLeadSources, activeRdLeadSources)
    const hasFunnelChanges = !haveSameSelection(activeDraftFunnelSteps, activeFunnelSteps)
    const hasTemplateSelectionChanges = activeDraftDashboardTemplateId !== activeDashboardTemplateId
    const hasTemplateContentChanges = !haveSameDashboardTemplates(activeDraftDashboardTemplates, activeDashboardTemplates)

    return (
      hasDateRangeChanges ||
      hasCustomDateChanges ||
      hasResultChanges ||
      hasCampaignChanges ||
      hasAdsetChanges ||
      hasAdChanges ||
      hasSellerChanges ||
      hasLeadSourceChanges ||
      hasFunnelChanges ||
      hasTemplateSelectionChanges ||
      hasTemplateContentChanges
    )
  }, [
    draftDateRange,
    dateRange,
    draftCustomSince,
    customSince,
    draftCustomUntil,
    customUntil,
    normalizedDraftMetaResultFilters,
    normalizedMetaResultFilters,
    activeDraftMetaCampaignIds,
    activeMetaCampaignIds,
    activeDraftMetaAdsetIds,
    activeMetaAdsetIds,
    activeDraftMetaAdIds,
    activeMetaAdIds,
    draftRdSellerFilter,
    rdSellerFilter,
    activeDraftRdLeadSources,
    activeRdLeadSources,
    activeDraftFunnelSteps,
    activeFunnelSteps,
    activeDraftDashboardTemplateId,
    activeDashboardTemplateId,
    activeDraftDashboardTemplates,
    activeDashboardTemplates,
  ])
  const isApplyDashboardFiltersDisabled =
    !hasPendingDashboardFilters || (draftDateRange === 'custom' && (!draftCustomSince || !draftCustomUntil))
  const roleLabels = {
    master: 'Master',
    operador: 'Operador',
    cliente: 'Cliente',
    visualizador: 'Visualizador',
  }

  useEffect(() => {
    const preferences = loadDashboardPreferences()
    const initialClients = preferences.clients?.length
      ? preferences.clients
      : [createClientRecord({ name: 'Cliente demo' })]
    const initialActiveClientId = preferences.activeClientId || initialClients[0]?.id || ''

    setThemeColor(preferences.themeColor)
    setMetric1(preferences.metric1)
    setMetric2(preferences.metric2)
    setGlobalIntegrations(
      preferences.globalIntegrations || {
        metaAccessToken: '',
        googleAdsToken: '',
        tiktokAdsToken: '',
        linkedinAdsToken: '',
      }
    )
    setClients(initialClients)
    setActiveClientId(initialActiveClientId)
    setHasLoadedPreferences(true)
  }, [])

  useEffect(() => {
    if (!activeClient?.dashboardColor) return
    setThemeColor(activeClient.dashboardColor)
  }, [activeClient])

  useEffect(() => {
    campaignsRef.current = campaigns
  }, [campaigns])

  useEffect(() => {
    selectedQualifiedStagesRef.current = selectedQualifiedStages
  }, [selectedQualifiedStages])

  useEffect(() => {
    rdLeadSourceFiltersRef.current = rdLeadSourceFilters
  }, [rdLeadSourceFilters])

  useEffect(() => {
    setDraftDateRange(dateRange)
    setDraftCustomSince(customSince)
    setDraftCustomUntil(customUntil)
    setDraftMetaResultFilters(metaResultFilters)
    setDraftMetaCampaignFilters(metaCampaignFilters)
    setDraftMetaAdsetFilters(metaAdsetFilters)
    setDraftMetaAdFilters(metaAdFilters)
    setDraftRdSellerFilter(rdSellerFilter)
    setDraftRdLeadSourceFilters(rdLeadSourceFilters)
    setDraftFunnelSteps(activeFunnelSteps)
    setDraftDashboardTemplates(cloneDashboardTemplates(activeDashboardTemplates))
    setDraftDashboardTemplateId(activeDashboardTemplateId)
  }, [
    dateRange,
    customSince,
    customUntil,
    metaResultFilters,
    metaCampaignFilters,
    metaAdsetFilters,
    metaAdFilters,
    rdSellerFilter,
    rdLeadSourceFilters,
    activeFunnelSteps,
    activeDashboardTemplates,
    activeDashboardTemplateId,
    activeClientId,
    selectedAdAccount,
  ])

  useEffect(() => {
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
  }, [activeClientId, activeDashboardTemplate?.id])

  useEffect(() => {
    if (activeTab === 'clientes' && !canManageClients) {
      setActiveTab('apresentacao')
    }

    if (activeTab === 'usuarios' && !canManageUsers) {
      setActiveTab('apresentacao')
    }

    if (activeTab === 'integracoes' && !canManageClients) {
      setActiveTab('apresentacao')
    }
  }, [activeTab, canManageClients, canManageUsers])

  useEffect(() => {
    const sellers = rdSummary?.sellers || []

    if (!sellers.length) {
      setRdSellerFilter('all')
      setDraftRdSellerFilter('all')
      return
    }

    if (rdSellerFilter !== 'all' && !sellers.some((seller) => seller.id === rdSellerFilter)) {
      setRdSellerFilter('all')
    }
    if (draftRdSellerFilter !== 'all' && !sellers.some((seller) => seller.id === draftRdSellerFilter)) {
      setDraftRdSellerFilter('all')
    }
  }, [rdSummary, rdSellerFilter, draftRdSellerFilter])

  useEffect(() => {
    if (!hasLoadedPreferences || userLoading || !user || hasSyncedServerState) return

    const syncFromServer = async () => {
      try {
        const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
        if (!response.ok) {
          setHasSyncedServerState(true)
          return
        }

        const state = await response.json()

        setThemeColor(state.themeColor || 'blue')
        setMetric1(state.metric1 || 'spend')
        setMetric2(state.metric2 || 'roas')
        setClients(Array.isArray(state.clients) ? state.clients : [])
        setActiveClientId(state.activeClientId || state.clients?.[0]?.id || '')
      } catch (error) {
        console.error('Erro ao sincronizar estado do servidor:', error)
      } finally {
        setHasSyncedServerState(true)
      }
    }

    syncFromServer()
  }, [hasLoadedPreferences, userLoading, user, hasSyncedServerState])

  useEffect(() => {
    if (!hasLoadedPreferences) return

    const state = {
      themeColor,
      metric1,
      metric2,
      activeClientId,
      globalIntegrations,
      clients,
    }

    saveDashboardPreferences(state)

    if (userLoading || !user || !canManageClients) return

    const timeoutId = window.setTimeout(() => {
      fetch('/api/dashboard/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }).catch((error) => {
        console.error('Erro ao salvar estado no servidor:', error)
      })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [hasLoadedPreferences, themeColor, metric1, metric2, activeClientId, globalIntegrations, clients, userLoading, user, canManageClients])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-blue', currentTheme.main)
    root.style.setProperty('--glow-blue', currentTheme.glow)
    root.style.setProperty('--theme-surface', currentTheme.surface)
    ChartJS.defaults.color = '#94a3b8'
    ChartJS.defaults.font.family = "'Inter', sans-serif"
  }, [currentTheme])

  useEffect(() => {
    if (userLoading) return
    if (!user) {
      window.location.href = '/login'
    }
  }, [user, userLoading])

  const updateActiveClient = (updater) => {
    setClients((currentClients) =>
      currentClients.map((client) => {
        if (client.id !== activeClientId) return client
        return updater(client)
      })
    )
  }

  const updateDraftDashboardTemplate = (updater) => {
    if (!activeDraftDashboardTemplateId) return

    setDraftDashboardTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.id === activeDraftDashboardTemplateId ? updater(template) : template
      )
    )
  }

  const handleDashboardTemplateChange = (templateId) => {
    if (!templateId) return

    setDraftDashboardTemplateId(templateId)
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
  }

  const handleSaveDashboardTemplate = () => {
    if (!activeDraftDashboardTemplate) return

    const suggestedName =
      activeDraftDashboardTemplates.length <= 1
        ? 'Modelo 2'
        : `Modelo ${activeDraftDashboardTemplates.length + 1}`
    const templateName = window.prompt('Nome do modelo', suggestedName)
    const trimmedName = templateName?.trim()

    if (!trimmedName) return

    const newTemplate = createDashboardTemplate({
      name: trimmedName,
      metaMetricKeys: draftMetaDashboardMetricKeys,
      rdMetricKeys: draftRdDashboardMetricKeys,
    })

    setDraftDashboardTemplates((currentTemplates) => [...currentTemplates, newTemplate])
    setDraftDashboardTemplateId(newTemplate.id)
    setIsMetaMetricLibraryOpen(false)
    setIsRdMetricLibraryOpen(false)
  }

  const handleAddMetaDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      metaMetricKeys: Array.from(new Set([...(template.metaMetricKeys || []), metricKey])),
    }))
  }

  const handleRemoveMetaDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      metaMetricKeys: (template.metaMetricKeys || []).filter((item) => item !== metricKey),
    }))
  }

  const handleAddRdDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      rdMetricKeys: Array.from(new Set([...(template.rdMetricKeys || []), metricKey])),
    }))
  }

  const handleRemoveRdDashboardMetric = (metricKey) => {
    updateDraftDashboardTemplate((template) => ({
      ...template,
      rdMetricKeys: (template.rdMetricKeys || []).filter((item) => item !== metricKey),
    }))
  }

  const handleCreateClient = (event) => {
    event.preventDefault()
    if (!isMaster) return
    const trimmedName = newClientName.trim()
    if (!trimmedName) return

    const newClient = createClientRecord({ name: trimmedName })
    setClients((currentClients) => [...currentClients, newClient])
    setActiveClientId(newClient.id)
    setActiveTab('clientes')
    setNewClientName('')
  }

  const handleRemoveClient = (clientId) => {
    if (!isMaster) return
    const nextClients = clients.filter((client) => client.id !== clientId)
    setClients(nextClients)

    if (clientId === activeClientId) {
      setActiveClientId(nextClients[0]?.id || '')
    }
  }

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return

    try {
      setUsersLoading(true)
      const response = await fetch('/api/users', { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os usuários.')
      }

      setUsersList(data)
      setSelectedUserId((current) => current || data[0]?.id || '')
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      alert(error.message || 'Não foi possível carregar os usuários.')
    } finally {
      setUsersLoading(false)
    }
  }, [canManageUsers])

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase()
    if (!term) return usersList

    return usersList.filter((managedUser) =>
      [managedUser.full_name, managedUser.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    )
  }, [usersList, userSearch])
  const metaFilteredAdsetIds = useMemo(
    () =>
      availableMetaAdsetOptions
        .filter((adset) => activeMetaAdsetIds.length === 0 || activeMetaAdsetIds.includes(adset.id))
        .map((adset) => adset.id),
    [availableMetaAdsetOptions, activeMetaAdsetIds]
  )
  const metaFilteredAdsetIdsKey = useMemo(
    () => JSON.stringify(metaFilteredAdsetIds),
    [metaFilteredAdsetIds]
  )
  const metaFilteredAdIds = useMemo(
    () =>
      availableMetaAdOptions
        .filter((ad) => activeMetaAdIds.length === 0 || activeMetaAdIds.includes(ad.id))
        .map((ad) => ad.id),
    [availableMetaAdOptions, activeMetaAdIds]
  )
  const metaFilteredAdIdsKey = useMemo(
    () => JSON.stringify(metaFilteredAdIds),
    [metaFilteredAdIds]
  )
  const hasActiveMetaCampaignNarrowing = useMemo(() => {
    const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
    if (!availableIds.length) return false
    return metaFilteredCampaignIds.length !== availableIds.length
  }, [availableMetaCampaignOptions, metaFilteredCampaignIds])
  const hasActiveMetaAdsetNarrowing = useMemo(() => {
    const availableIds = availableMetaAdsetOptions.map((adset) => adset.id)
    if (!availableIds.length) return false
    return metaFilteredAdsetIds.length !== availableIds.length
  }, [availableMetaAdsetOptions, metaFilteredAdsetIds])
  const hasActiveMetaAdNarrowing = useMemo(() => {
    const availableIds = availableMetaAdOptions.map((ad) => ad.id)
    if (!availableIds.length) return false
    return metaFilteredAdIds.length !== availableIds.length
  }, [availableMetaAdOptions, metaFilteredAdIds])

  useEffect(() => {
    metaFilteredCampaignIdsRef.current = metaFilteredCampaignIds
  }, [metaFilteredCampaignIds])

  useEffect(() => {
    metaFilteredAdsetIdsRef.current = metaFilteredAdsetIds
  }, [metaFilteredAdsetIds])

  useEffect(() => {
    metaFilteredAdIdsRef.current = metaFilteredAdIds
  }, [metaFilteredAdIds])

  const handleUserClientToggle = (clientId) => {
    setUserForm((current) => ({
      ...current,
      clientIds: current.clientIds.includes(clientId)
        ? current.clientIds.filter((id) => id !== clientId)
        : [...current.clientIds, clientId],
    }))
  }

  const handleMetaResultFilterToggle = (filterKey) => {
    setDraftMetaResultFilters((current) => {
      const availableKeys = availableMetaResultFilters.map((item) => item.key)
      const normalizedCurrent = normalizeMetaResultFilters(current, availableKeys)

      if (normalizedCurrent.includes(filterKey)) {
        const nextFilters = normalizedCurrent.filter((item) => item !== filterKey)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      return [...normalizedCurrent, filterKey]
    })
  }

  const handleMetaCampaignFilterToggle = (campaignId) => {
    setDraftMetaCampaignFilters((current) => {
      const availableIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(campaignId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== campaignId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, campaignId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleApplyDashboardFilters = () => {
    const availableResultKeys = availableMetaResultFilters.map((item) => item.key)
    const availableCampaignIds = availableMetaCampaignOptions.map((campaign) => campaign.id)
    const availableAdsetIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)
    const availableAdIds = draftAvailableMetaAdOptions.map((ad) => ad.id)
    const availableLeadSources = rdSummary?.availableSources || []

    const normalizedResultSelection = draftMetaResultFilters.length > 0
      ? draftMetaResultFilters.filter((filterKey) => availableResultKeys.includes(filterKey))
      : []
    const normalizedCampaignSelection = draftMetaCampaignFilters.length > 0
      ? draftMetaCampaignFilters.filter((campaignId) => availableCampaignIds.includes(campaignId))
      : []
    const normalizedAdsetSelection = draftMetaAdsetFilters.length > 0
      ? draftMetaAdsetFilters.filter((adsetId) => availableAdsetIds.includes(adsetId))
      : []
    const normalizedAdSelection = draftMetaAdFilters.length > 0
      ? draftMetaAdFilters.filter((adId) => availableAdIds.includes(adId))
      : []
    const normalizedLeadSourceSelection = draftRdLeadSourceFilters.length > 0
      ? draftRdLeadSourceFilters.filter((source) => availableLeadSources.includes(source))
      : []

    setDateRange(draftDateRange)
    setCustomSince(draftCustomSince)
    setCustomUntil(draftCustomUntil)
    setMetaResultFilters(
      normalizedResultSelection.length === availableResultKeys.length ? [] : normalizedResultSelection
    )
    setMetaCampaignFilters(
      normalizedCampaignSelection.length === availableCampaignIds.length ? [] : normalizedCampaignSelection
    )
    setMetaAdsetFilters(
      normalizedAdsetSelection.length === availableAdsetIds.length ? [] : normalizedAdsetSelection
    )
    setMetaAdFilters(
      normalizedAdSelection.length === availableAdIds.length ? [] : normalizedAdSelection
    )
    setRdSellerFilter(draftRdSellerFilter)
    setRdLeadSourceFilters(
      normalizedLeadSourceSelection.length === availableLeadSources.length ? [] : normalizedLeadSourceSelection
    )
    updateActiveClient((client) => ({
      ...client,
      funnelSteps: activeDraftFunnelSteps,
      dashboardTemplates: cloneDashboardTemplates(activeDraftDashboardTemplates),
      activeDashboardTemplateId:
        draftDashboardTemplateId ||
        activeDraftDashboardTemplates[0]?.id ||
        client.activeDashboardTemplateId,
    }))
  }

  const handleMetaAdsetFilterToggle = (adsetId) => {
    setDraftMetaAdsetFilters((current) => {
      const availableIds = draftAvailableMetaAdsetOptions.map((adset) => adset.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(adsetId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== adsetId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, adsetId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleMetaAdFilterToggle = (adId) => {
    setDraftMetaAdFilters((current) => {
      const availableIds = draftAvailableMetaAdOptions.map((ad) => ad.id)
      if (!availableIds.length) return current

      const normalizedCurrent = current.length > 0
        ? current.filter((currentId) => availableIds.includes(currentId))
        : availableIds

      if (normalizedCurrent.includes(adId)) {
        const nextFilters = normalizedCurrent.filter((currentId) => currentId !== adId)
        return nextFilters.length > 0 ? nextFilters : normalizedCurrent
      }

      const nextFilters = [...normalizedCurrent, adId]
      return nextFilters.length === availableIds.length ? [] : nextFilters
    })
  }

  const handleRdLeadSourceToggle = (sourceLabel) => {
    setDraftRdLeadSourceFilters((current) => {
      const availableSources = rdSummary?.availableSources || []
      const currentSelection = current.length > 0 ? current.filter((source) => availableSources.includes(source)) : availableSources

      if (currentSelection.includes(sourceLabel)) {
        const nextSelection = currentSelection.filter((item) => item !== sourceLabel)
        if (nextSelection.length === 0) return currentSelection
        return nextSelection.length === availableSources.length ? [] : nextSelection
      }

      const nextSelection = [...currentSelection, sourceLabel]
      return nextSelection.length === availableSources.length ? [] : nextSelection
    })
  }

  const isMetaRateLimitMessage = (message = '') =>
    /rate limit|request limit|too many calls|too many requests/i.test(message)

  const handleCreateUser = async (event) => {
    event.preventDefault()

    try {
      setSavingUser(true)
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userForm),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível criar o usuário.')
      }

      setUserForm({
        fullName: '',
        email: '',
        password: '',
        role: 'visualizador',
        clientIds: [],
      })
      setIsCreateUserModalOpen(false)
      await loadUsers()
    } catch (error) {
      alert(error.message || 'Não foi possível criar o usuário.')
    } finally {
      setSavingUser(false)
    }
  }

  const handleUpdateUser = async (managedUser) => {
    try {
      const response = await fetch(`/api/users/${managedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: managedUser.full_name || '',
          role: managedUser.role,
          clientIds: (managedUser.clientAccess || []).map((item) => item.client_id),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível atualizar o usuário.')
      }

      setIsEditUserModalOpen(false)
      await loadUsers()
    } catch (error) {
      alert(error.message || 'Não foi possível atualizar o usuário.')
    }
  }

  const handleManagedUserChange = (userId, updater) => {
    setUsersList((current) =>
      current.map((item) => (item.id === userId ? updater(item) : item))
    )
  }

  const handleDeleteUser = async (managedUserId) => {
    try {
      const response = await fetch(`/api/users/${managedUserId}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir o usuário.')
      }

      setIsEditUserModalOpen(false)
      setSelectedUserId('')
      await loadUsers()
    } catch (error) {
      alert(error.message || 'Não foi possível excluir o usuário.')
    }
  }

  useEffect(() => {
    if (!canManageUsers || activeTab !== 'usuarios') return
    loadUsers()
  }, [canManageUsers, activeTab, loadUsers])

  useEffect(() => {
    if (!usersList.length) {
      setSelectedUserId('')
      return
    }

    if (selectedUserId && usersList.some((managedUser) => managedUser.id === selectedUserId)) {
      return
    }

    setSelectedUserId(usersList[0].id)
  }, [usersList, selectedUserId])

  const handleClientFieldChange = (fieldName, value) => {
    updateActiveClient((client) => ({
      ...client,
      [fieldName]: value,
    }))
  }

  const handleGlobalIntegrationChange = (fieldName, value) => {
    setGlobalIntegrations((current) => ({
      ...current,
      [fieldName]: value,
    }))
  }

  const handleQualifiedStageToggle = (stageName) => {
    updateActiveClient((client) => {
      const currentStages = Array.isArray(client.rdQualifiedStages) ? client.rdQualifiedStages : []
      const nextStages = currentStages.includes(stageName)
        ? currentStages.filter((stage) => stage !== stageName)
        : [...currentStages, stageName]

      return {
        ...client,
        rdQualifiedStages: nextStages,
      }
    })
  }

  const handleIntegrationChange = (fieldName, value, storage) => {
    if (storage === 'client') {
      handleClientFieldChange(fieldName, value)
      return
    }

    updateActiveClient((client) => ({
      ...client,
      integrations: {
        ...client.integrations,
        [fieldName]: value,
      },
    }))
  }

  const handleClientLogoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      handleClientFieldChange('logoUrl', reader.result?.toString() || '')
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (!hasLoadedPreferences || !activeClient) {
      setAdAccounts([])
      return
    }

    if (activeTab !== 'clientes' && activeTab !== 'integracoes') {
      return
    }

    if (!globalIntegrations.metaAccessToken) {
      setAdAccounts([])
      return
    }

    const fetchAdAccounts = async () => {
      setErrorMessage('')

      try {
        const response = await fetch('/api/meta/adaccounts', {
          headers: {
            'x-meta-access-token': globalIntegrations.metaAccessToken,
          },
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Não foi possível listar as contas da Meta.')
        }

        setAdAccounts(data)

        if (!activeClient.metaAdAccountId && data[0]?.id) {
          setClients((currentClients) =>
            currentClients.map((client) =>
              client.id === activeClientId
                ? { ...client, metaAdAccountId: data[0].id }
                : client
            )
          )
        }
      } catch (error) {
        setAdAccounts([])
        setErrorMessage(error.message || 'Não foi possível conectar à Meta.')
      }
    }

    fetchAdAccounts()
  }, [hasLoadedPreferences, activeClient, activeClientId, globalIntegrations.metaAccessToken, activeTab])

  useEffect(() => {
    if (activeTab !== 'apresentacao') return

    if (!activeClientId) {
      lastMetaStructureFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setCampaigns([])
      setMetaHierarchy([])
      setBreakdowns({ ages: [], cities: [], creatives: [] })
      setRdSummary(null)
      setIsMetaStructureReady(false)
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    let cancelled = false

    const loadMetaStructure = async () => {
      if (!hasMetaConfigured) {
        setCampaigns([])
        setMetaHierarchy([])
        setIsMetaStructureReady(true)
        return
      }

      setIsMetaStructureReady(false)

      try {
        const fetchKey = JSON.stringify({
          activeClientId,
          selectedAdAccount,
          dateRange,
          customSince,
          customUntil,
          metaToken: globalIntegrations.metaAccessToken,
        })

        if (lastMetaStructureFetchKeyRef.current === fetchKey) {
          setIsMetaStructureReady(true)
          return
        }

        lastMetaStructureFetchKeyRef.current = fetchKey

        const params = new URLSearchParams({
          ad_account_id: selectedAdAccount,
          date_preset: dateRange,
        })

        if (dateRange === 'custom') {
          params.set('since', customSince)
          params.set('until', customUntil)
        }

        const headers = {
          'x-meta-access-token': globalIntegrations.metaAccessToken,
        }

        const [campaignsResponse, structureResponse] = await Promise.all([
          fetch(`/api/meta/campaigns?${params.toString()}`, { headers }),
          fetch(`/api/meta/structure?${params.toString()}`, { headers }),
        ])
        const [campaignsData, structureData] = await Promise.all([
          campaignsResponse.json().catch(() => ({ error: 'Não foi possível interpretar a resposta das campanhas da Meta.' })),
          structureResponse.json().catch(() => ({ error: 'Não foi possível interpretar a resposta da estrutura da Meta.' })),
        ])

        if (!campaignsResponse.ok) {
          throw new Error(campaignsData.error || 'Não foi possível carregar as campanhas da Meta.')
        }

        if (cancelled) return
        setCampaigns(campaignsData || [])
        setMetaHierarchy(structureResponse.ok ? structureData || [] : [])

        if (!structureResponse.ok) {
          setErrorMessage(structureData?.error || 'Não foi possível carregar conjuntos e anúncios da Meta.')
        }

        setIsMetaStructureReady(true)
      } catch (error) {
        if (!cancelled) {
          setCampaigns([])
          setMetaHierarchy([])
          setIsMetaStructureReady(true)
          setErrorMessage(error.message || 'Não foi possível carregar a estrutura da Meta.')
        }
      }
    }

    loadMetaStructure()

    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    globalIntegrations.metaAccessToken,
  ])

  useEffect(() => {
    if (activeTab !== 'apresentacao') return

    if (!activeClientId) {
      lastDashboardFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setRdSummary(null)
      return
    }

    if (!hasMetaConfigured && !hasRdConfigured) {
      lastDashboardFetchKeyRef.current = ''
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setRdSummary(null)
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    if (hasMetaConfigured && !isMetaStructureReady) {
      return
    }

    let cancelled = false

    const fetchDashboardData = async () => {
      const fetchKey = JSON.stringify({
        activeClientId,
        selectedAdAccount,
        dateRange,
        customSince,
        customUntil,
        hasMetaConfigured,
        hasRdConfigured,
        rdSellerFilter,
        rdLeadSourceFiltersKey,
        selectedQualifiedStagesKey,
        metaFilteredCampaignIdsKey,
        metaFilteredAdsetIdsKey,
        metaFilteredAdIdsKey,
        hasActiveMetaCampaignNarrowing,
        hasActiveMetaAdsetNarrowing,
        hasActiveMetaAdNarrowing,
        isMetaStructureReady,
        metaToken: globalIntegrations.metaAccessToken,
        rdToken: activeIntegrations.rdStationToken,
      })

      if (lastDashboardFetchKeyRef.current === fetchKey) {
        return
      }

      lastDashboardFetchKeyRef.current = fetchKey
      setIsLoading(true)
      setErrorMessage('')

      try {
        let metaError = ''
        let rdError = ''

        if (hasMetaConfigured) {
          const params = new URLSearchParams({
            ad_account_id: selectedAdAccount,
            date_preset: dateRange,
          })

          if (dateRange === 'custom') {
            params.set('since', customSince)
            params.set('until', customUntil)
          }

          const insightsParams = new URLSearchParams(params)
          const currentMetaFilteredCampaignIds = metaFilteredCampaignIdsRef.current
          const currentMetaFilteredAdsetIds = metaFilteredAdsetIdsRef.current
          const currentMetaFilteredAdIds = metaFilteredAdIdsRef.current
          const currentRdLeadSourceFilters = rdLeadSourceFiltersRef.current
          const currentSelectedQualifiedStages = selectedQualifiedStagesRef.current

          if (currentMetaFilteredCampaignIds.length === 0) {
            insightsParams.set('campaign_ids', '__none__')
          } else if (hasActiveMetaCampaignNarrowing) {
            insightsParams.set('campaign_ids', currentMetaFilteredCampaignIds.join(','))
          }
          if (hasActiveMetaAdsetNarrowing && currentMetaFilteredAdsetIds.length > 0) {
            insightsParams.set('adset_ids', currentMetaFilteredAdsetIds.join(','))
          }
          if (hasActiveMetaAdNarrowing && currentMetaFilteredAdIds.length > 0) {
            insightsParams.set('ad_ids', currentMetaFilteredAdIds.join(','))
          }

          const headers = {
            'x-meta-access-token': globalIntegrations.metaAccessToken,
          }

          const insightsResponse = await fetch(`/api/meta/insights?${insightsParams.toString()}`, { headers })
          const insightsData = await insightsResponse.json()

          if (!insightsResponse.ok) {
            const nextMetaError = insightsData.error || 'Não foi possível carregar os indicadores da Meta.'
            if (!cancelled) {
              setInsights(buildMetaSummaryFromCampaigns(campaignsRef.current))
              setDailyData([])
            }
            metaError = isMetaRateLimitMessage(nextMetaError) ? '' : nextMetaError
          } else if (!cancelled) {
            setInsights(insightsData.summary || {})
            setDailyData(insightsData.daily || [])
          }
        } else if (!cancelled) {
          setInsights(null)
          setDailyData([])
        }

        if (hasRdConfigured) {
          const rdParams = new URLSearchParams()
          if (rdSellerFilter && rdSellerFilter !== 'all') {
            rdParams.set('seller_id', rdSellerFilter)
          }
          if (currentRdLeadSourceFilters.length > 0) {
            currentRdLeadSourceFilters.forEach((source) => {
              rdParams.append('lead_source', source)
            })
          }
          rdParams.set('date_preset', dateRange)
          currentSelectedQualifiedStages.forEach((stage) => {
            rdParams.append('qualified_stage', stage)
          })
          if (dateRange === 'custom') {
            rdParams.set('since', customSince)
            rdParams.set('until', customUntil)
          }

          const rdResponse = await fetch(`/api/rd/summary${rdParams.toString() ? `?${rdParams.toString()}` : ''}`, {
            headers: {
              'x-rd-station-token': activeIntegrations.rdStationToken,
            },
          })
          const rdData = await rdResponse.json()

          if (!rdResponse.ok) {
            rdError = rdData.error || 'Não foi possível carregar os dados do RD Station.'
            if (!cancelled) {
              setRdSummary(null)
            }
          } else if (!cancelled) {
            setRdSummary(rdData || null)
          }
        } else if (!cancelled) {
          setRdSummary(null)
        }

        if (!cancelled) {
          setErrorMessage(metaError || rdError)
        }
      } catch (error) {
        if (!cancelled) {
          setInsights(null)
          setDailyData([])
          setBreakdowns({ ages: [], cities: [], creatives: [] })
          setRdSummary(null)
          setErrorMessage(error.message || 'Falha ao puxar os dados da integração.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchDashboardData()

    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    hasRdConfigured,
    rdSellerFilter,
    rdLeadSourceFiltersKey,
    selectedQualifiedStagesKey,
    metaResultFilters,
    metaFilteredCampaignIdsKey,
    metaFilteredAdIdsKey,
    metaFilteredAdsetIdsKey,
    hasActiveMetaCampaignNarrowing,
    hasActiveMetaAdsetNarrowing,
    hasActiveMetaAdNarrowing,
    isMetaStructureReady,
    globalIntegrations.metaAccessToken,
    activeIntegrations.rdStationToken,
  ])

  useEffect(() => {
    if (activeTab !== 'apresentacao') {
      lastBreakdownsFetchKeyRef.current = ''
      return
    }

    if (!activeClientId || !hasMetaConfigured) {
      lastBreakdownsFetchKeyRef.current = ''
      setBreakdowns({ ages: [], cities: [], creatives: [] })
      setIsRankingsLoading(false)
      setRankingsError('')
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    if (!isMetaStructureReady) {
      return
    }

    const fetchRankings = async () => {
      const fetchKey = JSON.stringify({
        activeClientId,
        selectedAdAccount,
        dateRange,
        customSince,
        customUntil,
        hasMetaConfigured,
        metaFilteredCampaignIdsKey,
        metaFilteredAdsetIdsKey,
        metaFilteredAdIdsKey,
        hasActiveMetaCampaignNarrowing,
        hasActiveMetaAdsetNarrowing,
        hasActiveMetaAdNarrowing,
        isMetaStructureReady,
        metaToken: globalIntegrations.metaAccessToken,
      })

      if (lastBreakdownsFetchKeyRef.current === fetchKey) {
        return
      }

      lastBreakdownsFetchKeyRef.current = fetchKey
      setIsRankingsLoading(true)
      setRankingsError('')

      try {
        const params = new URLSearchParams({
          ad_account_id: selectedAdAccount,
          date_preset: dateRange,
        })

        if (dateRange === 'custom') {
          params.set('since', customSince)
          params.set('until', customUntil)
        }

        const currentMetaFilteredCampaignIds = metaFilteredCampaignIdsRef.current
        const currentMetaFilteredAdsetIds = metaFilteredAdsetIdsRef.current
        const currentMetaFilteredAdIds = metaFilteredAdIdsRef.current

        if (currentMetaFilteredCampaignIds.length === 0) {
          params.set('campaign_ids', '__none__')
        } else if (hasActiveMetaCampaignNarrowing) {
          params.set('campaign_ids', currentMetaFilteredCampaignIds.join(','))
        }
        if (hasActiveMetaAdsetNarrowing && currentMetaFilteredAdsetIds.length > 0) {
          params.set('adset_ids', currentMetaFilteredAdsetIds.join(','))
        }
        if (hasActiveMetaAdNarrowing && currentMetaFilteredAdIds.length > 0) {
          params.set('ad_ids', currentMetaFilteredAdIds.join(','))
        }

        const response = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
          headers: {
            'x-meta-access-token': globalIntegrations.metaAccessToken,
          },
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Os rankings detalhados não responderam agora.')
        }

        setBreakdowns(data || { ages: [], cities: [], creatives: [] })
      } catch (error) {
        setBreakdowns({ ages: [], cities: [], creatives: [] })
        setRankingsError(error.message || 'Os rankings detalhados não responderam agora.')
      } finally {
        setIsRankingsLoading(false)
      }
    }

    fetchRankings()
  }, [
    activeClientId,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    metaFilteredCampaignIdsKey,
    metaFilteredAdsetIdsKey,
    metaFilteredAdIdsKey,
    hasActiveMetaCampaignNarrowing,
    hasActiveMetaAdsetNarrowing,
    hasActiveMetaAdNarrowing,
    isMetaStructureReady,
    globalIntegrations.metaAccessToken,
    activeTab,
  ])

  const handleSaveIntegrations = async (event) => {
    event.preventDefault()
    setIsSavingIntegrations(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    setIsSavingIntegrations(false)
    alert(`Cliente ${activeClient?.name || ''} salvo neste navegador.`)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const exportPDF = async () => {
    if (!dashboardRef.current) return

    try {
      setIsExporting(true)
      const element = dashboardRef.current
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b0f19',
        scrollY: -window.scrollY,
        windowWidth: Math.max(element.scrollWidth, element.clientWidth, window.innerWidth),
        windowHeight: Math.max(element.scrollHeight, element.clientHeight),
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfPageHeight = pdf.internal.pageSize.getHeight()
      const scaledImageHeight = (canvas.height * pdfWidth) / canvas.width

      let remainingHeight = scaledImageHeight
      let currentOffset = 0

      pdf.addImage(imgData, 'PNG', 0, currentOffset, pdfWidth, scaledImageHeight)
      remainingHeight -= pdfPageHeight

      while (remainingHeight > 0) {
        currentOffset = remainingHeight - scaledImageHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, currentOffset, pdfWidth, scaledImageHeight)
        remainingHeight -= pdfPageHeight
      }

      pdf.save(`dashboard-${activeClient?.name || 'cliente'}.pdf`)
    } catch (error) {
      console.error('Erro ao exportar PDF:', error)
      alert('Não foi possível gerar o PDF agora.')
    } finally {
      setIsExporting(false)
    }
  }

  const replaceDraftFunnelSteps = (steps) => {
    setDraftFunnelSteps(steps)
  }

  const handleFunnelDragStart = (metricKey, sourceIndex = null) => {
    setDragMetricKey(metricKey)
    setDragSourceIndex(sourceIndex)
  }

  const handleFunnelDrop = (targetIndex = activeDraftFunnelSteps.length) => {
    if (!dragMetricKey) return

    const currentSteps = [...activeDraftFunnelSteps]

    if (dragSourceIndex !== null) {
      const [movedStep] = currentSteps.splice(dragSourceIndex, 1)
      const adjustedIndex = dragSourceIndex < targetIndex ? targetIndex - 1 : targetIndex
      currentSteps.splice(adjustedIndex, 0, movedStep)
      replaceDraftFunnelSteps(currentSteps)
    } else if (!currentSteps.includes(dragMetricKey)) {
      currentSteps.splice(targetIndex, 0, dragMetricKey)
      replaceDraftFunnelSteps(currentSteps)
    }

    setDragMetricKey('')
    setDragSourceIndex(null)
  }

  const handleRemoveFunnelStep = (metricKey) => {
    replaceDraftFunnelSteps(activeDraftFunnelSteps.filter((step) => step !== metricKey))
  }

  const customMetrics = useMemo(() => insights?.custom_metrics || {}, [insights])

  const labels = dailyData.map((day) => {
    const date = new Date(day.date_start)
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  })

  const lineChartData = {
    labels: labels.length > 0 ? labels : ['Sem dados'],
    datasets: [
      {
        label: METRIC_OPTIONS[metric1].label,
        data: dailyData.length > 0 ? dailyData.map((day) => getMetricData(metric1, day)) : [0],
        borderColor: currentTheme.main,
        backgroundColor: currentTheme.glow,
        borderWidth: 3,
        pointBackgroundColor: '#0b0f19',
        pointBorderColor: currentTheme.main,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
        yAxisID: 'y',
      },
      {
        label: METRIC_OPTIONS[metric2].label,
        data: dailyData.length > 0 ? dailyData.map((day) => getMetricData(metric2, day)) : [0],
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 3,
        borderDash: [7, 5],
        pointBackgroundColor: '#0b0f19',
        pointBorderColor: '#10b981',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        yAxisID: 'y1',
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.94)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${formatMetricValue(context.parsed.y, context.dataset.yAxisID === 'y' ? metric1 : metric2)}`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: {
          callback(value) {
            return formatChartAxis(value, metric1)
          },
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { display: false },
        ticks: {
          callback(value) {
            return formatChartAxis(value, metric2)
          },
        },
      },
    },
  }

  const filteredCampaigns = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase()
    const filtered = campaigns.filter((campaign) => {
      const hasSpendInSelectedPeriod = Number(campaign?.spend || 0) > 0
      const matchesSearch = !term || campaign.name?.toLowerCase().includes(term)
      const matchesStatus = campaignStatusFilter === 'all' || campaign.status === campaignStatusFilter
      const matchesResultType = campaignMatchesMetaResultFilters(campaign, normalizedMetaResultFilters, availableMetaResultFilters.map((item) => item.key))
      const matchesCampaignFilter = activeMetaCampaignIds.length === 0 || activeMetaCampaignIds.includes(campaign.id)
      return hasSpendInSelectedPeriod && matchesSearch && matchesStatus && matchesResultType && matchesCampaignFilter
    })

    const getCampaignMetrics = (campaign) => {
      const metrics = extractMetaCampaignMetrics(campaign)

      return {
        spendValue: metrics.spend,
        totalConversionsValue: metrics.totalConversions,
        roasValue: metrics.roas,
      }
    }

    return filtered.sort((campaignA, campaignB) => {
      const metricsA = getCampaignMetrics(campaignA)
      const metricsB = getCampaignMetrics(campaignB)

      if (campaignSortBy === 'roas') return metricsB.roasValue - metricsA.roasValue
      if (campaignSortBy === 'conversions') return metricsB.totalConversionsValue - metricsA.totalConversionsValue
      return metricsB.spendValue - metricsA.spendValue
    })
  }, [campaigns, campaignSearch, campaignStatusFilter, campaignSortBy, normalizedMetaResultFilters, availableMetaResultFilters, activeMetaCampaignIds])

  const campaignSummary = useMemo(() => {
    if (!filteredCampaigns.length) {
      return {
        spend: parseFloat(insights?.spend || 0),
        reach: parseInt(insights?.reach || 0, 10),
        impressions: parseInt(insights?.impressions || 0, 10),
        clicks: customMetrics.clicks || parseInt(insights?.clicks || 0, 10),
        cpc: customMetrics.cpc || parseFloat(insights?.cpc || 0),
        ctr: customMetrics.ctr || parseFloat(insights?.ctr || 0),
        cpm: customMetrics.cpm || 0,
        frequency: customMetrics.frequency || 0,
        conversionRate: customMetrics.conversionRate || 0,
        averageTicket: customMetrics.averageTicket || 0,
        purchases: customMetrics.purchases || 0,
        cost_per_purchase: customMetrics.cost_per_purchase || 0,
        leads: customMetrics.leads || 0,
        cost_per_lead: customMetrics.cost_per_lead || 0,
        messages: customMetrics.messages || 0,
        cost_per_message: customMetrics.cost_per_message || 0,
        totalConversions: customMetrics.totalConversions || 0,
        roas: customMetrics.roas || 0,
        purchaseValue: customMetrics.purchaseValue || 0,
      }
    }

    const aggregated = filteredCampaigns.reduce(
      (accumulator, campaign) => {
        const metrics = extractMetaCampaignMetrics(campaign)

        accumulator.spend += metrics.spend
        accumulator.reach += metrics.reach
        accumulator.impressions += metrics.impressions
        accumulator.clicks += metrics.clicks
        accumulator.purchases += metrics.purchases
        accumulator.leads += metrics.leads
        accumulator.messages += metrics.messages
        accumulator.totalConversions += metrics.totalConversions
        accumulator.purchaseValue += metrics.purchaseValue

        return accumulator
      },
      {
        spend: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        leads: 0,
        messages: 0,
        totalConversions: 0,
        purchaseValue: 0,
      }
    )

    return {
      ...aggregated,
      cpc: aggregated.clicks > 0 ? aggregated.spend / aggregated.clicks : 0,
      cpm: aggregated.impressions > 0 ? (aggregated.spend / aggregated.impressions) * 1000 : 0,
      frequency: aggregated.reach > 0 ? aggregated.impressions / aggregated.reach : 0,
      ctr: aggregated.impressions > 0 ? (aggregated.clicks / aggregated.impressions) * 100 : 0,
      conversionRate: aggregated.clicks > 0 ? (aggregated.totalConversions / aggregated.clicks) * 100 : 0,
      averageTicket: aggregated.purchases > 0 ? aggregated.purchaseValue / aggregated.purchases : 0,
      cost_per_purchase: aggregated.purchases > 0 ? aggregated.spend / aggregated.purchases : 0,
      cost_per_lead: aggregated.leads > 0 ? aggregated.spend / aggregated.leads : 0,
      cost_per_message: aggregated.messages > 0 ? aggregated.spend / aggregated.messages : 0,
      roas: aggregated.spend > 0 ? aggregated.purchaseValue / aggregated.spend : 0,
    }
  }, [filteredCampaigns, insights, customMetrics])

  const spend = campaignSummary.spend || 0
  const reach = campaignSummary.reach || 0
  const impressions = campaignSummary.impressions || 0
  const clicks = campaignSummary.clicks || 0
  const cpc = campaignSummary.cpc || 0
  const cpm = campaignSummary.cpm || 0
  const frequency = campaignSummary.frequency || 0
  const ctr = campaignSummary.ctr || 0
  const conversionRate = campaignSummary.conversionRate || 0
  const averageTicket = campaignSummary.averageTicket || 0
  const purchases = campaignSummary.purchases || 0
  const costPerPurchase = campaignSummary.cost_per_purchase || 0
  const leads = campaignSummary.leads || 0
  const costPerLead = campaignSummary.cost_per_lead || 0
  const messages = campaignSummary.messages || 0
  const costPerMessage = campaignSummary.cost_per_message || 0
  const totalConversions = campaignSummary.totalConversions || 0
  const roas = campaignSummary.roas || 0
  const purchaseValue = campaignSummary.purchaseValue || 0

  const doughnutChartData = {
    labels: ['Compras', 'Leads', 'Mensagens', 'Cliques sem conversão'],
    datasets: [
      {
        data: [purchases, leads, messages, Math.max(clicks - totalConversions, 0)],
        backgroundColor: [currentTheme.main, '#10b981', '#f59e0b', '#334155'],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  }

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#cbd5e1',
          padding: 18,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            return `${context.label}: ${formatNumber(context.parsed)}`
          },
        },
      },
    },
  }

  const availableFunnelMetrics = useMemo(
    () => Object.entries(METRIC_OPTIONS).filter(([key]) => !activeDraftFunnelSteps.includes(key)),
    [activeDraftFunnelSteps]
  )

  const funnelCards = useMemo(
    () =>
      activeDraftFunnelSteps.map((metricKey, index) => {
        const value = getSummaryMetricValue(metricKey, insights, customMetrics)
        const previousKey = activeDraftFunnelSteps[index - 1]
        const previousValue = previousKey ? getSummaryMetricValue(previousKey, insights, customMetrics) : 0

        return {
          key: metricKey,
          label: METRIC_OPTIONS[metricKey]?.label || metricKey,
          formattedValue: formatMetricValue(value, metricKey),
          conversionRate: index === 0 || previousValue <= 0 ? null : (value / previousValue) * 100,
        }
      }),
    [activeDraftFunnelSteps, insights, customMetrics]
  )

  const mediaKpis = [
    { title: 'Investimento', value: formatCurrency(spend), icon: 'bx-wallet', tone: 'blue' },
    { title: 'Impressões', value: formatNumber(impressions), icon: 'bx-show', tone: 'purple' },
    { title: 'Cliques', value: formatNumber(clicks), icon: 'bx-pointer', tone: 'cyan' },
    { title: 'CPC', value: formatCurrency(cpc), icon: 'bx-purchase-tag', tone: 'orange' },
    { title: 'CTR', value: formatPercent(ctr), icon: 'bx-mouse', tone: 'pink' },
    { title: 'Conversões totais', value: formatNumber(totalConversions), icon: 'bx-line-chart', tone: 'gold' },
  ]

  const conversionGroups = [
    purchases > 0 && {
      title: 'Compras',
      subtitle: 'Resultado de vendas atribuídas no período',
      icon: 'bx-cart',
      tone: 'emerald',
      stats: [
        { label: 'Compras', value: formatNumber(purchases) },
        { label: 'Custo por compra', value: formatCurrency(costPerPurchase) },
        { label: 'ROAS', value: formatMultiplier(roas) },
      ],
    },
    leads > 0 && {
      title: 'Cadastros',
      subtitle: 'Leads captados ao longo do período',
      icon: 'bx-user-plus',
      tone: 'cyan',
      stats: [
        { label: 'Cadastros', value: formatNumber(leads) },
        { label: 'Custo por cadastro', value: formatCurrency(costPerLead) },
      ],
    },
    messages > 0 && {
      title: 'Mensagens iniciadas',
      subtitle: 'Conversas iniciadas em canais de mensagem',
      icon: 'bx-chat',
      tone: 'blue',
      stats: [
        { label: 'Mensagens iniciadas', value: formatNumber(messages) },
        { label: 'Custo por mensagem iniciada', value: formatCurrency(costPerMessage) },
      ],
    },
  ].filter(Boolean)

  const rdQualificationKpis = [
    { title: 'Oportunidades', value: formatNumber(rdSummary?.opportunityCount || 0), icon: 'bx-bulb', tone: 'blue' },
    { title: 'Qualificados', value: formatNumber(rdSummary?.qualifiedOpportunityCount || 0), icon: 'bx-filter-alt', tone: 'emerald' },
    { title: 'Vendas da safra criada e fechada no período', value: formatNumber(rdSummary?.wonOpportunityCount || 0), icon: 'bx-badge-check', tone: 'emerald' },
    { title: 'Faturamento da safra criada e fechada', value: formatCurrency(rdSummary?.wonOpportunityRevenue || 0), icon: 'bx-wallet-alt', tone: 'orange' },
    { title: 'Ticket médio da safra criada e fechada', value: formatCurrency(rdSummary?.avgTicketWonByCreation || 0), icon: 'bx-receipt', tone: 'gold' },
    { title: 'Taxa de oportunidade para qualificados', value: formatPercent(rdSummary?.leadToQualifiedRate || 0), icon: 'bx-transfer-alt', tone: 'cyan' },
    { title: 'Taxa de qualificados para venda', value: formatPercent(rdSummary?.qualifiedToWonRate || 0), icon: 'bx-badge-check', tone: 'emerald' },
    { title: 'Taxa de oportunidade para venda', value: formatPercent(rdSummary?.leadToWonRate || 0), icon: 'bx-line-chart', tone: 'blue' },
    { title: 'Negócios perdidos', value: formatNumber(rdSummary?.lostOpportunityCount || 0), icon: 'bx-x-circle', tone: 'pink' },
  ]
  const rdRevenueKpis = [
    { title: 'Negociações ganhas fechadas no período', value: formatNumber(rdSummary?.wonDeals || 0), icon: 'bx-calendar-check', tone: 'emerald' },
    { title: 'Negociações ganhas de safras anteriores', value: formatNumber(rdSummary?.wonDealsFromPreviousCohorts || 0), icon: 'bx-history', tone: 'blue' },
    { title: 'Faturamento das negociações fechadas', value: formatCurrency(rdSummary?.wonRevenue || 0), icon: 'bx-wallet-alt', tone: 'orange' },
    { title: 'Ticket médio das negociações fechadas', value: formatCurrency(rdSummary?.avgTicketWon || 0), icon: 'bx-receipt', tone: 'gold' },
    { title: 'Faturamento de safras anteriores fechadas', value: formatCurrency(rdSummary?.wonRevenueFromPreviousCohorts || 0), icon: 'bx-coin-stack', tone: 'orange' },
    { title: 'Ticket médio de safras anteriores fechadas', value: formatCurrency(rdSummary?.avgTicketWonPreviousCohorts || 0), icon: 'bx-spreadsheet', tone: 'gold' },
  ]
  const rdDiagnosticsSummary = useMemo(() => {
    if (!rdSummary?.diagnostics) return 'Aguardando leitura técnica das negociações do RD.'

    const allWonInRange = rdSummary.diagnostics.allDeals?.wonClosedInRange || 0
    const filteredWonInRange = rdSummary.diagnostics.filteredDeals?.wonClosedInRange || 0

    if (rdSummary.diagnostics.sellerFilterApplied) {
      return `${formatNumber(filteredWonInRange)} negociações no período após o filtro atual de vendedor.`
    }

    return `${formatNumber(allWonInRange)} negociações ganhas reconhecidas no período selecionado.`
  }, [rdSummary])
  const rdFinalSalesCount = (rdSummary?.wonOpportunityCount || 0) + (rdSummary?.wonDealsFromPreviousCohorts || 0)
  const rdFinalRevenue = (rdSummary?.wonOpportunityRevenue || 0) + (rdSummary?.wonRevenueFromPreviousCohorts || 0)
  const rdFinalAvgTicket = rdFinalSalesCount > 0 ? rdFinalRevenue / rdFinalSalesCount : 0
  const rdFinalKpis = [
    { title: 'Vendas totais do resultado final', value: formatNumber(rdFinalSalesCount), icon: 'bx-trophy', tone: 'emerald' },
    { title: 'Faturamento total do resultado final', value: formatCurrency(rdFinalRevenue), icon: 'bx-wallet-alt', tone: 'orange' },
    { title: 'Ticket médio do resultado final', value: formatCurrency(rdFinalAvgTicket), icon: 'bx-receipt', tone: 'gold' },
  ]
  const metaDashboardMetricValues = useMemo(
    () => ({
      reach,
      cpm,
      frequency,
      conversionRate,
      averageTicket,
      purchaseValue,
      purchases,
      costPerPurchase,
      leads,
      costPerLead,
      messages,
      costPerMessage,
      clicksWithoutConversion: Math.max(clicks - totalConversions, 0),
      roas,
    }),
    [reach, cpm, frequency, conversionRate, averageTicket, purchaseValue, purchases, costPerPurchase, leads, costPerLead, messages, costPerMessage, clicks, totalConversions, roas]
  )
  const metaDashboardMetricCards = useMemo(
    () =>
      draftMetaDashboardMetricKeys
        .map((metricKey) => {
          const metric = META_TEMPLATE_METRIC_OPTIONS[metricKey]
          if (!metric) return null

          return {
            key: metricKey,
            title: metric.label,
            description: metric.description,
            icon: metric.icon,
            tone: metric.tone,
            value: formatDashboardMetricValue(metaDashboardMetricValues[metricKey], metric.type),
          }
        })
        .filter(Boolean),
    [draftMetaDashboardMetricKeys, metaDashboardMetricValues]
  )
  const availableMetaDashboardMetricOptions = useMemo(
    () => Object.entries(META_TEMPLATE_METRIC_OPTIONS).filter(([metricKey]) => !draftMetaDashboardMetricKeys.includes(metricKey)),
    [draftMetaDashboardMetricKeys]
  )
  const rdDashboardMetricValues = useMemo(
    () => ({
      contacts: rdSummary?.contacts || 0,
      contactsInPeriod: rdSummary?.contactsInPeriod || 0,
      contactsMoved: rdSummary?.contactsMoved || 0,
      qualifiedDeals: rdSummary?.qualifiedDeals || 0,
      qualifiedContacts: rdSummary?.qualifiedContacts || 0,
      closeRate: rdSummary?.closeRate || 0,
      dealToWonRate: rdSummary?.dealToWonRate || 0,
      leadToDealRate: rdSummary?.leadToDealRate || 0,
      sourceConversionRate: rdSummary?.sourceConversionRate || 0,
      avgLeadToWonDays: rdSummary?.avgLeadToWonDays || 0,
      avgDealToWonDays: rdSummary?.avgDealToWonDays || 0,
      avgLeadToWonDaysFiltered: rdSummary?.avgLeadToWonDaysFiltered || 0,
      avgDealToWonDaysFiltered: rdSummary?.avgDealToWonDaysFiltered || 0,
      contactsWithDeals: rdSummary?.contactsWithDeals || 0,
      contactsWithWonDeals: rdSummary?.contactsWithWonDeals || 0,
      lostContacts: rdSummary?.lostContacts || 0,
    }),
    [rdSummary]
  )
  const rdDashboardMetricCards = useMemo(
    () =>
      draftRdDashboardMetricKeys
        .map((metricKey) => {
          const metric = RD_TEMPLATE_METRIC_OPTIONS[metricKey]
          if (!metric) return null

          return {
            key: metricKey,
            title: metric.label,
            description: metric.description,
            icon: metric.icon,
            tone: metric.tone,
            value: formatDashboardMetricValue(rdDashboardMetricValues[metricKey], metric.type),
          }
        })
        .filter(Boolean),
    [draftRdDashboardMetricKeys, rdDashboardMetricValues]
  )
  const availableRdDashboardMetricOptions = useMemo(
    () => Object.entries(RD_TEMPLATE_METRIC_OPTIONS).filter(([metricKey]) => !draftRdDashboardMetricKeys.includes(metricKey)),
    [draftRdDashboardMetricKeys]
  )
  const userAvatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.user_metadata?.full_name || user?.email || 'Usuario')}&background=0D8ABC&color=fff`
  const userAvatarSrc = user?.user_metadata?.avatar_url || userAvatarFallback

  if (userLoading || !hasLoadedPreferences) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'white' }}>Carregando painel...</div>
  }

  return (
    <div className="dashboard-container">
      <aside className={`sidebar glass-panel ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Ocultar barra lateral'}
          title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Ocultar barra lateral'}
        >
          <i className={`bx ${isSidebarCollapsed ? 'bx-chevron-right' : 'bx-chevron-left'}`}></i>
        </button>

        <div className="sidebar-top">
          <div className="logo">
            <i className="bx bx-bar-chart-alt-2"></i>
            {!isSidebarCollapsed && <span>Dash</span>}
          </div>
        </div>

        <nav className="nav-menu">
          {canManageClients && (
            <button type="button" data-tooltip="Clientes" className={`nav-item nav-button ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
              <i className="bx bxs-buildings"></i> Clientes
            </button>
          )}
          {canManageClients && (
            <button type="button" data-tooltip="Integrações" className={`nav-item nav-button ${activeTab === 'integracoes' ? 'active' : ''}`} onClick={() => setActiveTab('integracoes')}>
              <i className="bx bx-plug"></i> Integrações
            </button>
          )}
          <button type="button" data-tooltip="Apresentação" className={`nav-item nav-button ${activeTab === 'apresentacao' ? 'active' : ''}`} onClick={() => setActiveTab('apresentacao')}>
            <i className="bx bxs-dashboard"></i> Apresentação
          </button>
          {canManageUsers && (
            <button type="button" data-tooltip="Usuários" className={`nav-item nav-button ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => setActiveTab('usuarios')}>
              <i className="bx bxs-user-detail"></i> Usuários
            </button>
          )}
        </nav>

        {!isSidebarCollapsed && (
          <div className="sidebar-client glass-item">
            <span className="sidebar-client-label">Cliente ativo</span>
            <strong>{activeClient?.name || 'Nenhum cliente selecionado'}</strong>
          </div>
        )}

        <div className="user-profile">
          <img
            src={userAvatarSrc}
            alt="Usuário"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = userAvatarFallback
            }}
          />
          {!isSidebarCollapsed && (
            <div className="user-info">
              <p className="name">{user?.user_metadata?.full_name || user?.email || 'Usuário'}</p>
              <p className="role">{role}</p>
              <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0, textAlign: 'left', marginTop: '2px' }}>
                Sair da plataforma
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={`main-content ${isSidebarCollapsed ? 'main-content-expanded' : ''}`}>
        <header className="header" style={{ alignItems: 'flex-start' }}>
          <div className="page-title">
            <h1>
              {activeTab === 'clientes' && 'Base de clientes'}
              {activeTab === 'integracoes' && 'Integrações gerais'}
              {activeTab === 'apresentacao' && `Dashboard ${activeClient?.name || 'do cliente'}`}
              {activeTab === 'usuarios' && 'Gestão de usuários'}
            </h1>
            <p>
              {activeTab === 'clientes' && 'Cadastre seus clientes e mantenha cada operação separada dentro do dashboard.'}
              {activeTab === 'integracoes' && 'Cadastre aqui as credenciais centrais da operação. Nos clientes, você escolhe apenas as contas referentes a cada um.'}
              {activeTab === 'apresentacao' && 'Uma visão executiva consolidada dos principais resultados do cliente, organizada por fonte de dados.'}
              {activeTab === 'usuarios' && 'Defina quem pode visualizar dashboards, editar integrações e acessar clientes específicos.'}
            </p>
          </div>

          <div className="header-actions header-actions-wrap">
            {activeTab === 'apresentacao' && (
              <>
                <div className="date-picker glass-item">
                  <i className="bx bx-user-pin"></i>
                  <select value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)}>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeClient && activeDraftDashboardTemplates.length > 0 && (
                  <>
                    <div className="date-picker glass-item">
                      <i className="bx bx-layout"></i>
                      <select value={draftDashboardTemplateId || activeDraftDashboardTemplateId} onChange={(event) => handleDashboardTemplateChange(event.target.value)}>
                        {activeDraftDashboardTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button type="button" onClick={handleSaveDashboardTemplate} className="btn btn-secondary">
                      <i className="bx bx-bookmark-plus"></i>
                      Salvar modelo
                    </button>
                  </>
                )}

                {draftDateRange === 'custom' && (
                  <div className="date-picker glass-item custom-range">
                    <input type="date" value={draftCustomSince} onChange={(event) => setDraftCustomSince(event.target.value)} />
                    <span>até</span>
                    <input type="date" value={draftCustomUntil} onChange={(event) => setDraftCustomUntil(event.target.value)} />
                  </div>
                )}

                <div className="date-picker glass-item">
                  <i className="bx bx-calendar"></i>
                  <select value={draftDateRange} onChange={(event) => setDraftDateRange(event.target.value)}>
                    {DATE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button onClick={exportPDF} disabled={isExporting} className="btn btn-primary">
                  <i className={isExporting ? 'bx bx-loader-alt bx-spin' : 'bx bx-export'}></i>
                  {isExporting ? 'Gerando PDF...' : 'Exportar PDF'}
                </button>
              </>
            )}
          </div>
        </header>

        {activeTab === 'clientes' && (
          <section className="clients-layout">
            <div className="glass-panel clients-intro">
              <h2>Organize sua operação por cliente</h2>
              <p>
                Aqui você edita o cliente inteiro: contas vinculadas, cor da dashboard e logo que vai aparecer na apresentação final.
              </p>
            </div>

            <form className="glass-panel client-create-bar" onSubmit={handleCreateClient}>
              <div>
                <h3>Novo cliente</h3>
                <p>Crie um cliente e depois ajuste a configuração dele logo abaixo.</p>
              </div>
              <div className="client-create-inline">
                <input type="text" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Ex.: Clínica X, E-commerce Y..." disabled={!isMaster} />
                <button type="submit" className="btn btn-primary" disabled={!isMaster}>Adicionar cliente</button>
              </div>
            </form>

            <div className="clients-grid clients-grid-single">
              <div className="glass-panel users-toolbar-card">
                <div className="user-picker-head">
                  <div>
                    <h3>Clientes cadastrados</h3>
                    <p>Abra a edição de um cliente somente quando precisar ajustar contas, identidade ou integrações.</p>
                  </div>
                </div>

                <div className="user-directory-grid client-directory-grid">
                  {clients.map((client) => (
                    <div key={client.id} className={`user-directory-card glass-item ${client.id === activeClientId ? 'client-directory-card-active' : ''}`}>
                      <div className="user-directory-main">
                        <strong>{client.name}</strong>
                        <span>{client.metaAdAccountId || 'Conta Meta não selecionada'}</span>
                      </div>
                      <div className="user-directory-meta">
                        <span className="user-role-badge">{client.dashboardColor || 'blue'}</span>
                        <small>{client.logoUrl ? 'Logo configurada' : 'Sem logo configurada'}</small>
                      </div>
                      <div className="user-directory-actions client-directory-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setActiveClientId(client.id)
                            setIsEditClientModalOpen(true)
                          }}
                        >
                          Editar
                        </button>
                        {isMaster && clients.length > 1 && (
                          <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClient(client.id)}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!clients.length && (
                  <div className="empty-panel glass-item users-empty-state compact-empty-state">
                    <h3>Nenhum cliente encontrado</h3>
                    <p>Crie um cliente novo para começar a configurar a operação.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'clientes' && isEditClientModalOpen && activeClient && (
          <div className="modal-overlay" onClick={() => setIsEditClientModalOpen(false)}>
            <div className="modal-card modal-card-wide glass-panel" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Editar cliente</h3>
                  <p>Atualize identidade, contas vinculadas e integrações específicas desse cliente.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setIsEditClientModalOpen(false)} aria-label="Fechar edição de cliente">
                  <i className="bx bx-x"></i>
                </button>
              </div>

              <form className="client-editor-card modal-client-editor" onSubmit={handleSaveIntegrations}>
                <div className="client-editor-header">
                  <div>
                    <h3>Editando: {activeClient.name}</h3>
                    <p>Qualquer ajuste aqui já define como a dash desse cliente vai abrir.</p>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isSavingIntegrations || !canManageClients}>
                    {isSavingIntegrations ? 'Salvando...' : 'Salvar cliente'}
                  </button>
                </div>

                <div className="integration-block client-identity-block">
                  <div className="integration-heading">
                    <div className="integration-icon" style={{ color: currentTheme.main, borderColor: `${currentTheme.main}33` }}>
                      <i className="bx bx-id-card"></i>
                    </div>
                    <div>
                      <h3>Identidade do cliente</h3>
                      <p>Defina nome, cor e logo para organizar a conta e personalizar a apresentação final.</p>
                    </div>
                  </div>

                  <div className="branding-grid">
                    <div className="input-group">
                      <label>Nome do cliente</label>
                      <input type="text" value={activeClient.name} onChange={(event) => handleClientFieldChange('name', event.target.value)} placeholder="Nome do cliente" />
                    </div>

                    <div className="input-group">
                      <label>Cor da dashboard</label>
                      <select
                        className="client-select-input"
                        value={activeClient.dashboardColor || 'blue'}
                        onChange={(event) => {
                          handleClientFieldChange('dashboardColor', event.target.value)
                          setThemeColor(event.target.value)
                        }}
                      >
                        <option value="blue">Azul</option>
                        <option value="emerald">Esmeralda</option>
                        <option value="orange">Laranja</option>
                        <option value="rose">Rosa</option>
                        <option value="slate">Ciano</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label>Logo do cliente</label>
                      <input type="file" accept="image/*" onChange={handleClientLogoUpload} />
                    </div>

                    <div className="input-group">
                      <label>Ou cole a URL da logo</label>
                      <input type="text" value={activeClient.logoUrl || ''} onChange={(event) => handleClientFieldChange('logoUrl', event.target.value)} placeholder="https://..." />
                    </div>
                  </div>

                  <div className="logo-preview">
                    {activeClient.logoUrl ? <img src={activeClient.logoUrl} alt={`Logo ${activeClient.name}`} /> : <span>Sem logo definida</span>}
                  </div>
                </div>

                <div className="form-grid">
                  <div className="integration-block">
                    <div className="integration-heading">
                      <div className="integration-icon" style={{ color: '#0668E1', borderColor: '#0668E133' }}>
                        <i className="bx bxl-meta"></i>
                      </div>
                      <div>
                        <h3>Meta Ads</h3>
                        <p>Selecione a conta de anúncio deste cliente usando a credencial global cadastrada em Integrações.</p>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>Conta do Meta vinculada ao cliente</label>
                      <select
                        className="client-select-input"
                        value={activeClient.metaAdAccountId || ''}
                        onChange={(event) => handleClientFieldChange('metaAdAccountId', event.target.value)}
                      >
                        <option value="">
                          {globalIntegrations.metaAccessToken ? 'Selecione uma conta' : 'Cadastre a chave da Meta em Integrações'}
                        </option>
                        {adAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name ? `${account.name} (${account.id})` : account.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {CLIENT_INTEGRATION_GROUPS.map((group) => (
                    <div key={group.title} className="integration-block">
                      <div className="integration-heading">
                        <div className="integration-icon" style={{ color: group.accent, borderColor: `${group.accent}33` }}>
                          <i className={`bx ${group.icon}`}></i>
                        </div>
                        <div>
                          <h3>{group.title}</h3>
                          <p>{group.description}</p>
                        </div>
                      </div>

                      {group.fields.map((field) => {
                        const value = field.storage === 'client' ? activeClient[field.name] || '' : activeIntegrations[field.name] || ''

                        return (
                          <div key={field.name} className="input-group">
                            <label>{field.label}</label>
                            <input
                              type={field.type}
                              value={value}
                              onChange={(event) => handleIntegrationChange(field.name, event.target.value, field.storage)}
                              placeholder={field.placeholder}
                            />
                          </div>
                        )
                      })}

                      {group.title === 'RD Station' && (
                        <div className="qualification-config">
                          <button
                            type="button"
                            className="qualification-toggle"
                            onClick={() => setIsQualifiedStagesVisible((current) => !current)}
                          >
                            <div>
                              <strong>Etapas qualificadas do pipeline</strong>
                              <span>Configuração operacional usada nos cálculos de qualificação e taxas do CRM. Não aparece no dashboard final.</span>
                            </div>
                            <i className={`bx ${isQualifiedStagesVisible ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                          </button>

                          {isQualifiedStagesVisible && (
                            <div className="qualification-panel">
                              <p className="field-helper">
                                Selecione as etapas que você considera qualificadas. Os cálculos em cascata do CRM passam a usar essa definição automaticamente.
                              </p>
                              <div className="stage-selector">
                                {rdSummary?.availableStages?.length ? (
                                  rdSummary.availableStages.map((stage) => {
                                    const checked = selectedQualifiedStages.includes(stage)

                                    return (
                                      <label key={stage} className={`stage-chip ${checked ? 'active' : ''}`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => handleQualifiedStageToggle(stage)}
                                        />
                                        <span>{stage}</span>
                                      </label>
                                    )
                                  })
                                ) : (
                                  <div className="stage-empty">
                                    Salve o token do RD e aguarde a leitura das negociações para listar automaticamente as etapas do pipeline.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'integracoes' && canManageClients && (
          <section className="clients-layout">
            <div className="glass-panel clients-intro">
              <h2>Integrações da operação</h2>
              <p>Aqui ficam as credenciais globais. A Meta abastece todos os clientes e, dentro de cada cliente, você escolhe só a conta de anúncio correspondente.</p>
            </div>

            <div className="glass-panel client-editor-card">
              <div className="client-editor-header">
                <div>
                  <h3>Credenciais globais da operação</h3>
                  <p>Cadastre aqui as chaves centrais. Nos clientes, você mantém apenas a seleção das contas vinculadas a cada operação.</p>
                </div>
              </div>

              <div className="form-grid">
                {GLOBAL_INTEGRATION_GROUPS.map((group) => (
                  <div key={group.title} className="integration-block">
                    <div className="integration-heading">
                      <div className="integration-icon" style={{ color: group.accent, borderColor: `${group.accent}33` }}>
                        <i className={`bx ${group.icon}`}></i>
                      </div>
                      <div>
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>{group.field.label}</label>
                      <input
                        type="password"
                        value={globalIntegrations[group.field.name] || ''}
                        onChange={(event) => handleGlobalIntegrationChange(group.field.name, event.target.value)}
                        placeholder={group.field.placeholder}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'usuarios' && canManageUsers && (
          <section className="clients-layout users-management-layout">
            <div className="glass-panel users-toolbar-card">
              <div className="user-picker-head">
                <div>
                  <h3>Usuários cadastrados</h3>
                  <p>Use a busca para encontrar um acesso e abra a edição em um pop-up, sem ocupar a tela principal.</p>
                </div>
                <div className="users-toolbar-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setIsCreateUserModalOpen(true)}>
                    Novo usuário
                  </button>
                </div>
              </div>

              <div className="users-search-row">
                <div className="input-group users-search-field">
                  <label>Buscar usuário</label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Nome ou e-mail"
                  />
                </div>
              </div>

              {usersLoading ? (
                <div className="empty-panel glass-item">
                  <h3>Carregando usuários</h3>
                  <p>Estamos buscando os acessos liberados neste workspace.</p>
                </div>
              ) : (
                <div className="user-directory-grid">
                  {filteredUsers.map((managedUser) => (
                    <div key={`user-list-${managedUser.id}`} className="user-directory-card glass-item">
                      <div className="user-directory-main">
                        <strong>{managedUser.full_name || managedUser.email}</strong>
                        <span>{managedUser.email}</span>
                      </div>
                      <div className="user-directory-meta">
                        <span className="user-role-badge">{roleLabels[managedUser.role] || managedUser.role}</span>
                        <small>
                          {managedUser.role === 'master'
                            ? 'Acesso total'
                            : `${managedUser.clientAccess?.length || 0} dashboard(s) liberado(s)`}
                        </small>
                      </div>
                      <div className="user-directory-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedUserId(managedUser.id)
                            setIsEditUserModalOpen(true)
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!usersLoading && !filteredUsers.length && (
                <div className="empty-panel glass-item users-empty-state compact-empty-state">
                  <h3>Nenhum usuário encontrado</h3>
                  <p>Ajuste a busca ou crie um novo acesso para o workspace.</p>
                </div>
              )}
            </div>

            {isCreateUserModalOpen && (
              <div className="modal-overlay" onClick={() => setIsCreateUserModalOpen(false)}>
                <div className="modal-card glass-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <h3>Novo usuário</h3>
                      <p>Cadastre um novo acesso e defina exatamente quais dashboards ele poderá enxergar.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => setIsCreateUserModalOpen(false)} aria-label="Fechar cadastro de usuário">
                      <i className="bx bx-x"></i>
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser}>
                    <div className="form-grid user-admin-grid">
                      <div className="input-group">
                        <label>Nome</label>
                        <input type="text" value={userForm.fullName} onChange={(event) => setUserForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nome completo" />
                      </div>
                      <div className="input-group">
                        <label>E-mail</label>
                        <input type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@empresa.com" />
                      </div>
                      <div className="input-group">
                        <label>Senha inicial</label>
                        <input type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} placeholder="Senha provisória" />
                      </div>
                      <div className="input-group">
                        <label>Nível liberado</label>
                        <select className="client-select-input" value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
                          <option value="visualizador">Visualizador</option>
                          <option value="operador">Operador</option>
                          <option value="cliente">Cliente</option>
                          <option value="master">Master</option>
                        </select>
                      </div>
                    </div>

                    {userForm.role !== 'master' && (
                      <div className="input-group">
                        <label>Dashboards liberados</label>
                        <div className="stage-selector">
                          {clients.map((client) => (
                            <label key={`new-user-${client.id}`} className={`stage-chip ${userForm.clientIds.includes(client.id) ? 'active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={userForm.clientIds.includes(client.id)}
                                onChange={() => handleUserClientToggle(client.id)}
                              />
                              <span>{client.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setIsCreateUserModalOpen(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={savingUser}>
                        {savingUser ? 'Criando...' : 'Adicionar usuário'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {isEditUserModalOpen && selectedManagedUser && (
              <div className="modal-overlay" onClick={() => setIsEditUserModalOpen(false)}>
                <div className="modal-card glass-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <h3>Editar usuário</h3>
                      <p>Ajuste nível, dashboards liberados e demais permissões deste acesso.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => setIsEditUserModalOpen(false)} aria-label="Fechar edição de usuário">
                      <i className="bx bx-x"></i>
                    </button>
                  </div>

                  <div className="user-admin-head">
                    <div>
                      <strong>{selectedManagedUser.full_name || selectedManagedUser.email}</strong>
                      <span>{selectedManagedUser.email}</span>
                    </div>
                    {selectedManagedUser.id !== user?.id && (
                      <button type="button" className="btn btn-secondary" onClick={() => handleDeleteUser(selectedManagedUser.id)}>
                        Excluir
                      </button>
                    )}
                  </div>

                  <div className="form-grid user-admin-grid">
                    <div className="input-group">
                      <label>Nome</label>
                      <input
                        type="text"
                        value={selectedManagedUser.full_name || ''}
                        onChange={(event) =>
                          handleManagedUserChange(selectedManagedUser.id, (item) => ({ ...item, full_name: event.target.value }))
                        }
                      />
                    </div>
                    <div className="input-group">
                      <label>Nível</label>
                      <select
                        className="client-select-input"
                        value={selectedManagedUser.role}
                        onChange={(event) =>
                          handleManagedUserChange(selectedManagedUser.id, (item) => ({ ...item, role: event.target.value }))
                        }
                      >
                        <option value="visualizador">Visualizador</option>
                        <option value="operador">Operador</option>
                        <option value="cliente">Cliente</option>
                        <option value="master">Master</option>
                      </select>
                    </div>
                  </div>

                  {selectedManagedUser.role !== 'master' && (
                    <div className="input-group">
                      <label>Dashboards liberados</label>
                      <div className="stage-selector">
                        {clients.map((client) => {
                          const currentAccess = selectedManagedUser.clientAccess || []
                          const hasClient = currentAccess.some((item) => item.client_id === client.id)

                          return (
                            <label key={`${selectedManagedUser.id}-${client.id}`} className={`stage-chip ${hasClient ? 'active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={hasClient}
                                onChange={() =>
                                  handleManagedUserChange(selectedManagedUser.id, (item) => {
                                    const nextAccess = hasClient
                                      ? currentAccess.filter((accessItem) => accessItem.client_id !== client.id)
                                      : [
                                          ...currentAccess,
                                          {
                                            client_id: client.id,
                                            can_view: true,
                                            can_edit: item.role === 'operador',
                                          },
                                        ]

                                    return { ...item, clientAccess: nextAccess }
                                  })
                                }
                              />
                              <span>{client.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="modal-foot">
                    <span className="form-note">
                      {selectedManagedUser.role === 'master' && 'Acesso total: usuários, clientes e integrações.'}
                      {selectedManagedUser.role === 'operador' && 'Pode editar integrações e clientes liberados.'}
                      {selectedManagedUser.role === 'visualizador' && 'Pode apenas visualizar os dashboards liberados.'}
                      {selectedManagedUser.role === 'cliente' && 'Acesso externo focado só nos dashboards atribuídos.'}
                    </span>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setIsEditUserModalOpen(false)}>
                        Cancelar
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => handleUpdateUser(selectedManagedUser)}>
                        Salvar acesso
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'apresentacao' && (
          <div ref={dashboardRef}>
            <section className="glass-panel hero-panel">
              <div className="hero-copy">
                {activeClient?.logoUrl && (
                  <div className="hero-logo-wrap">
                    <img src={activeClient.logoUrl} alt={`Logo ${activeClient.name}`} className="hero-logo" />
                  </div>
                )}
                <span className="hero-badge" style={{ color: currentTheme.main, borderColor: currentTheme.main }}>
                  {`Dashboard ${activeClient?.name || 'do cliente'}`}
                </span>
                <h2>{activeClient?.name || 'Selecione um cliente'}</h2>
                <p>
                  A seguir, apresentamos um panorama consolidado do período selecionado, separando os dados por origem para facilitar a leitura executiva da operação.
                </p>
              </div>
              <div className="hero-meta">
                {!hasAnyPresentationData ? (
                  <div className="hero-stat hero-stat-empty">
                    <span>Nenhuma integração ativa</span>
                    <strong>Cadastre uma operação em Clientes</strong>
                  </div>
                ) : (
                  <>
                    {hasMetaConfigured && (
                      <div className="hero-stat">
                        <span>Conta de anúncio</span>
                        <strong>{selectedAdAccount || 'Defina a conta do cliente'}</strong>
                      </div>
                    )}
                    {Boolean([
                      activeClient?.googleAdsAccountId,
                      activeClient?.tiktokAdsAccountId,
                      activeClient?.linkedInAdsAccountId,
                    ].filter(Boolean).length) && (
                      <div className="hero-stat">
                        <span>Outras contas de anúncio</span>
                        <strong>{[
                          activeClient?.googleAdsAccountId,
                          activeClient?.tiktokAdsAccountId,
                          activeClient?.linkedInAdsAccountId,
                        ].filter(Boolean).length} conta(s) vinculada(s)</strong>
                      </div>
                    )}
                    {hasRdConfigured && (
                      <>
                        <div className="hero-stat">
                          <span>CRM</span>
                          <strong>{activeClient?.rdStationAccountId || 'Token configurado para este cliente'}</strong>
                        </div>
                        <div className="hero-stat">
                          <span>Vendedor</span>
                          <div className="hero-select-wrap">
                            <select value={draftRdSellerFilter} onChange={(event) => setDraftRdSellerFilter(event.target.value)} className="hero-select">
                              <option value="all">Todos os vendedores</option>
                              {(rdSummary?.sellers || []).map((seller) => (
                                <option key={seller.id} value={seller.id}>
                                  {seller.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            {errorMessage && <div className="feedback-banner">{errorMessage}</div>}

            {!activeClient ? (
              !canViewDashboard ? (
              <div className="empty-panel glass-panel">
                <h3>Aguardando liberação</h3>
                <p>Seu usuário já existe, mas ainda não recebeu acesso a nenhum workspace ou dashboard. Peça ao master para liberar sua conta.</p>
              </div>
            ) : (
              <div className="empty-panel glass-panel">
                <h3>Crie um cliente primeiro</h3>
                <p>Use a aba de clientes para adicionar sua operação antes de abrir a apresentação.</p>
              </div>
            )
            ) : isLoading ? (
              <div className="empty-panel glass-panel">
                <h3>Sincronizando com as APIs</h3>
                <p>Estamos puxando os dados configurados para {activeClient.name}.</p>
              </div>
            ) : !hasAnyPresentationData ? (
              <div className="empty-panel glass-panel">
                <h3>Defina a operação do cliente</h3>
                <p>Cadastre ao menos uma integração do cliente para liberar a apresentação dinâmica da operação.</p>
                <button type="button" className="btn btn-primary" onClick={() => setActiveTab('clientes')}>
                  Abrir clientes
                </button>
              </div>
            ) : (
              <>
                {hasMetaConfigured && (
                  <section className="source-section">
                    <div className="source-section-header">
                      <div className="source-section-badge" style={{ color: '#0668E1', borderColor: '#0668E1' }}>
                        <i className="bx bxl-meta"></i>
                        <span>Meta Ads</span>
                      </div>
                      <p className="source-section-copy">Primeiro bloco de leitura das contas de anúncio e da performance de mídia.</p>
                    </div>
                <section className="glass-panel meta-filter-panel">
                  <div className="meta-filter-panel-head">
                    <div>
                      <span className="meta-filter-kicker">Leitura por objetivo</span>
                      <h2>Filtro por tipo de resultado</h2>
                      <p className="chart-subtitle">O relatório considera apenas campanhas que geraram o tipo de resultado selecionado.</p>
                    </div>
                    <span className="meta-filter-helper">Todos começam marcados por padrão.</span>
                  </div>
                  <div className="stage-selector meta-filter-chip-row">
                    {availableMetaResultFilters.map((filter) => (
                      <label key={filter.key} className={`stage-chip ${normalizedDraftMetaResultFilters.includes(filter.key) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={normalizedDraftMetaResultFilters.includes(filter.key)}
                          onChange={() => handleMetaResultFilterToggle(filter.key)}
                        />
                        <span>{filter.label}</span>
                      </label>
                    ))}
                  </div>
                  {availableMetaCampaignOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaCampaignFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaCampaignFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por campanha</h3>
                          <p>{metaCampaignFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaCampaignFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaCampaignFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Selecione as campanhas específicas que quer considerar. Todas começam marcadas por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {availableMetaCampaignOptions.map((campaign) => (
                              <label key={campaign.id} className={`stage-chip ${activeDraftMetaCampaignIds.includes(campaign.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaCampaignIds.includes(campaign.id)}
                                  onChange={() => handleMetaCampaignFilterToggle(campaign.id)}
                                />
                                <span>{campaign.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {draftAvailableMetaAdsetOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaAdsetFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaAdsetFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por conjunto</h3>
                          <p>{metaAdsetFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaAdsetFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaAdsetFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Os conjuntos seguem a campanha selecionada. Todos começam marcados por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {draftAvailableMetaAdsetOptions.map((adset) => (
                              <label key={adset.id} className={`stage-chip ${activeDraftMetaAdsetIds.includes(adset.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaAdsetIds.includes(adset.id)}
                                  onChange={() => handleMetaAdsetFilterToggle(adset.id)}
                                />
                                <span>{adset.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {draftAvailableMetaAdOptions.length > 0 && (
                    <div className="meta-campaign-filter-collapsible">
                      <button
                        type="button"
                        className={`meta-campaign-filter-trigger ${isMetaAdFilterOpen ? 'open' : ''}`}
                        onClick={() => setIsMetaAdFilterOpen((current) => !current)}
                      >
                        <div>
                          <h3>Filtrar por anúncio</h3>
                          <p>{metaAdFilterSummary}</p>
                        </div>
                        <span className="meta-campaign-filter-trigger-icon">
                          <i className={`bx ${isMetaAdFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                        </span>
                      </button>
                      {isMetaAdFilterOpen && (
                        <div className="rd-source-filter-bar rd-source-filter-inline meta-campaign-filter-block">
                          <p className="meta-campaign-filter-note">
                            Os anúncios seguem campanha e conjunto selecionados. Todos começam marcados por padrão.
                          </p>
                          <div className="stage-selector meta-filter-chip-row">
                            {draftAvailableMetaAdOptions.map((ad) => (
                              <label key={ad.id} className={`stage-chip ${activeDraftMetaAdIds.includes(ad.id) ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={activeDraftMetaAdIds.includes(ad.id)}
                                  onChange={() => handleMetaAdFilterToggle(ad.id)}
                                />
                                <span>{ad.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <section className="glass-panel grouped-results">
                  <div className="section-header section-header-stack section-header-with-action">
                    <div>
                      <h2>Resumo de resultados</h2>
                      <p className="chart-subtitle">Os indicadores abaixo consideram somente as campanhas enquadradas no filtro de resultado ativo.</p>
                    </div>
                    {activeDraftDashboardTemplate && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsMetaMetricLibraryOpen((current) => !current)}
                        disabled={!availableMetaDashboardMetricOptions.length}
                      >
                        <i className="bx bx-plus"></i>
                        Adicionar métrica
                      </button>
                    )}
                  </div>

                  {(metaDashboardMetricCards.length > 0 || isMetaMetricLibraryOpen) && (
                    <div className="template-metrics-shell">
                      {metaDashboardMetricCards.length > 0 && (
                        <div className="kpi-grid compact-kpi-grid template-metrics-grid">
                          {metaDashboardMetricCards.map((metric) => (
                            <div key={metric.key} className="kpi-card glass-panel template-metric-card">
                              <div className="kpi-header">
                                <span className="kpi-title">{metric.title}</span>
                                <div className="template-metric-actions">
                                  <div className={`icon-box ${metric.tone}`}>
                                    <i className={`bx ${metric.icon}`}></i>
                                  </div>
                                  <button
                                    type="button"
                                    className="template-metric-remove"
                                    onClick={() => handleRemoveMetaDashboardMetric(metric.key)}
                                    aria-label={`Remover ${metric.title}`}
                                  >
                                    <i className="bx bx-x"></i>
                                  </button>
                                </div>
                              </div>
                              <div className="kpi-value">{metric.value}</div>
                              <div className="kpi-trend neutral">
                                <i className="bx bx-check-circle"></i>
                                <span>{metric.description}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {isMetaMetricLibraryOpen && (
                        <div className="metric-library-panel glass-item">
                          <div>
                            <strong>Métricas Meta disponíveis</strong>
                            <p>Essas métricas já vêm da API e podem entrar neste modelo do dashboard.</p>
                          </div>
                          <div className="metric-library-list">
                            {availableMetaDashboardMetricOptions.length > 0 ? (
                              availableMetaDashboardMetricOptions.map(([metricKey, metric]) => (
                                <button
                                  key={metricKey}
                                  type="button"
                                  className="metric-library-chip"
                                  onClick={() => handleAddMetaDashboardMetric(metricKey)}
                                >
                                  <span>{metric.label}</span>
                                  <small>{metric.description}</small>
                                </button>
                              ))
                            ) : (
                              <div className="metric-library-empty">Todas as métricas da Meta já estão visíveis neste modelo.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="result-group">
                    <div className="result-group-head">
                      <h3>Mídia e distribuição</h3>
                      <p>Visão geral do investimento e da entrega da campanha.</p>
                    </div>
                    <div className="kpi-grid compact-kpi-grid">
                      {mediaKpis.map((kpi) => (
                        <div key={kpi.title} className="kpi-card glass-panel">
                          <div className="kpi-header">
                            <span className="kpi-title">{kpi.title}</span>
                            <div className={`icon-box ${kpi.tone}`}>
                              <i className={`bx ${kpi.icon}`}></i>
                            </div>
                          </div>
                          <div className="kpi-value">{kpi.value}</div>
                          <div className="kpi-trend neutral">
                            <i className="bx bx-check-circle"></i>
                            <span>Atualizado conforme o período selecionado</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {conversionGroups.length > 0 && (
                    <div className="conversion-groups-grid">
                      {conversionGroups.map((group) => (
                        <div key={group.title} className="glass-panel conversion-group-card">
                          <div className="conversion-group-head">
                            <div className={`icon-box ${group.tone}`}>
                              <i className={`bx ${group.icon}`}></i>
                            </div>
                            <div>
                              <h3>{group.title}</h3>
                              <p>{group.subtitle}</p>
                            </div>
                          </div>
                          <div className="conversion-stats">
                            {group.stats.map((stat) => (
                              <div key={stat.label} className="conversion-stat">
                                <span>{stat.label}</span>
                                <strong>{stat.value}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </section>

                <section className="charts-section">
                  <div className="chart-container glass-panel main-chart">
                    <div className="chart-header chart-header-stack">
                      <div>
                        <h2>Evolução das métricas</h2>
                        <p className="chart-subtitle">Escolha as métricas que quer mostrar na apresentação desse cliente.</p>
                      </div>
                      <div className="chart-legend-custom">
                        <span className="legend-item">
                          <span className="dot" style={{ background: currentTheme.main, boxShadow: `0 0 8px ${currentTheme.main}` }}></span>
                          <select className="chart-metric-select" value={metric1} onChange={(event) => setMetric1(event.target.value)}>
                            {Object.entries(METRIC_OPTIONS).map(([key, metric]) => (
                              <option key={`metric-1-${key}`} value={key}>{metric.label}</option>
                            ))}
                          </select>
                        </span>
                        <span className="legend-item">
                          <span className="dot emerald"></span>
                          <select className="chart-metric-select" value={metric2} onChange={(event) => setMetric2(event.target.value)}>
                            {Object.entries(METRIC_OPTIONS).map(([key, metric]) => (
                              <option key={`metric-2-${key}`} value={key}>{metric.label}</option>
                            ))}
                          </select>
                        </span>
                      </div>
                    </div>
                    <div className="canvas-wrapper">
                      <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                  </div>

                  <div className="chart-container glass-panel secondary-chart">
                    <div className="chart-header chart-header-stack">
                      <div>
                        <h2>Distribuição de resultados</h2>
                        <p className="chart-subtitle">Leitura rápida do resultado da operação Meta desse cliente.</p>
                      </div>
                    </div>
                    <div className="canvas-wrapper donut-wrapper">
                      <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                    </div>
                  </div>
                </section>

                <section className="glass-panel funnel-section">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Funil de métricas</h2>
                      <p className="chart-subtitle">Arraste as métricas para montar a jornada manualmente. O sistema calcula a taxa de uma etapa para outra automaticamente.</p>
                    </div>
                  </div>

                  <div className="funnel-builder">
                    <div className="funnel-library">
                      <h3>Métricas disponíveis</h3>
                      <div className="funnel-chip-list">
                        {availableFunnelMetrics.map(([key, metric]) => (
                          <button
                            key={key}
                            type="button"
                            className="funnel-chip"
                            draggable
                            onDragStart={() => handleFunnelDragStart(key)}
                            onClick={() => replaceDraftFunnelSteps([...activeDraftFunnelSteps, key])}
                          >
                            <i className="bx bx-move"></i>
                            {metric.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="funnel-dropzone"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleFunnelDrop(activeDraftFunnelSteps.length)}
                    >
                      {funnelCards.length === 0 ? (
                        <div className="funnel-empty">
                          Arraste métricas para cá para montar o funil do cliente.
                        </div>
                      ) : (
                        <div className="funnel-steps">
                          {funnelCards.map((step, index) => (
                            <React.Fragment key={step.key}>
                              <div
                                className="funnel-step"
                                draggable
                                onDragStart={() => handleFunnelDragStart(step.key, index)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => handleFunnelDrop(index)}
                              >
                                <div className="funnel-step-head">
                                  <span className="funnel-step-label">{step.label}</span>
                                  <button type="button" className="funnel-remove" onClick={() => handleRemoveFunnelStep(step.key)}>
                                    Remover
                                  </button>
                                </div>
                                <strong>{step.formattedValue}</strong>
                              </div>

                              {index < funnelCards.length - 1 && (
                                <div className="funnel-connector">
                                  <span>{funnelCards[index + 1]?.conversionRate === null ? 'Sem base anterior' : `${funnelCards[index + 1]?.conversionRate.toFixed(2).replace('.', ',')}% de conversão`}</span>
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rankings-grid">
                  <div className="glass-panel ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Top 5 por cidades</h2>
                        <p className="chart-subtitle">Ranking com base nas conversões da conta Meta do cliente.</p>
                      </div>
                    </div>
                    <div className="ranking-list">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking de cidades...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : breakdowns.cities.length === 0 ? (
                        <div className="ranking-empty">Sem dados por cidade para o período.</div>
                      ) : (
                        breakdowns.cities.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="ranking-row">
                            <div>
                              <strong>{item.label}</strong>
                              <span>{formatNumber(item.custom_metrics?.totalConversions || 0)} conversões</span>
                            </div>
                            <b>{formatCurrency(item.spend)}</b>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="glass-panel ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Top 5 por criativos</h2>
                        <p className="chart-subtitle">Os criativos com melhor resultado dentro do período selecionado.</p>
                      </div>
                    </div>
                    <div className="ranking-list">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking de criativos...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : breakdowns.creatives.length === 0 ? (
                        <div className="ranking-empty">Sem dados por criativo para o período.</div>
                      ) : (
                        breakdowns.creatives.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="ranking-row">
                            <div className="creative-ranking-main">
                              <div className="creative-thumb">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.label} />
                                ) : (
                                  <span>Sem imagem</span>
                                )}
                              </div>
                              <div>
                                <strong>{item.label}</strong>
                                <span>{formatNumber(item.custom_metrics?.totalConversions || 0)} conversões</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="glass-panel ranking-card">
                    <div className="section-header section-header-stack">
                      <div>
                        <h2>Resultado por idade</h2>
                        <p className="chart-subtitle">Faixas etárias com melhor performance no período.</p>
                      </div>
                    </div>
                    <div className="ranking-list">
                      {isRankingsLoading ? (
                        <div className="ranking-empty">Carregando ranking por idade...</div>
                      ) : rankingsError ? (
                        <div className="ranking-empty">{rankingsError}</div>
                      ) : breakdowns.ages.length === 0 ? (
                        <div className="ranking-empty">Sem dados por idade para o período.</div>
                      ) : (
                        breakdowns.ages.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="ranking-row">
                            <div>
                              <strong>{item.label}</strong>
                              <span>{formatNumber(item.custom_metrics?.totalConversions || 0)} conversões</span>
                            </div>
                            <b>{formatPercent(item.clicks > 0 ? (item.custom_metrics?.totalConversions || 0) / item.clicks * 100 : 0)}</b>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="campaigns-section glass-panel">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Campanhas do cliente ({filteredCampaigns.length})</h2>
                      <p className="chart-subtitle">Tabela pronta para reunião, com base na conta Meta vinculada a {activeClient.name}.</p>
                    </div>
                    <div className="campaign-filters">
                      <div className="search-box">
                        <i className="bx bx-search"></i>
                        <input type="text" placeholder="Buscar campanha" value={campaignSearch} onChange={(event) => setCampaignSearch(event.target.value)} />
                      </div>
                      <div className="date-picker glass-item compact-filter">
                        <i className="bx bx-filter-alt"></i>
                        <select value={campaignStatusFilter} onChange={(event) => setCampaignStatusFilter(event.target.value)}>
                          <option value="all">Todos os status</option>
                          <option value="ACTIVE">Ativas</option>
                          <option value="PAUSED">Pausadas</option>
                          <option value="ARCHIVED">Arquivadas</option>
                        </select>
                      </div>
                      <div className="date-picker glass-item compact-filter">
                        <i className="bx bx-sort-down"></i>
                        <select value={campaignSortBy} onChange={(event) => setCampaignSortBy(event.target.value)}>
                          <option value="spend">Maior investimento</option>
                          <option value="conversions">Mais conversões</option>
                          <option value="roas">Maior ROAS</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Campanha</th>
                          <th>Investimento</th>
                          <th>Conversões</th>
                          <th>CPA</th>
                          <th>ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCampaigns.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                              Nenhuma campanha encontrada para esse filtro.
                            </td>
                          </tr>
                        ) : (
                          filteredCampaigns.map((campaign, index) => {
                            const campaignMetrics = extractMetaCampaignMetrics(campaign)
                            const campaignSpend = campaignMetrics.spend
                            const campaignPurchases = campaignMetrics.purchases
                            const campaignLeads = campaignMetrics.leads
                            const campaignMessages = campaignMetrics.messages
                            const campaignConversions = campaignMetrics.totalConversions
                            const campaignCpa = campaignMetrics.cpa
                            const campaignRoas = campaignMetrics.roas
                            const isActive = campaign.status === 'ACTIVE'

                            return (
                              <tr key={campaign.id || index}>
                                <td>
                                  <span className={`status-badge ${isActive ? 'status-active' : 'status-paused'}`}>
                                    {isActive ? 'Ativa' : 'Pausada'}
                                  </span>
                                </td>
                                <td className="campaign-name">{campaign.name}</td>
                                <td>{formatCurrency(campaignSpend)}</td>
                                <td>
                                  <strong>{formatNumber(campaignConversions)}</strong>
                                  <br />
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {campaignPurchases} compras, {campaignLeads} leads, {campaignMessages} mensagens
                                  </span>
                                </td>
                                <td>{formatCurrency(campaignCpa)}</td>
                                <td style={{ color: campaignRoas >= 3 ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                                  {formatMultiplier(campaignRoas)}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                  </section>
                )}

                {hasRdConfigured && (
                  <section className="source-section">
                    <div className="source-section-header">
                      <div className="source-section-badge" style={{ color: '#14b8a6', borderColor: '#14b8a6' }}>
                        <i className="bx bx-signal-5"></i>
                        <span>RD Station CRM</span>
                      </div>
                      <p className="source-section-copy">Em seguida, entram os indicadores comerciais e de CRM vinculados ao cliente.</p>
                    </div>
                  <section className="glass-panel grouped-results">
                      <div className="section-header section-header-stack section-header-with-action">
                        <div>
                          <h2>Resumo comercial</h2>
                          <p className="chart-subtitle">Os indicadores abaixo resumem o desempenho comercial identificado no RD Station para este cliente.</p>
                        </div>
                        {activeDraftDashboardTemplate && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setIsRdMetricLibraryOpen((current) => !current)}
                            disabled={!availableRdDashboardMetricOptions.length}
                          >
                            <i className="bx bx-plus"></i>
                            Adicionar métrica
                          </button>
                        )}
                      </div>

                      {(rdDashboardMetricCards.length > 0 || isRdMetricLibraryOpen) && (
                        <div className="template-metrics-shell">
                          {rdDashboardMetricCards.length > 0 && (
                            <div className="kpi-grid compact-kpi-grid template-metrics-grid">
                              {rdDashboardMetricCards.map((metric) => (
                                <div key={metric.key} className="kpi-card glass-panel template-metric-card">
                                  <div className="kpi-header">
                                    <span className="kpi-title">{metric.title}</span>
                                    <div className="template-metric-actions">
                                      <div className={`icon-box ${metric.tone}`}>
                                        <i className={`bx ${metric.icon}`}></i>
                                      </div>
                                      <button
                                        type="button"
                                        className="template-metric-remove"
                                        onClick={() => handleRemoveRdDashboardMetric(metric.key)}
                                        aria-label={`Remover ${metric.title}`}
                                      >
                                        <i className="bx bx-x"></i>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="kpi-value">{metric.value}</div>
                                  <div className="kpi-trend neutral">
                                    <i className="bx bx-check-circle"></i>
                                    <span>{metric.description}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {isRdMetricLibraryOpen && (
                            <div className="metric-library-panel glass-item">
                              <div>
                                <strong>Métricas RD disponíveis</strong>
                                <p>Essas métricas já estão na leitura do CRM e podem entrar no modelo atual.</p>
                              </div>
                              <div className="metric-library-list">
                                {availableRdDashboardMetricOptions.length > 0 ? (
                                  availableRdDashboardMetricOptions.map(([metricKey, metric]) => (
                                    <button
                                      key={metricKey}
                                      type="button"
                                      className="metric-library-chip"
                                      onClick={() => handleAddRdDashboardMetric(metricKey)}
                                    >
                                      <span>{metric.label}</span>
                                      <small>{metric.description}</small>
                                    </button>
                                  ))
                                ) : (
                                  <div className="metric-library-empty">Todas as métricas do RD já estão visíveis neste modelo.</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="crm-groups-grid">
                        {[
                          {
                            title: 'Qualificação e conversão',
                            description: 'Leitura da safra criada no período selecionado: oportunidades, qualificação, perdas e vendas da mesma base que entrou e fechou dentro do período.',
                            kpis: rdQualificationKpis,
                            withSourceFilter: true,
                          },
                          {
                            title: 'Fechamento e receita',
                            description: 'Leitura por data de fechamento de todas as negociações ganhas no período, incluindo safras criadas antes do intervalo selecionado.',
                            kpis: rdRevenueKpis,
                            showDiagnostics: true,
                          },
                          {
                            title: 'Resultado final',
                            description: 'Consolidado final somando vendas da safra criada no período com vendas de safras anteriores fechadas dentro do período selecionado.',
                            kpis: rdFinalKpis,
                          },
                        ].map((group) => (
                          <div key={group.title} className="result-group crm-result-group">
                            <div className="result-group-head">
                              <h3>{group.title}</h3>
                              <p>{group.description}</p>
                            </div>
                            {group.withSourceFilter && !!rdSummary?.availableSources?.length && (
                              <div className="meta-campaign-filter-collapsible rd-source-filter-collapsible">
                                <button
                                  type="button"
                                  className={`meta-campaign-filter-trigger ${isRdSourceFilterOpen ? 'open' : ''}`}
                                  onClick={() => setIsRdSourceFilterOpen((current) => !current)}
                                >
                                  <div>
                                    <h3>Filtrar por origem</h3>
                                    <p>{rdLeadSourceFilterSummary}</p>
                                  </div>
                                  <span className="meta-campaign-filter-trigger-icon">
                                    <i className={`bx ${isRdSourceFilterOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                                  </span>
                                </button>
                                {isRdSourceFilterOpen && (
                                  <div className="rd-source-filter-bar rd-source-filter-inline">
                                    <div>
                                      <p>Selecione as origens e UTMs que quer considerar na base das oportunidades, qualificação e conversão.</p>
                                    </div>
                                    <div className="meta-filter-chip-row">
                                      {rdSummary.availableSources.map((source) => (
                                        <label
                                          key={source}
                                          className={`result-filter-chip ${activeDraftRdLeadSources.includes(source) ? 'active' : ''}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={activeDraftRdLeadSources.includes(source)}
                                            onChange={() => handleRdLeadSourceToggle(source)}
                                          />
                                          <span>{source}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="kpi-grid compact-kpi-grid">
                              {group.kpis.map((kpi) => (
                                <div key={kpi.title} className="kpi-card glass-panel">
                                  <div className="kpi-header">
                                    <span className="kpi-title">{kpi.title}</span>
                                    <div className={`icon-box ${kpi.tone}`}>
                                      <i className={`bx ${kpi.icon}`}></i>
                                    </div>
                                  </div>
                                  <div className="kpi-value">{kpi.value}</div>
                                  <div className="kpi-trend neutral">
                                    <i className="bx bx-check-circle"></i>
                                    <span>Atualizado conforme a integração configurada</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {group.showDiagnostics && rdSummary?.diagnostics && (
                              <div className="meta-campaign-filter-collapsible rd-diagnostics-collapsible">
                                <button
                                  type="button"
                                  className={`meta-campaign-filter-trigger ${isRdDiagnosticsOpen ? 'open' : ''}`}
                                  onClick={() => setIsRdDiagnosticsOpen((current) => !current)}
                                >
                                  <div>
                                    <h3>Como as negociações estão sendo filtradas</h3>
                                    <p>{rdDiagnosticsSummary}</p>
                                  </div>
                                  <span className="meta-campaign-filter-trigger-icon">
                                    <i className={`bx ${isRdDiagnosticsOpen ? 'bx-chevron-up' : 'bx-chevron-down'}`}></i>
                                  </span>
                                </button>
                                {isRdDiagnosticsOpen && (
                                  <div className="rd-source-filter-bar rd-source-filter-inline rd-diagnostic-panel">
                                    <p className="meta-campaign-filter-note">
                                      Esses números mostram em que etapa as negociações do RD estão sendo reduzidas antes de entrar no card final.
                                    </p>
                                    <div className="rd-diagnostic-grid">
                                      <div className="conversion-stat">
                                        <span>Negociações recebidas do RD</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.allDeals?.totalDeals || 0)}</strong>
                                      </div>
                                      <div className="conversion-stat">
                                        <span>Ganhas reconhecidas em todos os vendedores</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.allDeals?.wonClassified || 0)}</strong>
                                      </div>
                                      <div className="conversion-stat">
                                        <span>Ganhas fechadas no período em todos os vendedores</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.allDeals?.wonClosedInRange || 0)}</strong>
                                      </div>
                                      <div className="conversion-stat">
                                        <span>Ganhas fechadas no período após filtro atual</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonClosedInRange || 0)}</strong>
                                      </div>
                                      <div className="conversion-stat">
                                        <span>Ganhas fora do período</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonClosedOutOfRange || 0)}</strong>
                                      </div>
                                      <div className="conversion-stat">
                                        <span>Ganhas sem data de fechamento</span>
                                        <strong>{formatNumber(rdSummary.diagnostics.filteredDeals?.wonWithoutCloseDate || 0)}</strong>
                                      </div>
                                    </div>
                                    <div className="rd-diagnostic-meta">
                                      <span>Filtro de vendedor: <b>{rdSummary.diagnostics.sellerFilterApplied ? 'Aplicado' : 'Todos os vendedores'}</b></span>
                                      <span>Filtro de origem: <b>{rdSummary.diagnostics.leadSourceFilterApplied ? 'Aplicado' : 'Não afeta este bloco'}</b></span>
                                      <span>Filtro de etapas qualificadas: <b>{rdSummary.diagnostics.qualifiedStageFilterApplied ? 'Aplicado' : 'Não afeta este bloco'}</b></span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>

                    {!!rdSummary?.sellerRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Destaque por vendedor</h2>
                            <p className="chart-subtitle">Ranking com base em receita ganha e negócios fechados na operação comercial.</p>
                          </div>
                        </div>

                        <div className="ranking-list">
                          {rdSummary.sellerRanking.map((seller) => (
                            <div key={seller.id} className="ranking-row">
                              <div>
                                <strong>{seller.name}</strong>
                                <span>
                                  {formatNumber(seller.wonDeals)} ganhos, {formatNumber(seller.openDeals)} em aberto, {formatNumber(seller.lostDeals)} perdidos
                                </span>
                              </div>
                              <b>{formatCurrency(seller.wonRevenue)}</b>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {!!rdSummary?.stageRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Colunas do pipeline</h2>
                            <p className="chart-subtitle">Quantidade de cards e valor por coluna do pipeline dentro do período selecionado.</p>
                          </div>
                        </div>

                        <div className="pipeline-columns-grid">
                          {rdSummary.stageRanking.map((stage) => (
                            <div key={stage.label} className="pipeline-column-card glass-item">
                              <div>
                                <strong>{stage.label}</strong>
                                <span>{formatNumber(stage.deals || 0)} card(s)</span>
                              </div>
                              <div className="pipeline-column-metrics">
                                <div>
                                  <small>Valor na coluna</small>
                                  <b>{formatCurrency(stage.totalValue || 0)}</b>
                                </div>
                                <div>
                                  <small>Em aberto</small>
                                  <span>{formatNumber(stage.openDeals || 0)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}
        {activeTab === 'apresentacao' && hasPendingDashboardFilters && (
          <button
            type="button"
            className="floating-filter-apply"
            onClick={handleApplyDashboardFilters}
            disabled={isApplyDashboardFiltersDisabled}
          >
            Aplicar filtro
          </button>
        )}
      </main>

      <style jsx>{`
        .sidebar-top {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 26px;
        }

        .nav-button {
          width: 100%;
          border: none;
          background: transparent;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }

        .sidebar-toggle {
          position: absolute;
          top: 26px;
          right: -18px;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(17, 24, 39, 0.96);
          color: var(--text-primary);
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          z-index: 3;
        }

        .sidebar-toggle i {
          font-size: 18px;
        }

        .sidebar-collapsed {
          width: 92px;
          padding-left: 14px;
          padding-right: 14px;
        }

        .sidebar-collapsed :global(.nav-item) {
          justify-content: center;
          width: 56px;
          height: 56px;
          margin: 0 auto;
          padding: 0;
          font-size: 0;
          border-radius: 18px;
          position: relative;
        }

        .sidebar-collapsed :global(.nav-item i) {
          font-size: 24px;
          margin: 0;
        }

        .sidebar-collapsed :global(.logo) {
          width: 100%;
          justify-content: center;
          margin-bottom: 10px;
          padding: 0;
        }

        .sidebar-collapsed :global(.nav-menu) {
          gap: 14px;
        }

        .sidebar-collapsed :global(.user-profile) {
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
        }

        .sidebar-collapsed :global(.nav-item)::after {
          content: attr(data-tooltip);
          position: absolute;
          left: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%);
          background: rgba(17, 24, 39, 0.96);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform-origin: left center;
        }

        .sidebar-collapsed :global(.nav-item:hover)::after {
          opacity: 1;
          transform: translateY(-50%) translateX(4px);
        }

        .main-content-expanded {
          margin-left: 92px;
        }

        .sidebar-client {
          padding: 16px;
          margin-top: 12px;
          margin-bottom: 18px;
        }

        .sidebar-client-label {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .header-actions-wrap {
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .custom-range input {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font: inherit;
          outline: none;
        }

        .clients-layout,
        .integrations-layout {
          display: grid;
          gap: 24px;
        }

        .clients-intro,
        .integrations-intro,
        .integrations-form {
          padding: 28px;
        }

        .clients-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: 360px 1fr;
        }

        .clients-grid-single {
          grid-template-columns: 1fr;
        }

        .users-management-layout {
          gap: 0;
        }

        .users-grid {
          align-items: start;
          grid-template-columns: 360px minmax(0, 1fr);
        }

        .clients-sidebar {
          display: grid;
          gap: 24px;
        }

        .client-create-bar {
          padding: 24px 28px;
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 18px;
        }

        .client-create-inline {
          display: flex;
          align-items: center;
          gap: 12px;
          width: min(100%, 560px);
        }

        .client-create-inline input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
        }

        .client-editor-card {
          padding: 24px;
          display: grid;
          gap: 24px;
        }

        .users-editor-shell {
          align-self: start;
          min-height: 0;
        }

        .client-list-card {
          padding: 24px;
        }

        .client-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .users-summary-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
          max-width: 320px;
        }

        .users-summary-chip {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
        }

        .users-toolbar-card {
          display: grid;
          gap: 20px;
          padding: 24px;
        }

        .users-toolbar-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .users-search-row {
          display: flex;
          justify-content: flex-start;
        }

        .users-search-field {
          width: min(100%, 360px);
          margin-bottom: 0;
        }

        .user-directory-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .client-directory-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .user-directory-card {
          padding: 18px;
          border-radius: 20px;
          display: grid;
          gap: 14px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .user-directory-main strong {
          display: block;
          font-size: 18px;
          margin-bottom: 6px;
        }

        .user-directory-main span {
          color: var(--text-muted);
          font-size: 13px;
          display: block;
          overflow-wrap: anywhere;
        }

        .user-directory-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .user-directory-meta small {
          color: var(--text-muted);
          font-size: 12px;
        }

        .user-role-badge {
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .user-directory-actions {
          display: flex;
          justify-content: flex-end;
        }

        .client-directory-card-active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .client-directory-actions {
          gap: 10px;
          flex-wrap: wrap;
        }

        .compact-empty-state {
          min-height: 180px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 9, 18, 0.72);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 80;
        }

        .modal-card {
          width: min(100%, 880px);
          max-height: min(88vh, 900px);
          overflow: auto;
          padding: 24px;
          display: grid;
          gap: 22px;
        }

        .modal-card-wide {
          width: min(100%, 1180px);
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .modal-header h3 {
          font-size: 26px;
          margin-bottom: 6px;
        }

        .modal-header p {
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .modal-close {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        .modal-close i {
          font-size: 20px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .modal-foot {
          display: grid;
          gap: 16px;
        }

        .client-editor-header h3 {
          font-size: 24px;
          margin-bottom: 6px;
        }

        .client-editor-header p {
          color: var(--text-secondary);
        }

        .modal-client-editor {
          padding: 0;
        }

        .branding-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .client-list-card h3,
        .clients-intro h2,
        .integrations-intro h2 {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .client-create-bar p,
        .clients-intro p,
        .integrations-intro p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .client-list {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .client-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .client-row.selected {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .client-select,
        .client-delete {
          background: transparent;
          border: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .client-select {
          display: grid;
          gap: 4px;
          text-align: left;
          flex: 1;
        }

        .client-select span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .client-delete {
          color: #fda4af;
          font-size: 13px;
        }

        .hero-panel {
          padding: 28px;
          margin-bottom: 24px;
          display: grid;
          gap: 20px;
          grid-template-columns: 1.8fr 1fr;
          background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.03), transparent), radial-gradient(circle at top right, var(--theme-surface), transparent 42%);
        }

        .hero-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .hero-panel h2 {
          font-size: 36px;
          margin: 18px 0 12px;
        }

        .hero-logo-wrap {
          width: 132px;
          height: 132px;
          margin-bottom: 20px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: grid;
          place-items: center;
          overflow: hidden;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }

        .hero-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 14px;
        }

        .hero-panel p {
          color: var(--text-secondary);
          max-width: 720px;
          line-height: 1.6;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hero-meta {
          display: grid;
          gap: 14px;
        }

        .source-section {
          display: grid;
          gap: 20px;
          margin-bottom: 24px;
        }

        .source-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .source-section-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid currentColor;
          background: rgba(255, 255, 255, 0.03);
          font-weight: 700;
        }

        .source-section-badge i {
          font-size: 20px;
        }

        .source-section-copy {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          text-align: right;
          max-width: 520px;
        }

        .hero-stat {
          padding: 18px;
          border-radius: 18px;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .hero-stat-empty {
          min-height: 96px;
          align-content: center;
        }

        .hero-stat span {
          display: block;
          color: var(--text-muted);
          font-size: 12px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .hero-stat strong {
          font-size: 20px;
          line-height: 1.2;
        }

        .hero-select-wrap {
          margin-top: 4px;
        }

        .hero-select {
          width: 100%;
          min-height: 46px;
          padding: 0 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
          font: inherit;
          outline: none;
        }

        .feedback-banner,
        .empty-panel {
          padding: 24px;
          margin-bottom: 24px;
        }

        .feedback-banner {
          border: 1px solid rgba(245, 158, 11, 0.32);
          background: rgba(245, 158, 11, 0.1);
          color: #fde68a;
          border-radius: 16px;
        }

        .empty-panel {
          text-align: center;
        }

        .empty-panel h3 {
          margin-bottom: 8px;
          font-size: 22px;
        }

        .empty-panel p {
          color: var(--text-secondary);
          margin-bottom: 18px;
        }

        .chart-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .chart-header-stack,
        .section-header-stack {
          align-items: flex-start;
          gap: 16px;
        }

        .campaigns-section .section-header-stack {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .section-header-with-action {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .intro-list {
          margin-top: 18px;
          padding-left: 18px;
          color: var(--text-primary);
          display: grid;
          gap: 10px;
        }

        .form-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .funnel-section {
          padding: 24px;
          margin-bottom: 24px;
        }

        .grouped-results {
          padding: 24px;
          margin-bottom: 24px;
        }

        .template-metrics-shell {
          display: grid;
          gap: 16px;
          margin-bottom: 24px;
        }

        .template-metrics-grid {
          margin-top: 0;
        }

        .template-metric-card {
          gap: 0;
        }

        .template-metric-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .template-metric-remove {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-muted);
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .metric-library-panel {
          padding: 18px;
          border-radius: 18px;
          display: grid;
          gap: 14px;
        }

        .metric-library-panel strong {
          display: block;
          margin-bottom: 4px;
        }

        .metric-library-panel p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .metric-library-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .metric-library-chip {
          min-width: 220px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px dashed rgba(59, 130, 246, 0.38);
          background: rgba(15, 23, 42, 0.6);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          display: grid;
          gap: 4px;
          flex: 1 1 220px;
        }

        .metric-library-chip span {
          font-weight: 700;
        }

        .metric-library-chip small,
        .metric-library-empty {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .metric-library-empty {
          font-size: 13px;
        }

        .meta-filter-panel {
          padding: 20px 24px;
          margin-bottom: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.015)),
            rgba(8, 12, 22, 0.6);
        }

        .meta-filter-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 16px;
        }

        .meta-filter-panel-head h2 {
          font-size: 26px;
          margin-bottom: 6px;
        }

        .meta-filter-kicker {
          display: inline-block;
          margin-bottom: 8px;
          color: #60a5fa;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .meta-filter-helper {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
          white-space: nowrap;
          padding-top: 22px;
        }

        .floating-filter-apply {
          position: fixed;
          top: 72%;
          right: 24px;
          transform: translateY(-50%);
          z-index: 220;
          min-width: 168px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 18px;
          border: 1px solid rgba(59, 130, 246, 0.34);
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(59, 130, 246, 0.18), rgba(15, 23, 42, 0.94)),
            rgba(15, 23, 42, 0.96);
          box-shadow: 0 18px 42px rgba(2, 8, 23, 0.45);
          color: #eff6ff;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .floating-filter-apply:hover:not(:disabled) {
          transform: translateY(calc(-50% - 2px));
          box-shadow: 0 22px 48px rgba(2, 8, 23, 0.52);
        }

        .floating-filter-apply:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .meta-filter-chip-row {
          padding-top: 2px;
        }

        .meta-campaign-filter-collapsible {
          margin-top: 18px;
        }

        .meta-campaign-filter-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
          color: inherit;
          text-align: left;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .meta-campaign-filter-trigger:hover,
        .meta-campaign-filter-trigger.open {
          border-color: rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.06);
        }

        .meta-campaign-filter-trigger h3 {
          margin: 0 0 4px;
          font-size: 17px;
        }

        .meta-campaign-filter-trigger p {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .meta-campaign-filter-trigger-icon {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.04);
          color: #dbeafe;
          flex-shrink: 0;
        }

        .meta-campaign-filter-trigger-icon i {
          font-size: 20px;
        }

        .meta-campaign-filter-note {
          margin: 0;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .rd-source-filter-bar {
          display: grid;
          gap: 14px;
          margin-bottom: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .rd-source-filter-inline {
          margin-top: 18px;
        }

        .rd-source-filter-bar h3 {
          margin-bottom: 6px;
          font-size: 16px;
        }

        .rd-source-filter-bar p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .result-group {
          margin-top: 10px;
        }

        .result-group-head {
          margin-bottom: 16px;
        }

        .result-group-head h3 {
          font-size: 18px;
          margin-bottom: 4px;
        }

        .result-group-head p {
          color: var(--text-muted);
          font-size: 13px;
        }

        .compact-kpi-grid {
          margin-bottom: 0;
        }

        .conversion-groups-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          margin-top: 20px;
        }

        .crm-groups-grid {
          display: grid;
          gap: 18px;
          margin-top: 18px;
        }

        .crm-result-group {
          padding: 24px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
        }

        .rd-diagnostic-panel {
          margin-top: 18px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .rd-diagnostic-head {
          margin-bottom: 14px;
        }

        .rd-diagnostic-head h4 {
          font-size: 16px;
          margin-bottom: 4px;
        }

        .rd-diagnostic-head p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .rd-diagnostic-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .rd-diagnostic-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          margin-top: 14px;
          color: var(--text-muted);
          font-size: 12px;
        }

        .rd-diagnostic-meta b {
          color: var(--text-main);
          font-weight: 700;
        }

        .conversion-group-card {
          padding: 22px;
        }

        .conversion-group-head {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 18px;
        }

        .conversion-group-head h3 {
          font-size: 20px;
          margin-bottom: 6px;
        }

        .conversion-group-head p {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .conversion-stats {
          display: grid;
          gap: 12px;
        }

        .conversion-stat {
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .conversion-stat span {
          display: block;
          color: var(--text-muted);
          font-size: 12px;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .conversion-stat strong {
          font-size: 26px;
          line-height: 1.1;
        }

        .funnel-builder {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 18px;
          margin-top: 16px;
        }

        .funnel-library,
        .funnel-dropzone {
          padding: 20px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .funnel-library h3 {
          font-size: 16px;
          margin-bottom: 14px;
        }

        .funnel-chip-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .funnel-chip {
          border: 1px dashed rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 999px;
          padding: 10px 14px;
          cursor: grab;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: inherit;
        }

        .funnel-steps {
          display: grid;
          gap: 10px;
        }

        .funnel-step {
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
          cursor: grab;
        }

        .funnel-step strong {
          font-size: 26px;
          display: block;
          margin-top: 10px;
        }

        .funnel-step-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .funnel-step-label {
          color: var(--text-secondary);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .funnel-remove {
          background: transparent;
          border: none;
          color: #fda4af;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
        }

        .funnel-connector {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 8px 0;
          color: var(--accent-emerald);
          font-size: 13px;
          font-weight: 600;
        }

        .funnel-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          border: 1px dashed rgba(255, 255, 255, 0.14);
          border-radius: 16px;
          text-align: center;
          padding: 20px;
        }

        .rankings-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .ranking-card {
          padding: 24px;
        }

        .ranking-list {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .ranking-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .ranking-row strong {
          display: block;
          margin-bottom: 4px;
          line-height: 1.2;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .creative-ranking-main {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .creative-ranking-main > div:last-child {
          min-width: 0;
          flex: 1;
        }

        .creative-thumb {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          font-size: 11px;
          text-align: center;
          padding: 6px;
        }

        .creative-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .ranking-row span {
          color: var(--text-muted);
          font-size: 12px;
        }

        .ranking-row b {
          font-size: 14px;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .ranking-row-rich {
          align-items: center;
        }

        .ranking-metrics {
          display: grid;
          gap: 4px;
          text-align: right;
          min-width: 180px;
        }

        .ranking-metrics span {
          color: var(--text-muted);
          font-size: 12px;
        }

        .ranking-empty {
          color: var(--text-muted);
          padding: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          text-align: center;
        }

        .pipeline-columns-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }

        .pipeline-column-card {
          padding: 18px;
          border-radius: 18px;
          display: grid;
          gap: 16px;
        }

        .pipeline-column-card strong {
          display: block;
          font-size: 18px;
          margin-bottom: 6px;
          line-height: 1.25;
        }

        .pipeline-column-card span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .pipeline-column-metrics {
          display: grid;
          gap: 12px;
        }

        .pipeline-column-metrics div {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .pipeline-column-metrics small {
          display: block;
          color: var(--text-muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }

        .pipeline-column-metrics b {
          font-size: 22px;
          line-height: 1.1;
        }

        .campaign-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          justify-content: flex-end;
        }

        .compact-filter {
          min-width: 220px;
          flex: 0 0 auto;
        }

        .campaign-filters .search-box {
          width: 320px;
        }

        .integration-block {
          padding: 22px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .integration-heading {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .integration-icon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid;
          background: rgba(255, 255, 255, 0.03);
          font-size: 22px;
          flex-shrink: 0;
        }

        .integration-heading h3 {
          font-size: 18px;
          margin-bottom: 6px;
        }

        .integration-heading p {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .form-actions-space {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
        }

        .users-list {
          display: grid;
          gap: 18px;
        }

        .user-admin-card {
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
        }

        .user-admin-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 18px;
        }

        .user-admin-head strong {
          display: block;
          font-size: 18px;
          margin-bottom: 4px;
        }

        .user-admin-head span {
          color: var(--text-muted);
          font-size: 13px;
        }

        .user-admin-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .user-list-compact {
          display: grid;
          gap: 16px;
        }

        .user-picker-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .user-picker-head span {
          min-width: 34px;
          height: 34px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
        }

        .user-picker-list {
          display: grid;
          gap: 10px;
          max-height: 340px;
          overflow: auto;
        }

        .user-picker-item {
          width: 100%;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .user-picker-item.active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
          transform: translateY(-1px);
        }

        .user-picker-item strong {
          display: block;
          margin-bottom: 4px;
          font-size: 15px;
        }

        .user-picker-item span {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.4;
          display: block;
          overflow-wrap: anywhere;
        }

        .integration-helper {
          color: var(--text-muted);
          font-size: 13px;
        }

        .users-empty-state {
          min-height: 320px;
          margin-bottom: 0;
          display: grid;
          place-items: center;
        }

        .form-note {
          color: var(--text-muted);
          font-size: 13px;
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-group label {
          display: block;
          color: var(--text-secondary);
          font-size: 13px;
          margin-bottom: 8px;
        }

        .field-helper {
          margin: -2px 0 10px;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .input-group input:not([type="checkbox"]):not([type="file"]) {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .client-select-input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
          appearance: none;
        }

        .input-group input[type="file"] {
          width: 100%;
          min-height: 48px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
          line-height: 1.3;
        }

        .input-group input:not([type="checkbox"]):focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .client-select-input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .logo-preview {
          min-height: 120px;
          border-radius: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          display: grid;
          place-items: center;
          padding: 16px;
          color: var(--text-muted);
          overflow: hidden;
        }

        .logo-preview img {
          max-width: 100%;
          max-height: 90px;
          object-fit: contain;
        }

        .stage-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .qualification-config {
          margin-top: 8px;
        }

        .qualification-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          font: inherit;
        }

        .qualification-toggle strong {
          display: block;
          margin-bottom: 4px;
          font-size: 15px;
        }

        .qualification-toggle span {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .qualification-toggle i {
          font-size: 20px;
          color: var(--text-secondary);
          flex: 0 0 auto;
        }

        .qualification-panel {
          margin-top: 12px;
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }

        .stage-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .stage-chip.active {
          border-color: color-mix(in srgb, var(--accent-blue) 55%, white 15%);
          background: color-mix(in srgb, var(--accent-blue) 16%, transparent);
          color: white;
        }

        .stage-chip input {
          width: 16px;
          height: 16px;
          margin: 0;
          min-height: 16px;
          padding: 0;
          border: none;
          background: transparent;
          flex: 0 0 16px;
          accent-color: var(--accent-blue);
        }

        .stage-chip span {
          font-size: 13px;
          line-height: 1.2;
        }

        .stage-empty {
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 1100px) {
          .hero-panel,
          .form-grid,
          .clients-grid,
          .users-grid,
          .branding-grid,
          .funnel-builder,
          .rd-mini-funnel,
          .rankings-grid,
          .conversion-groups-grid {
            grid-template-columns: 1fr;
          }

          .client-create-bar,
          .client-create-inline {
            flex-direction: column;
            align-items: stretch;
          }

          .source-section-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .section-header-with-action {
            flex-direction: column;
            align-items: flex-start;
          }

          .source-section-copy {
            text-align: left;
            max-width: none;
          }

          .meta-filter-panel-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .meta-filter-helper {
            white-space: normal;
            padding-top: 0;
          }

          .floating-filter-apply {
            top: auto;
            right: 16px;
            bottom: 16px;
            left: 16px;
            min-width: 0;
            transform: none;
          }

          .floating-filter-apply:hover:not(:disabled) {
            transform: translateY(-2px);
          }

          .user-directory-grid {
            grid-template-columns: 1fr;
          }

          .client-directory-grid {
            grid-template-columns: 1fr;
          }

          .users-summary-chips {
            justify-content: flex-start;
            max-width: none;
          }

          .users-toolbar-actions,
          .modal-header {
            justify-content: flex-start;
          }

          .modal-card {
            padding: 20px;
          }

          .hero-logo-wrap {
            width: 108px;
            height: 108px;
          }

          .hero-panel h2 {
            font-size: 30px;
          }
        }

        @media (max-width: 768px) {
          .sidebar-collapsed {
            width: var(--sidebar-width);
          }

          .main-content-expanded {
            margin-left: 0;
          }

          .header-actions-wrap {
            width: 100%;
            justify-content: flex-start;
          }

          .metric-library-chip {
            min-width: 0;
            width: 100%;
          }

          .form-actions-space {
            flex-direction: column;
            align-items: flex-start;
          }

          .modal-actions {
            width: 100%;
            justify-content: stretch;
          }

          .modal-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
