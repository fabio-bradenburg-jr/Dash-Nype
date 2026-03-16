'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@/lib/contexts/UserContext'
import { createClient } from '@/lib/supabase/client'
import {
  createClientRecord,
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

const INTEGRATION_GROUPS = [
  {
    title: 'Meta Ads',
    icon: 'bxl-meta',
    accent: '#0668E1',
    description: 'Conecta Facebook e Instagram Ads para alimentar o dashboard final.',
    fields: [
      { name: 'metaAccessToken', label: 'Chave da API da Meta', placeholder: 'EAABsbCS1...', storage: 'integrations', type: 'password' },
      { name: 'metaAdAccountId', label: 'Conta do Meta vinculada ao cliente', placeholder: 'act_123456789', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'Google Ads',
    icon: 'bxl-google',
    accent: '#ea4335',
    description: 'Salve a conta e a credencial usadas especificamente por esse cliente.',
    fields: [
      { name: 'googleAdsToken', label: 'Token / credencial', placeholder: 'Developer token ou OAuth', storage: 'integrations', type: 'password' },
      { name: 'googleAdsAccountId', label: 'Conta Google Ads do cliente', placeholder: '123-456-7890', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'TikTok Ads',
    icon: 'bxl-tiktok',
    accent: '#ff0050',
    description: 'Deixe pronta a seleção da conta que deve compor o dashboard desse cliente.',
    fields: [
      { name: 'tiktokAdsToken', label: 'Token / credencial', placeholder: 'tt_...', storage: 'integrations', type: 'password' },
      { name: 'tiktokAdsAccountId', label: 'Conta TikTok Ads do cliente', placeholder: '987654321', storage: 'client', type: 'text' },
    ],
  },
  {
    title: 'LinkedIn Ads',
    icon: 'bxl-linkedin-square',
    accent: '#0a66c2',
    description: 'Organize mídia B2B por cliente desde já.',
    fields: [
      { name: 'linkedinAdsToken', label: 'Token OAuth 2.0', placeholder: 'AQV...', storage: 'integrations', type: 'password' },
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

const PRESENTATION_VIEW_CONFIG = {
  meta: {
    key: 'meta',
    title: 'Meta Ads',
    icon: 'bxl-meta',
    accent: '#0668E1',
    subtitle: 'Uma visão executiva dos principais resultados de mídia e performance do período selecionado.',
    heroCopy: 'A seguir, apresentamos um panorama dos principais indicadores de mídia, distribuição e conversão desta operação, com base exclusivamente na conta Meta vinculada ao cliente.',
  },
  rd: {
    key: 'rd',
    title: 'RD Station CRM',
    icon: 'bx-signal-5',
    accent: '#14b8a6',
    subtitle: 'Uma visão executiva da operação comercial e do avanço do CRM no período analisado.',
    heroCopy: 'A seguir, apresentamos uma leitura consolidada da operação comercial no RD Station, destacando o volume de contatos, oportunidades e receita vinculados a este cliente.',
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
  const { user, loading: userLoading } = useUser()
  const supabase = createClient()
  const dashboardRef = useRef(null)

  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false)
  const [activeTab, setActiveTab] = useState('apresentacao')
  const [dateRange, setDateRange] = useState('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [themeColor, setThemeColor] = useState('blue')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [metric1, setMetric1] = useState('spend')
  const [metric2, setMetric2] = useState('roas')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ACTIVE')
  const [campaignSortBy, setCampaignSortBy] = useState('spend')
  const [clients, setClients] = useState([])
  const [activeClientId, setActiveClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [adAccounts, setAdAccounts] = useState([])
  const [insights, setInsights] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [breakdowns, setBreakdowns] = useState({ ages: [], cities: [], creatives: [] })
  const [isRankingsLoading, setIsRankingsLoading] = useState(false)
  const [rankingsError, setRankingsError] = useState('')
  const [rdSummary, setRdSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [hasSyncedServerState, setHasSyncedServerState] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dragMetricKey, setDragMetricKey] = useState('')
  const [dragSourceIndex, setDragSourceIndex] = useState(null)
  const [presentationView, setPresentationView] = useState('meta')
  const [rdSellerFilter, setRdSellerFilter] = useState('all')

  const currentTheme = THEMES[themeColor] || THEMES.blue
  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) || null,
    [clients, activeClientId]
  )
  const activeIntegrations = activeClient?.integrations || DEFAULT_INTEGRATIONS
  const selectedAdAccount = activeClient?.metaAdAccountId || ''
  const selectedQualifiedStages = useMemo(
    () => activeClient?.rdQualifiedStages || [],
    [activeClient]
  )
  const hasMetaConfigured = Boolean(selectedAdAccount && activeIntegrations.metaAccessToken)
  const hasRdConfigured = Boolean(activeIntegrations.rdStationToken)
  const activeFunnelSteps = useMemo(
    () => activeClient?.funnelSteps || [],
    [activeClient]
  )
  const availablePresentationViews = useMemo(() => {
    const views = []

    if (hasMetaConfigured) {
      views.push(PRESENTATION_VIEW_CONFIG.meta)
    }

    if (hasRdConfigured) {
      views.push(PRESENTATION_VIEW_CONFIG.rd)
    }

    return views
  }, [hasMetaConfigured, hasRdConfigured])
  const activePresentationView = useMemo(
    () => availablePresentationViews.find((view) => view.key === presentationView) || availablePresentationViews[0] || null,
    [availablePresentationViews, presentationView]
  )

  useEffect(() => {
    const preferences = loadDashboardPreferences()
    const initialClients = preferences.clients?.length
      ? preferences.clients
      : [createClientRecord({ name: 'Cliente demo' })]
    const initialActiveClientId = preferences.activeClientId || initialClients[0]?.id || ''

    setThemeColor(preferences.themeColor)
    setMetric1(preferences.metric1)
    setMetric2(preferences.metric2)
    setClients(initialClients)
    setActiveClientId(initialActiveClientId)
    setHasLoadedPreferences(true)
  }, [])

  useEffect(() => {
    if (!activeClient?.dashboardColor) return
    setThemeColor(activeClient.dashboardColor)
  }, [activeClient])

  useEffect(() => {
    if (availablePresentationViews.length === 0) {
      setPresentationView('meta')
      return
    }

    if (!availablePresentationViews.some((view) => view.key === presentationView)) {
      setPresentationView(availablePresentationViews[0].key)
    }
  }, [availablePresentationViews, presentationView])

  useEffect(() => {
    const sellers = rdSummary?.sellers || []

    if (!sellers.length) {
      setRdSellerFilter('all')
      return
    }

    if (rdSellerFilter !== 'all' && !sellers.some((seller) => seller.id === rdSellerFilter)) {
      setRdSellerFilter('all')
    }
  }, [rdSummary, rdSellerFilter])

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

        if (Array.isArray(state.clients) && state.clients.length > 0) {
          setThemeColor(state.themeColor || 'blue')
          setMetric1(state.metric1 || 'spend')
          setMetric2(state.metric2 || 'roas')
          setClients(state.clients)
          setActiveClientId(state.activeClientId || state.clients[0]?.id || '')
        }
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
      clients,
    }

    saveDashboardPreferences(state)

    if (userLoading || !user) return

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
  }, [hasLoadedPreferences, themeColor, metric1, metric2, activeClientId, clients, userLoading, user])

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

  const handleCreateClient = (event) => {
    event.preventDefault()
    const trimmedName = newClientName.trim()
    if (!trimmedName) return

    const newClient = createClientRecord({ name: trimmedName })
    setClients((currentClients) => [...currentClients, newClient])
    setActiveClientId(newClient.id)
    setActiveTab('clientes')
    setNewClientName('')
  }

  const handleRemoveClient = (clientId) => {
    const nextClients = clients.filter((client) => client.id !== clientId)
    setClients(nextClients)

    if (clientId === activeClientId) {
      setActiveClientId(nextClients[0]?.id || '')
    }
  }

  const handleClientFieldChange = (fieldName, value) => {
    updateActiveClient((client) => ({
      ...client,
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

    if (!activeIntegrations.metaAccessToken) {
      setAdAccounts([])
      return
    }

    const fetchAdAccounts = async () => {
      setErrorMessage('')

      try {
        const response = await fetch('/api/meta/adaccounts', {
          headers: {
            'x-meta-access-token': activeIntegrations.metaAccessToken,
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
  }, [hasLoadedPreferences, activeClient, activeClientId, activeIntegrations.metaAccessToken])

  useEffect(() => {
    if (!activeClient) {
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setCampaigns([])
      setBreakdowns({ ages: [], cities: [], creatives: [] })
      setRdSummary(null)
      return
    }

    if (!hasMetaConfigured && !hasRdConfigured) {
      setIsLoading(false)
      setInsights(null)
      setDailyData([])
      setCampaigns([])
      setBreakdowns({ ages: [], cities: [], creatives: [] })
      setIsRankingsLoading(false)
      setRankingsError('')
      setRdSummary(null)
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    const fetchDashboardData = async () => {
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

          const headers = {
            'x-meta-access-token': activeIntegrations.metaAccessToken,
          }

          const [insightsResponse, campaignsResponse] = await Promise.all([
            fetch(`/api/meta/insights?${params.toString()}`, { headers }),
            fetch(`/api/meta/campaigns?${params.toString()}`, { headers }),
          ])

          const insightsData = await insightsResponse.json()
          const campaignsData = await campaignsResponse.json()

          if (!insightsResponse.ok) {
            metaError = insightsData.error || 'Não foi possível carregar os indicadores da Meta.'
            setInsights(null)
            setDailyData([])
          } else {
            setInsights(insightsData.summary || {})
            setDailyData(insightsData.daily || [])
            setCampaigns(campaignsResponse.ok ? campaignsData || [] : [])

            if (!campaignsResponse.ok) {
              metaError = 'Os indicadores principais carregaram, mas a tabela de campanhas não respondeu agora.'
            }
          }
        } else {
          setInsights(null)
          setDailyData([])
          setCampaigns([])
        }

        if (hasRdConfigured) {
          const rdParams = new URLSearchParams()
          if (rdSellerFilter && rdSellerFilter !== 'all') {
            rdParams.set('seller_id', rdSellerFilter)
          }
          rdParams.set('date_preset', dateRange)
          selectedQualifiedStages.forEach((stage) => {
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
            setRdSummary(null)
          } else {
            setRdSummary(rdData || null)
          }
        } else {
          setRdSummary(null)
        }

        setErrorMessage(activePresentationView?.key === 'rd' ? rdError || metaError : metaError || rdError)
      } catch (error) {
        setInsights(null)
        setDailyData([])
        setCampaigns([])
        setBreakdowns({ ages: [], cities: [], creatives: [] })
        setRdSummary(null)
        setErrorMessage(error.message || 'Falha ao puxar os dados da integração.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [
    activeClient,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    hasRdConfigured,
    rdSellerFilter,
    selectedQualifiedStages,
    activeIntegrations.metaAccessToken,
    activeIntegrations.rdStationToken,
    activePresentationView,
  ])

  useEffect(() => {
    if (!activeClient || !hasMetaConfigured) {
      setBreakdowns({ ages: [], cities: [], creatives: [] })
      setIsRankingsLoading(false)
      setRankingsError('')
      return
    }

    if (dateRange === 'custom' && (!customSince || !customUntil)) {
      return
    }

    const fetchRankings = async () => {
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

        const response = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
          headers: {
            'x-meta-access-token': activeIntegrations.metaAccessToken,
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
    activeClient,
    selectedAdAccount,
    dateRange,
    customSince,
    customUntil,
    hasMetaConfigured,
    activeIntegrations.metaAccessToken,
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
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b0f19',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`dashboard-${activeClient?.name || 'cliente'}.pdf`)
    } catch (error) {
      console.error('Erro ao exportar PDF:', error)
      alert('Não foi possível gerar o PDF agora.')
    } finally {
      setIsExporting(false)
    }
  }

  const replaceFunnelSteps = (steps) => {
    updateActiveClient((client) => ({
      ...client,
      funnelSteps: steps,
    }))
  }

  const handleFunnelDragStart = (metricKey, sourceIndex = null) => {
    setDragMetricKey(metricKey)
    setDragSourceIndex(sourceIndex)
  }

  const handleFunnelDrop = (targetIndex = activeFunnelSteps.length) => {
    if (!dragMetricKey) return

    const currentSteps = [...activeFunnelSteps]

    if (dragSourceIndex !== null) {
      const [movedStep] = currentSteps.splice(dragSourceIndex, 1)
      const adjustedIndex = dragSourceIndex < targetIndex ? targetIndex - 1 : targetIndex
      currentSteps.splice(adjustedIndex, 0, movedStep)
      replaceFunnelSteps(currentSteps)
    } else if (!currentSteps.includes(dragMetricKey)) {
      currentSteps.splice(targetIndex, 0, dragMetricKey)
      replaceFunnelSteps(currentSteps)
    }

    setDragMetricKey('')
    setDragSourceIndex(null)
  }

  const handleRemoveFunnelStep = (metricKey) => {
    replaceFunnelSteps(activeFunnelSteps.filter((step) => step !== metricKey))
  }

  const customMetrics = useMemo(() => insights?.custom_metrics || {}, [insights])
  const spend = parseFloat(insights?.spend || 0)
  const impressions = parseInt(insights?.impressions || 0, 10)
  const clicks = parseInt(insights?.clicks || 0, 10)
  const cpc = parseFloat(insights?.cpc || 0)
  const ctr = parseFloat(insights?.ctr || 0)
  const purchases = customMetrics.purchases || 0
  const costPerPurchase = customMetrics.cost_per_purchase || 0
  const leads = customMetrics.leads || 0
  const costPerLead = customMetrics.cost_per_lead || 0
  const messages = customMetrics.messages || 0
  const costPerMessage = customMetrics.cost_per_message || 0
  const totalConversions = customMetrics.totalConversions || 0
  const roas = customMetrics.roas || 0
  const purchaseValue = customMetrics.purchaseValue || 0

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

  const filteredCampaigns = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase()
    const filtered = campaigns.filter((campaign) => {
      const matchesSearch = !term || campaign.name?.toLowerCase().includes(term)
      const matchesStatus = campaignStatusFilter === 'all' || campaign.status === campaignStatusFilter
      return matchesSearch && matchesStatus
    })

    const getCampaignMetrics = (campaign) => {
      const insight = campaign.insights?.data?.[0] || {}
      const actions = insight.actions || []
      const values = insight.action_values || []
      const spendValue = parseFloat(insight.spend || 0)
      const purchasesValue = actions
        .filter((item) => ['purchase', 'offsite_conversion.fb_pixel_purchase'].includes(item.action_type))
        .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
      const leadsValue = actions
        .filter((item) => ['lead', 'onsite_conversion.lead_grouped'].includes(item.action_type))
        .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
      const messagesValue = actions
        .filter((item) => ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'].includes(item.action_type))
        .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
      const totalConversionsValue = purchasesValue + leadsValue + messagesValue
      const revenueValue = values
        .filter((item) => ['purchase', 'offsite_conversion.fb_pixel_purchase'].includes(item.action_type))
        .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)
      const roasValue = spendValue > 0 ? revenueValue / spendValue : 0

      return { spendValue, totalConversionsValue, roasValue }
    }

    return filtered.sort((campaignA, campaignB) => {
      const metricsA = getCampaignMetrics(campaignA)
      const metricsB = getCampaignMetrics(campaignB)

      if (campaignSortBy === 'roas') return metricsB.roasValue - metricsA.roasValue
      if (campaignSortBy === 'conversions') return metricsB.totalConversionsValue - metricsA.totalConversionsValue
      return metricsB.spendValue - metricsA.spendValue
    })
  }, [campaigns, campaignSearch, campaignStatusFilter, campaignSortBy])

  const availableFunnelMetrics = useMemo(
    () => Object.entries(METRIC_OPTIONS).filter(([key]) => !activeFunnelSteps.includes(key)),
    [activeFunnelSteps]
  )

  const funnelCards = useMemo(
    () =>
      activeFunnelSteps.map((metricKey, index) => {
        const value = getSummaryMetricValue(metricKey, insights, customMetrics)
        const previousKey = activeFunnelSteps[index - 1]
        const previousValue = previousKey ? getSummaryMetricValue(previousKey, insights, customMetrics) : 0

        return {
          key: metricKey,
          label: METRIC_OPTIONS[metricKey]?.label || metricKey,
          formattedValue: formatMetricValue(value, metricKey),
          conversionRate: index === 0 || previousValue <= 0 ? null : (value / previousValue) * 100,
        }
      }),
    [activeFunnelSteps, insights, customMetrics]
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

  const crmGroups = [
    rdSummary && {
      title: 'RD Station CRM',
      subtitle: 'Leitura comercial automática com base no token cadastrado para este cliente.',
      icon: 'bx-signal-5',
      tone: 'emerald',
      stats: [
        { label: 'Contatos', value: formatNumber(rdSummary.contacts || 0) },
        { label: 'Negócios em aberto', value: formatNumber(rdSummary.openDeals || 0) },
        { label: 'Negócios ganhos', value: formatNumber(rdSummary.wonDeals || 0) },
        { label: 'Receita ganha', value: formatCurrency(rdSummary.wonRevenue || 0) },
      ],
    },
  ].filter(Boolean)
  const rdKpis = [
    { title: 'Contatos', value: formatNumber(rdSummary?.contacts || 0), icon: 'bx-user-voice', tone: 'blue' },
    { title: 'Contatos no período', value: formatNumber(rdSummary?.contactsInPeriod || 0), icon: 'bx-calendar-check', tone: 'cyan' },
    { title: 'Negócios em aberto', value: formatNumber(rdSummary?.openDeals || 0), icon: 'bx-briefcase-alt-2', tone: 'purple' },
    { title: 'Negócios ganhos', value: formatNumber(rdSummary?.wonDeals || 0), icon: 'bx-badge-check', tone: 'emerald' },
    { title: 'Negócios perdidos', value: formatNumber(rdSummary?.lostDeals || 0), icon: 'bx-x-circle', tone: 'pink' },
    { title: 'Negócios fechados', value: formatNumber(rdSummary?.closedDeals || 0), icon: 'bx-check-double', tone: 'cyan' },
    { title: 'Receita ganha', value: formatCurrency(rdSummary?.wonRevenue || 0), icon: 'bx-wallet-alt', tone: 'orange' },
  ]
  const rdDecisionKpis = [
    { title: 'Pipeline aberto', value: formatCurrency(rdSummary?.openPipeline || 0), icon: 'bx-layer', tone: 'cyan' },
    { title: 'Negócios criados', value: formatNumber(rdSummary?.createdDeals || 0), icon: 'bx-git-branch', tone: 'blue' },
    { title: 'Qualificados', value: formatNumber(rdSummary?.qualifiedDeals || 0), icon: 'bx-filter-alt', tone: 'emerald' },
    { title: 'Ticket médio ganho', value: formatCurrency(rdSummary?.avgTicketWon || 0), icon: 'bx-receipt', tone: 'gold' },
    { title: 'Taxa de fechamento', value: formatPercent(rdSummary?.closeRate || 0), icon: 'bx-target-lock', tone: 'pink' },
    { title: 'Lead para qualificação', value: formatPercent(rdSummary?.leadToQualifiedRate || 0), icon: 'bx-trending-up', tone: 'blue' },
    { title: 'Qualificação para venda', value: formatPercent(rdSummary?.qualifiedToWonRate || 0), icon: 'bx-badge-check', tone: 'emerald' },
    { title: 'Tempo até a compra', value: formatDurationDays(rdSummary?.avgLeadToWonDays || 0), icon: 'bx-time-five', tone: 'orange' },
    { title: 'Tempo da negociação', value: formatDurationDays(rdSummary?.avgDealToWonDays || 0), icon: 'bx-timer', tone: 'purple' },
  ]
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
          <button type="button" data-tooltip="Clientes" className={`nav-item nav-button ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
            <i className="bx bxs-buildings"></i> Clientes
          </button>
          <button type="button" data-tooltip="Apresentação" className={`nav-item nav-button ${activeTab === 'apresentacao' ? 'active' : ''}`} onClick={() => setActiveTab('apresentacao')}>
            <i className="bx bxs-dashboard"></i> Apresentação
          </button>
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
              {activeTab === 'apresentacao' && `Dashboard ${activeClient?.name || 'do cliente'}`}
            </h1>
            <p>
              {activeTab === 'clientes' && 'Cadastre seus clientes e mantenha cada operação separada dentro do dashboard.'}
              {activeTab === 'apresentacao' && (activePresentationView?.subtitle || 'Uma visão executiva dos principais resultados, com base nas contas configuradas para este cliente.')}
            </p>
          </div>

          <div className="header-actions header-actions-wrap">
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

            {activeTab === 'apresentacao' && (
              <>
                {dateRange === 'custom' && (
                  <div className="date-picker glass-item custom-range">
                    <input type="date" value={customSince} onChange={(event) => setCustomSince(event.target.value)} />
                    <span>até</span>
                    <input type="date" value={customUntil} onChange={(event) => setCustomUntil(event.target.value)} />
                  </div>
                )}

                <div className="date-picker glass-item">
                  <i className="bx bx-calendar"></i>
                  <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
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
                Aqui você edita o cliente inteiro: integrações, cor da dashboard e logo que vai aparecer na apresentação final.
              </p>
            </div>

            <form className="glass-panel client-create-bar" onSubmit={handleCreateClient}>
              <div>
                <h3>Novo cliente</h3>
                <p>Crie um cliente e depois ajuste a configuração dele logo abaixo.</p>
              </div>
              <div className="client-create-inline">
                <input type="text" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Ex.: Clínica X, E-commerce Y..." />
                <button type="submit" className="btn btn-primary">Adicionar cliente</button>
              </div>
            </form>

            <div className="clients-grid">
              <div className="clients-sidebar">
                <div className="glass-panel client-list-card">
                  <h3>Clientes cadastrados</h3>
                  <div className="client-list">
                    {clients.map((client) => (
                      <div key={client.id} className={`client-row ${client.id === activeClientId ? 'selected' : ''}`}>
                        <button type="button" className="client-select" onClick={() => setActiveClientId(client.id)}>
                          <strong>{client.name}</strong>
                          <span>{client.metaAdAccountId || 'Meta não definida'}</span>
                        </button>
                        {clients.length > 1 && (
                          <button type="button" className="client-delete" onClick={() => handleRemoveClient(client.id)}>
                            Excluir
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {activeClient && (
                <form className="glass-panel client-editor-card" onSubmit={handleSaveIntegrations}>
                  <div className="client-editor-header">
                    <div>
                      <h3>Editando: {activeClient.name}</h3>
                      <p>Qualquer ajuste aqui já define como a dash desse cliente vai abrir.</p>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isSavingIntegrations}>
                      {isSavingIntegrations ? 'Salvando...' : 'Salvar cliente'}
                    </button>
                  </div>

                  <div className="branding-grid">
                    <div className="integration-block">
                      <div className="integration-heading">
                        <div className="integration-icon" style={{ color: currentTheme.main, borderColor: `${currentTheme.main}33` }}>
                          <i className="bx bx-id-card"></i>
                        </div>
                        <div>
                          <h3>Dados do cliente</h3>
                          <p>Esses dados organizam a conta e já alimentam a apresentação final.</p>
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Nome do cliente</label>
                        <input type="text" value={activeClient.name} onChange={(event) => handleClientFieldChange('name', event.target.value)} placeholder="Nome do cliente" />
                      </div>
                    </div>

                    <div className="integration-block">
                      <div className="integration-heading">
                        <div className="integration-icon" style={{ color: currentTheme.main, borderColor: `${currentTheme.main}33` }}>
                          <i className="bx bx-palette"></i>
                        </div>
                        <div>
                          <h3>Branding da dash</h3>
                          <p>Escolha a cor e a logo que vão aparecer no dashboard desse cliente.</p>
                        </div>
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

                      <div className="logo-preview">
                        {activeClient.logoUrl ? <img src={activeClient.logoUrl} alt={`Logo ${activeClient.name}`} /> : <span>Sem logo definida</span>}
                      </div>
                    </div>
                  </div>

                  <div className="form-grid">
                    {INTEGRATION_GROUPS.map((group) => (
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
                          <div className="input-group">
                            <label>Etapas qualificadas do pipeline</label>
                            <p className="field-helper">
                              Selecione quais etapas devem contar como qualificadas. O mini funil e as taxas do CRM vão usar essa definição com base nas criações do período.
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
                                  Salve o token do RD e aguarde a leitura das negociações para listar as etapas disponíveis.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </form>
              )}
            </div>
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
                  {activePresentationView?.heroCopy || 'A seguir, apresentamos um panorama dos principais indicadores do período selecionado, considerando exclusivamente as integrações configuradas para esta operação.'}
                </p>
              </div>
              <div className="hero-meta">
                <div className="integration-switcher">
                  <span className="integration-switcher-label">Visualização disponível</span>
                  <div className="integration-switcher-list">
                    {availablePresentationViews.length > 0 ? (
                      availablePresentationViews.map((view) => (
                        <button
                          key={view.key}
                          type="button"
                          className={`integration-view-chip ${activePresentationView?.key === view.key ? 'active' : ''}`}
                          onClick={() => setPresentationView(view.key)}
                          style={{
                            color: activePresentationView?.key === view.key ? view.accent : undefined,
                            borderColor: activePresentationView?.key === view.key ? `${view.accent}66` : undefined,
                          }}
                        >
                          <i className={`bx ${view.icon}`}></i>
                          <span>{view.title}</span>
                        </button>
                      ))
                    ) : (
                      <div className="hero-stat hero-stat-empty">
                        <span>Nenhuma integração ativa</span>
                        <strong>Cadastre uma operação em Clientes</strong>
                      </div>
                    )}
                  </div>
                </div>

                {activePresentationView?.key === 'meta' && (
                  <>
                    <div className="hero-stat">
                      <span>Meta Ads</span>
                      <strong>{selectedAdAccount || 'Defina a conta do cliente'}</strong>
                    </div>
                    <div className="hero-stat">
                      <span>Demais integrações mapeadas</span>
                      <strong>{[
                        activeClient?.googleAdsAccountId,
                        activeClient?.tiktokAdsAccountId,
                        activeClient?.linkedInAdsAccountId,
                        activeClient?.rdStationAccountId,
                        activeClient?.salesforceAccountId,
                        activeClient?.agendorAccountId,
                      ].filter(Boolean).length} conta(s) vinculada(s)</strong>
                    </div>
                  </>
                )}

                {activePresentationView?.key === 'rd' && (
                  <>
                    <div className="hero-stat">
                      <span>Vendedor</span>
                      <div className="hero-select-wrap">
                        <select value={rdSellerFilter} onChange={(event) => setRdSellerFilter(event.target.value)} className="hero-select">
                          <option value="all">Todos os vendedores</option>
                          {(rdSummary?.sellers || []).map((seller) => (
                            <option key={seller.id} value={seller.id}>
                              {seller.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="hero-stat">
                      <span>RD Station</span>
                      <strong>{activeClient?.rdStationAccountId || 'Token configurado para este cliente'}</strong>
                    </div>
                    <div className="hero-stat">
                      <span>Etapas qualificadas</span>
                      <strong>{selectedQualifiedStages.length ? formatNumber(selectedQualifiedStages.length) : 'Todas as criações'}</strong>
                    </div>
                  </>
                )}
              </div>
            </section>

            {errorMessage && <div className="feedback-banner">{errorMessage}</div>}

            {!activeClient ? (
              <div className="empty-panel glass-panel">
                <h3>Crie um cliente primeiro</h3>
                <p>Use a aba de clientes para adicionar sua operação antes de abrir a apresentação.</p>
              </div>
            ) : isLoading ? (
              <div className="empty-panel glass-panel">
                <h3>Sincronizando com as APIs</h3>
                <p>Estamos puxando os dados da visualização {activePresentationView?.title || 'selecionada'} para {activeClient.name}.</p>
              </div>
            ) : availablePresentationViews.length === 0 ? (
              <div className="empty-panel glass-panel">
                <h3>Defina a operação do cliente</h3>
                <p>Cadastre ao menos uma integração do cliente para liberar a apresentação dinâmica da operação.</p>
                <button type="button" className="btn btn-primary" onClick={() => setActiveTab('clientes')}>
                  Abrir clientes
                </button>
              </div>
            ) : (
              <>
                {activePresentationView?.key === 'meta' && (
                  <>
                <section className="glass-panel grouped-results">
                  <div className="section-header section-header-stack">
                    <div>
                      <h2>Resumo de resultados</h2>
                      <p className="chart-subtitle">Os indicadores abaixo são organizados por tipo de resultado para facilitar a leitura da performance.</p>
                    </div>
                  </div>

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
                            onClick={() => replaceFunnelSteps([...activeFunnelSteps, key])}
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
                      onDrop={() => handleFunnelDrop(activeFunnelSteps.length)}
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
                            const campaignInsights = campaign.insights?.data?.[0] || {}
                            const actions = campaignInsights.actions || []
                            const valueActions = campaignInsights.action_values || []
                            const campaignSpend = parseFloat(campaignInsights.spend || 0)
                            const campaignPurchases = actions
                              .filter((item) => ['purchase', 'offsite_conversion.fb_pixel_purchase'].includes(item.action_type))
                              .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
                            const campaignLeads = actions
                              .filter((item) => ['lead', 'onsite_conversion.lead_grouped'].includes(item.action_type))
                              .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
                            const campaignMessages = actions
                              .filter((item) => ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'].includes(item.action_type))
                              .reduce((sum, item) => sum + parseInt(item.value || 0, 10), 0)
                            const campaignRevenue = valueActions
                              .filter((item) => ['purchase', 'offsite_conversion.fb_pixel_purchase'].includes(item.action_type))
                              .reduce((sum, item) => sum + parseFloat(item.value || 0), 0)
                            const campaignConversions = campaignPurchases + campaignLeads + campaignMessages
                            const campaignCpa = campaignConversions > 0 ? campaignSpend / campaignConversions : 0
                            const campaignRoas = campaignSpend > 0 ? campaignRevenue / campaignSpend : 0
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
                  </>
                )}

                {activePresentationView?.key === 'rd' && (
                  <>
                    <section className="glass-panel grouped-results">
                      <div className="section-header section-header-stack">
                        <div>
                          <h2>Resumo comercial</h2>
                          <p className="chart-subtitle">Os indicadores abaixo resumem o desempenho comercial identificado no RD Station para este cliente.</p>
                        </div>
                      </div>

                      <div className="result-group">
                        <div className="result-group-head">
                          <h3>Pipeline e receita</h3>
                          <p>Leitura consolidada do avanço comercial no CRM.</p>
                        </div>
                        <div className="kpi-grid compact-kpi-grid">
                          {rdKpis.map((kpi) => (
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
                      </div>
                    </section>

                    <section className="glass-panel grouped-results">
                      <div className="section-header section-header-stack">
                        <div>
                          <h2>Indicadores para decisão</h2>
                          <p className="chart-subtitle">Leituras de velocidade, conversão e qualidade da operação comercial para apoiar a próxima decisão.</p>
                        </div>
                      </div>

                      <div className="kpi-grid compact-kpi-grid">
                        {rdDecisionKpis.map((kpi) => (
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
                              <span>Leitura com base no vendedor e na integração selecionados</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {crmGroups.length > 0 && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Leitura executiva do CRM</h2>
                            <p className="chart-subtitle">Resumo objetivo para apresentar a evolução comercial do cliente.</p>
                          </div>
                        </div>

                        <div className="conversion-groups-grid crm-groups-grid">
                          {crmGroups.map((group) => (
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
                      </section>
                    )}

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

                    {!!rdSummary?.sourceRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Vendas por origem / UTM</h2>
                            <p className="chart-subtitle">Leitura das vendas agrupadas pelas origens e UTMs identificadas no CRM.</p>
                          </div>
                        </div>

                        <div className="ranking-list">
                          {rdSummary.sourceRanking.map((source) => (
                            <div key={source.label} className="ranking-row">
                              <div>
                                <strong>{source.label}</strong>
                                <span>{formatNumber(source.wonDeals)} venda(s)</span>
                              </div>
                              <b>{formatCurrency(source.wonRevenue)}</b>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {!!rdSummary?.stageRanking?.length && (
                      <section className="glass-panel grouped-results">
                        <div className="section-header section-header-stack">
                          <div>
                            <h2>Pipeline por etapa</h2>
                            <p className="chart-subtitle">Leitura por etapa com volume em aberto, fechamentos e valor atual de pipeline.</p>
                          </div>
                        </div>

                        <div className="ranking-list">
                          {rdSummary.stageRanking.map((stage) => (
                            <div key={stage.label} className="ranking-row ranking-row-rich">
                              <div>
                                <strong>{stage.label}</strong>
                                <span>
                                  {formatNumber(stage.openDeals)} em aberto, {formatNumber(stage.wonDeals)} ganhos, {formatNumber(stage.lostDeals)} perdidos
                                </span>
                              </div>
                              <div className="ranking-metrics">
                                <span>{formatCurrency(stage.pipelineValue || 0)} em aberto</span>
                                <b>{formatCurrency(stage.wonRevenue || 0)} vendido</b>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
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

        .client-list-card {
          padding: 24px;
        }

        .client-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .client-editor-header h3 {
          font-size: 24px;
          margin-bottom: 6px;
        }

        .client-editor-header p {
          color: var(--text-secondary);
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

        .integration-switcher {
          display: grid;
          gap: 10px;
        }

        .integration-switcher-label {
          color: var(--text-muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .integration-switcher-list {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .integration-view-chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
          padding: 0 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .integration-view-chip:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.05);
        }

        .integration-view-chip.active {
          background: rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        }

        .integration-view-chip i {
          font-size: 20px;
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
          margin-top: 18px;
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

        .input-group input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
        }

        .client-select-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: white;
          font-family: inherit;
        }

        .input-group input:focus {
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

          .form-actions-space {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
