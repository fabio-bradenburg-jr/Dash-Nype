'use client'

import type { ChangeEvent, CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { DEFAULT_USER_APPEARANCE } from '@/lib/user-appearance-storage'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'
import { DEFAULT_PREFERENCES, loadDashboardPreferences, saveDashboardPreferences } from '@/lib/dashboard-storage'
import {
  AI_PROVIDER_OPTIONS,
  createDefaultAiAgents,
  createDefaultAiProviders,
  DEFAULT_AI_DASHBOARD_PROMPT,
  DEFAULT_AI_DASHBOARD_PROMPT_JSON,
  getAiProviderOption,
  inspectAiDashboardPrompt,
  normalizeAiSettings,
} from '@/lib/ai-config'
import type { AiAgent, AiProviderConfig, AiProvidersMap, AiSettings } from '@/lib/types/ai'
import type { DashboardIntegrations } from '@/lib/types/dashboard'
import type { UserAppearance } from '@/lib/types/user'

interface IntegrationField {
  name: string
  label: string
  placeholder: string
}

interface IntegrationGroup {
  title: string
  description: string
  icon: string
  accent: string
  fields: IntegrationField[]
}

interface MetaConnectionState {
  connected: boolean
  userId: string
  userName: string
  scopes: string
  expiresAt: string
}

type SettingsTab = 'panel' | 'general' | 'operation' | 'calendar'

type GlobalIntegrationsState = DashboardIntegrations & Record<string, unknown>

interface SettingsServerState {
  globalIntegrations?: Partial<GlobalIntegrationsState>
  [key: string]: unknown
}

type BackgroundPreviewStyle = CSSProperties & {
  '--panel-bg-tint': string
}

function appearancesMatch(left: UserAppearance, right: UserAppearance): boolean {
  return left.mode === right.mode && left.accent === right.accent && left.backgroundTint === right.backgroundTint
}

const PANEL_BACKGROUND_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Azulado', value: '#3b82f6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Laranja', value: '#f59e0b' },
  { label: 'Rosa', value: '#f43f5e' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Turquesa', value: '#14b8a6' },
]

const GLOBAL_INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    title: 'Google Ads',
    description: 'Espaço reservado para a credencial central do Google Ads da operação.',
    icon: 'bxl-google',
    accent: '#f59e0b',
    fields: [
      {
        name: 'googleAdsToken',
        label: 'Token do Google Ads',
        placeholder: 'Cole aqui o token do Google Ads',
      },
    ],
  },
  {
    title: 'TikTok Ads',
    description: 'Espaço reservado para a credencial central do TikTok Ads da operação.',
    icon: 'bxl-tiktok',
    accent: '#ec4899',
    fields: [
      {
        name: 'tiktokAdsToken',
        label: 'Token do TikTok Ads',
        placeholder: 'Cole aqui o token do TikTok Ads',
      },
    ],
  },
  {
    title: 'LinkedIn Ads',
    description: 'Espaço reservado para a credencial central do LinkedIn Ads da operação.',
    icon: 'bxl-linkedin-square',
    accent: '#22c55e',
    fields: [
      {
        name: 'linkedinAdsToken',
        label: 'Token do LinkedIn Ads',
        placeholder: 'Cole aqui o token do LinkedIn Ads',
      },
    ],
  },
  {
    title: 'RD Station CRM',
    description: 'Token central usado para leitura dos funis, negociações e métricas comerciais.',
    icon: 'bx-signal-5',
    accent: '#14b8a6',
    fields: [
      {
        name: 'rdStationToken',
        label: 'Token do RD Station',
        placeholder: 'Cole aqui o token do RD Station',
      },
    ],
  },
  {
    title: 'ClickUp',
    description: 'Espaço reservado para integrações operacionais com gestão de tarefas.',
    icon: 'bx-task',
    accent: '#8b5cf6',
    fields: [
      {
        name: 'clickUpToken',
        label: 'Token do ClickUp',
        placeholder: 'Cole aqui o token do ClickUp',
      },
      {
        name: 'clickUpListIds',
        label: 'IDs das listas da operação',
        placeholder: '123456, 789012',
      },
    ],
  },
  {
    title: 'Monday',
    description: 'Espaço reservado para integrações operacionais com boards, status e responsáveis.',
    icon: 'bx-columns',
    accent: '#f59e0b',
    fields: [
      {
        name: 'mondayToken',
        label: 'Token do Monday',
        placeholder: 'Cole aqui o token do Monday',
      },
      {
        name: 'mondayBoardIds',
        label: 'IDs dos boards da operação',
        placeholder: '987654321, 123456789',
      },
    ],
  },
  {
    title: 'Salesforce',
    description: 'Espaço reservado para a credencial central do Salesforce.',
    icon: 'bxl-salesforce',
    accent: '#38bdf8',
    fields: [
      {
        name: 'salesforceToken',
        label: 'Token do Salesforce',
        placeholder: 'Cole aqui o token do Salesforce',
      },
    ],
  },
  {
    title: 'Agendor',
    description: 'Espaço reservado para a credencial central do Agendor.',
    icon: 'bx-briefcase-alt-2',
    accent: '#f97316',
    fields: [
      {
        name: 'agendorToken',
        label: 'Token do Agendor',
        placeholder: 'Cole aqui o token do Agendor',
      },
    ],
  },
]

const OPERATION_INTEGRATION_TITLES = new Set(['ClickUp', 'Monday'])
const AD_ACCOUNT_INTEGRATION_TITLES = new Set(['Google Ads', 'TikTok Ads', 'LinkedIn Ads'])
const CRM_INTEGRATION_TITLES = new Set(['RD Station CRM', 'Salesforce', 'Agendor'])

function clampRgbChannel(value: string | number): number {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(255, parsed))
}

function hexToRgb(hexValue: string): { r: number; g: number; b: number } {
  const normalized = String(hexValue || '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 59, g: 130, b: 246 }
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => clampRgbChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

export default function SettingsPage() {
  const { appearance, updateAppearance, access } = useUser()
  const canManageClients = Boolean(access?.canManageClients)
  const [serverState, setServerState] = useState<SettingsServerState | null>(null)
  const [globalIntegrations, setGlobalIntegrations] = useState<GlobalIntegrationsState>(() => {
    const preferences = loadDashboardPreferences()
    return {
      ...DEFAULT_PREFERENCES.globalIntegrations,
      ...(preferences.globalIntegrations || {}),
    } as GlobalIntegrationsState
  })
  const [metaConnection, setMetaConnection] = useState<MetaConnectionState>({
    connected: false,
    userId: '',
    userName: '',
    scopes: '',
    expiresAt: '',
  })
  const [isMetaConnectionLoading, setIsMetaConnectionLoading] = useState(false)
  const [metaConnectionError, setMetaConnectionError] = useState('')
  const [metaConnectionNotice, setMetaConnectionNotice] = useState('')
  const [metaConnectionSetupRequired, setMetaConnectionSetupRequired] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('panel')
  const [panelDraft, setPanelDraft] = useState<UserAppearance>(appearance)
  const [panelFeedback, setPanelFeedback] = useState('')
  const [settingsSaveFeedback, setSettingsSaveFeedback] = useState('')
  const metaConnectionMode = globalIntegrations.metaConnectionMode === 'oauth' ? 'oauth' : 'manual'
  const hasMetaManualToken = Boolean(String(globalIntegrations.metaAccessToken || '').trim())
  const hasMetaOauthConnection = Boolean(metaConnection.connected)
  const generalIntegrationGroups = GLOBAL_INTEGRATION_GROUPS.filter((group) => !OPERATION_INTEGRATION_TITLES.has(group.title))
  const operationIntegrationGroups = GLOBAL_INTEGRATION_GROUPS.filter((group) => OPERATION_INTEGRATION_TITLES.has(group.title))
  const advertisingIntegrationGroups = generalIntegrationGroups.filter((group) => AD_ACCOUNT_INTEGRATION_TITLES.has(group.title))
  const crmIntegrationGroups = generalIntegrationGroups.filter((group) => CRM_INTEGRATION_TITLES.has(group.title))
  const backgroundTintRgb = hexToRgb(panelDraft.backgroundTint)
  const backgroundPreviewStyle: BackgroundPreviewStyle = {
    '--panel-bg-tint': panelDraft.backgroundTint,
  }
  const selectedAiProvider = getAiProviderOption(globalIntegrations.aiProvider)
  const activeAiProviderConfig: AiProviderConfig =
    (globalIntegrations.aiProviders?.[selectedAiProvider.value] as AiProviderConfig | undefined) ||
    createDefaultAiProviders()[selectedAiProvider.value]
  const aiPromptInspection = inspectAiDashboardPrompt(globalIntegrations.aiDashboardPrompt)
  const availableAiAgents = Array.isArray(globalIntegrations.aiAgents) && globalIntegrations.aiAgents.length
    ? (globalIntegrations.aiAgents as AiAgent[])
    : createDefaultAiAgents()
  const [selectedAiAgentId, setSelectedAiAgentId] = useState<string>(availableAiAgents[0]?.id || 'copilot')
  const selectedAiAgent =
    availableAiAgents.find((agent) => agent.id === selectedAiAgentId) || availableAiAgents[0] || null
  const hasPendingPanelChanges = !appearancesMatch(panelDraft, appearance)

  useEffect(() => {
    setPanelDraft(appearance)
  }, [appearance])

  const persistGlobalIntegrations = useCallback(
    async (nextIntegrations: GlobalIntegrationsState) => {
      const preferences = loadDashboardPreferences()
      saveDashboardPreferences({
        ...preferences,
        globalIntegrations: nextIntegrations,
      })

      if (canManageClients && serverState) {
        const response = await fetch('/api/dashboard/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...serverState,
            globalIntegrations: nextIntegrations,
          }),
        })

        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível salvar as integrações globais.')
        }

        setServerState(data)
      }
    },
    [canManageClients, serverState]
  )

  useEffect(() => {
    if (!canManageClients) return

    let cancelled = false

    const loadServerState = async () => {
      try {
        const response = await fetch('/api/dashboard/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as SettingsServerState
        if (cancelled) return

        setServerState(state)
        setGlobalIntegrations((current) => {
          const nextIntegrations = {
            ...DEFAULT_PREFERENCES.globalIntegrations,
            ...current,
            ...(state.globalIntegrations || {}),
          }

          return {
            ...nextIntegrations,
            ...normalizeAiSettings(nextIntegrations),
          }
        })
    } catch (error) {
      console.error('Erro ao carregar integrações globais do servidor:', error)
    }
    }

    loadServerState()

    return () => {
      cancelled = true
    }
  }, [canManageClients])

  useEffect(() => {
    if (!canManageClients) return

    let cancelled = false

    const loadMetaConnection = async () => {
      setIsMetaConnectionLoading(true)

      try {
        const response = await fetch('/api/meta/connection', { cache: 'no-store' })
        const data = (await response.json().catch(() => null)) as
          | { connection?: MetaConnectionState; setupRequired?: boolean; error?: string }
          | null

        if (cancelled) return

        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível carregar a conexão da Meta.')
        }

        setMetaConnection(
          data?.connection || {
            connected: false,
            userId: '',
            userName: '',
            scopes: '',
            expiresAt: '',
          }
        )
        setMetaConnectionSetupRequired(Boolean(data?.setupRequired))
        if (data?.error) {
          setMetaConnectionError(data.error)
        }
      } catch (error) {
        if (cancelled) return
        setMetaConnection({
          connected: false,
          userId: '',
          userName: '',
          scopes: '',
          expiresAt: '',
        })
        setMetaConnectionError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a conexão da Meta.'
        )
      } finally {
        if (!cancelled) {
          setIsMetaConnectionLoading(false)
        }
      }
    }

    loadMetaConnection()

    return () => {
      cancelled = true
    }
  }, [canManageClients])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const connected = params.get('meta_connected')
    const error = params.get('meta_error')

    if (tab === 'operation') {
      setActiveSettingsTab('operation')
    } else if (tab === 'calendar') {
      setActiveSettingsTab('calendar')
    } else if (tab === 'ai') {
      setActiveSettingsTab('general')
    } else if (tab === 'general') {
      setActiveSettingsTab('general')
    } else if (tab === 'panel') {
      setActiveSettingsTab('panel')
    }

    if (connected === '1') {
      setMetaConnectionNotice('Conta da Meta conectada com sucesso.')
      setMetaConnectionError('')
      if (globalIntegrations.metaConnectionMode !== 'oauth') {
        const nextIntegrations = {
          ...globalIntegrations,
          metaConnectionMode: 'oauth',
        }
        setGlobalIntegrations(nextIntegrations)
        persistGlobalIntegrations(nextIntegrations).catch((persistError) => {
          console.error('Erro ao ativar o modo de conexão da Meta:', persistError)
        })
      }
    } else if (error) {
      setMetaConnectionError(error)
      setMetaConnectionNotice('')
    }
  }, [globalIntegrations, globalIntegrations.metaConnectionMode, persistGlobalIntegrations])

  useEffect(() => {
    if (!canManageClients && activeSettingsTab !== 'panel') {
      setActiveSettingsTab('panel')
    }
  }, [activeSettingsTab, canManageClients])

  useEffect(() => {
    if (!availableAiAgents.some((agent) => agent.id === selectedAiAgentId)) {
      setSelectedAiAgentId(availableAiAgents[0]?.id || 'copilot')
    }
  }, [availableAiAgents, selectedAiAgentId])

  const handleGlobalIntegrationChange = (fieldName: string, value: unknown) => {
    setGlobalIntegrations((current) => {
      const nextIntegrations = {
        ...current,
        [fieldName]: value,
      } as GlobalIntegrationsState

      persistGlobalIntegrations(nextIntegrations).catch((error) => {
        console.error('Erro ao salvar integrações globais no servidor:', error)
      })

      return nextIntegrations
    })
  }

  const handleAiProviderChange = (providerValue: string) => {
    const providerOption = getAiProviderOption(providerValue)

    setGlobalIntegrations((current) => {
      const nextProviders = {
        ...createDefaultAiProviders(),
        ...(current.aiProviders || {}),
      } as AiProvidersMap
      const currentProviderConfig =
        nextProviders[providerOption.value] || createDefaultAiProviders()[providerOption.value]
      const nextIntegrations = {
        ...current,
        aiProvider: providerOption.value,
        aiProviders: {
          ...nextProviders,
          [providerOption.value]: {
            baseUrl: String(currentProviderConfig.baseUrl || providerOption.baseUrl || '').trim(),
            apiKey: String(currentProviderConfig.apiKey || '').trim(),
            model: String(currentProviderConfig.model || '').trim(),
          },
        },
      } as GlobalIntegrationsState

      const normalizedNextIntegrations = {
        ...nextIntegrations,
        ...normalizeAiSettings(nextIntegrations),
      } as GlobalIntegrationsState

      persistGlobalIntegrations(normalizedNextIntegrations).catch((error) => {
        console.error('Erro ao salvar configurações de IA no servidor:', error)
      })

      return normalizedNextIntegrations
    })
  }

  const handleAiProviderFieldChange = (
    fieldName: keyof AiProviderConfig,
    value: string
  ) => {
    setGlobalIntegrations((current) => {
      const providerKey = getAiProviderOption(current.aiProvider).value
      const nextProviders = {
        ...createDefaultAiProviders(),
        ...(current.aiProviders || {}),
      } as AiProvidersMap
      const currentProviderConfig =
        nextProviders[providerKey] || createDefaultAiProviders()[providerKey]
      const nextIntegrations = {
        ...current,
        aiProviders: {
          ...nextProviders,
          [providerKey]: {
            ...currentProviderConfig,
            [fieldName]: value,
          },
        },
      } as GlobalIntegrationsState
      const normalizedNextIntegrations = {
        ...nextIntegrations,
        ...normalizeAiSettings(nextIntegrations),
      } as GlobalIntegrationsState

      persistGlobalIntegrations(normalizedNextIntegrations).catch((error) => {
        console.error('Erro ao salvar credenciais do provider de IA:', error)
      })

      return normalizedNextIntegrations
    })
  }

  const handleApplyPromptTemplate = (mode: 'text' | 'json') => {
    handleGlobalIntegrationChange(
      'aiDashboardPrompt',
      mode === 'json' ? DEFAULT_AI_DASHBOARD_PROMPT_JSON : DEFAULT_AI_DASHBOARD_PROMPT
    )
  }

  const handleAiAgentsChange = (nextAgents: AiAgent[]) => {
    const normalizedAgents = nextAgents.filter((agent) => agent.id && agent.name.trim() && agent.prompt.trim())
    handleGlobalIntegrationChange('aiAgents', normalizedAgents)
  }

  const handleCreateAiAgent = () => {
    const nextAgent: AiAgent = {
      id: `agent-${Date.now()}`,
      name: 'Novo agente',
      description: 'Descreva o foco desse agente.',
      prompt: 'Explique como esse agente deve se comportar, o tom, o foco e o tipo de resposta esperado.',
    }
    const nextAgents = [...availableAiAgents, nextAgent]
    handleAiAgentsChange(nextAgents)
    setSelectedAiAgentId(nextAgent.id)
  }

  const handleAiAgentFieldChange = (agentId: string, fieldName: keyof AiAgent, value: string) => {
    const nextAgents = availableAiAgents.map((agent) =>
      agent.id === agentId ? { ...agent, [fieldName]: value } : agent
    )
    handleAiAgentsChange(nextAgents)
  }

  const handleRemoveAiAgent = (agentId: string) => {
    if (availableAiAgents.length <= 1) return
    const nextAgents = availableAiAgents.filter((agent) => agent.id !== agentId)
    handleAiAgentsChange(nextAgents)
    if (selectedAiAgentId === agentId) {
      setSelectedAiAgentId(nextAgents[0]?.id || 'copilot')
    }
  }

  const handleFormatJsonPrompt = () => {
    if (!aiPromptInspection.isJson || !aiPromptInspection.isValid) return

    try {
      const formatted = JSON.stringify(JSON.parse(globalIntegrations.aiDashboardPrompt), null, 2)
      handleGlobalIntegrationChange('aiDashboardPrompt', formatted)
    } catch (error) {
      console.error('Erro ao formatar prompt JSON:', error)
    }
  }

  const handleMetaDisconnect = async () => {
    setMetaConnectionError('')
    setMetaConnectionNotice('')

    try {
      const response = await fetch('/api/meta/connection', { method: 'DELETE' })
      const data = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível desconectar a conta da Meta.')
      }

      setMetaConnection({
        connected: false,
        userId: '',
        userName: '',
        scopes: '',
        expiresAt: '',
      })
      setMetaConnectionNotice('Conta da Meta desconectada.')

      if (metaConnectionMode === 'oauth') {
        const nextIntegrations = {
          ...globalIntegrations,
          metaConnectionMode: 'manual',
        } as GlobalIntegrationsState

        setGlobalIntegrations(nextIntegrations)
        await persistGlobalIntegrations(nextIntegrations)
      }
    } catch (error) {
      setMetaConnectionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível desconectar a conta da Meta.'
      )
    }
  }

  const updatePanelDraft = (updater: UserAppearance | ((current: UserAppearance) => UserAppearance)) => {
    setPanelDraft((current) => (typeof updater === 'function' ? updater(current) : updater))
    setPanelFeedback('')
  }

  const handleBackgroundRgbChannelChange = (
    channel: 'r' | 'g' | 'b',
    value: string
  ) => {
    updatePanelDraft((current) => {
      const currentRgb = hexToRgb(current.backgroundTint)
      const nextRgb = {
        ...currentRgb,
        [channel]: clampRgbChannel(value),
      }

      return {
        ...current,
        backgroundTint: rgbToHex(nextRgb),
      }
    })
  }

  const handleResetPanelDraft = () => {
    setPanelDraft(appearance || (DEFAULT_USER_APPEARANCE as UserAppearance))
    setPanelFeedback('')
    setSettingsSaveFeedback('')
  }

  const handleSavePanelPreferences = () => {
    updateAppearance(panelDraft)
    setPanelFeedback('Preferências visuais salvas e aplicadas neste navegador.')
    setSettingsSaveFeedback('Preferências visuais salvas e aplicadas neste navegador.')
  }

  const handleSaveCurrentSettings = async () => {
    setSettingsSaveFeedback('')

    if (hasPendingPanelChanges) {
      updateAppearance(panelDraft)
      setPanelFeedback('Preferências visuais salvas e aplicadas neste navegador.')
      setSettingsSaveFeedback('Preferências visuais salvas e aplicadas neste navegador.')
      return
    }

    if (canManageClients) {
      try {
        await persistGlobalIntegrations(globalIntegrations)
        setSettingsSaveFeedback('Configurações da operação sincronizadas com sucesso.')
      } catch (error) {
        setSettingsSaveFeedback(
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar as configurações da operação.'
        )
      }
      return
    }

    setSettingsSaveFeedback('Não há alterações pendentes para salvar nesta aba.')
  }

  const handleSettingsTabChange = (nextTab: SettingsTab) => {
    setActiveSettingsTab(nextTab)

    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('tab', nextTab)
    const nextQuery = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`)
  }

  return (
    <div className="dashboard-container">
      <aside className="sidebar glass-panel">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <span>Dash</span>
        </div>

        <nav className="nav-menu">
          <Link href="/home" className="nav-item">
            <i className="bx bxs-home-heart"></i>
            Home
          </Link>
          <Link href="/privacy" className="nav-item" target="_blank" rel="noreferrer">
            <i className="bx bx-shield-quarter"></i>
            Política e Privacidade
          </Link>
          <span className="nav-item active">
            <i className="bx bx-cog"></i>
            Configurações
          </span>
        </nav>
      </aside>

      <main className="main-content settings-main">
        <section className="glass-panel settings-panel">
          <div className="settings-head">
            <div>
              <h1>Configurações</h1>
              <p>Centralize aqui a aparência da sua conta e as credenciais globais da operação.</p>
            </div>
            <Link href="/home" className="btn btn-secondary">
              Voltar
            </Link>
          </div>

          <div className="settings-shell">
            <aside className="glass-item settings-section-sidebar">
              <div className="settings-sidebar-title">
                <span>Digital Obsidian</span>
                <strong>Escolha a camada da experiência que quer ajustar</strong>
              </div>

              <div className="settings-sidebar-nav">
                <button
                  type="button"
                  className={`settings-sidebar-link ${activeSettingsTab === 'panel' ? 'active' : ''}`}
                  onClick={() => handleSettingsTabChange('panel')}
                >
                      <i className="bx bx-layout"></i>
                      <div>
                        <strong>Interface</strong>
                        <span>Modo, destaque e atmosfera do sistema.</span>
                      </div>
                    </button>

                {canManageClients && (
                  <>
                    <button
                      type="button"
                      className={`settings-sidebar-link ${activeSettingsTab === 'general' ? 'active' : ''}`}
                      onClick={() => handleSettingsTabChange('general')}
                    >
                      <i className="bx bx-link-alt"></i>
                      <div>
                        <strong>Integrações gerais</strong>
                        <span>Credenciais de mídia, CRM e IA.</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-sidebar-link ${activeSettingsTab === 'operation' ? 'active' : ''}`}
                      onClick={() => handleSettingsTabChange('operation')}
                    >
                      <i className="bx bx-cog"></i>
                      <div>
                        <strong>Operação</strong>
                        <span>Boards, ferramentas e IDs globais.</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-sidebar-link ${activeSettingsTab === 'calendar' ? 'active' : ''}`}
                      onClick={() => handleSettingsTabChange('calendar')}
                    >
                      <i className="bx bx-calendar-event"></i>
                      <div>
                        <strong>Agenda</strong>
                        <span>Google Calendar e rotina operacional.</span>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </aside>

            <div className="settings-section-content">
              {activeSettingsTab === 'panel' && (
                <div className="settings-panel-layout settings-panel-layout-obsidian">
                  <div className="glass-item settings-block settings-block-full settings-block-hero">
                    <div className="settings-section-head">
                      <div>
                        <span className="settings-hero-kicker">Configuração visual</span>
                        <h2>Interface do sistema</h2>
                        <p>Personalize o app dentro da linguagem Digital Obsidian, com foco em contraste, profundidade e leitura executiva.</p>
                      </div>
                    </div>

                    <div className="settings-mode-grid">
                      <button
                        type="button"
                        className={`settings-mode-card ${panelDraft.mode === 'dark' ? 'active' : ''}`}
                        onClick={() => updatePanelDraft((current) => ({ ...current, mode: 'dark' }))}
                      >
                        <div className="settings-mode-preview settings-mode-preview-dark">
                          <span></span>
                          <span></span>
                          <div>
                            <i className="bx bx-circle"></i>
                            <strong></strong>
                          </div>
                        </div>
                        <div className="settings-mode-copy">
                          <strong>Escuro</strong>
                          <p>Otimizado para foco, profundidade e menor fadiga visual.</p>
                        </div>
                        {panelDraft.mode === 'dark' ? (
                          <span className="settings-mode-check">
                            <i className="bx bx-check"></i>
                          </span>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        className={`settings-mode-card ${panelDraft.mode === 'light' ? 'active' : ''}`}
                        onClick={() => updatePanelDraft((current) => ({ ...current, mode: 'light' }))}
                      >
                        <div className="settings-mode-preview settings-mode-preview-light">
                          <span></span>
                          <span></span>
                          <div>
                            <i className="bx bx-circle"></i>
                            <strong></strong>
                          </div>
                        </div>
                        <div className="settings-mode-copy">
                          <strong>Claro</strong>
                          <p>Alta legibilidade para ambientes iluminados e leitura aberta.</p>
                        </div>
                        {panelDraft.mode === 'light' ? (
                          <span className="settings-mode-check">
                            <i className="bx bx-check"></i>
                          </span>
                        ) : null}
                      </button>
                    </div>

                    <div className="settings-grid settings-grid-obsidian">
                      <div className="glass-item settings-block settings-block-obsidian">
                        <div className="settings-obsidian-head">
                          <div>
                            <span>Cor de destaque</span>
                            <h2>Assinatura visual</h2>
                          </div>
                          <p>Define a energia dos botões, links ativos e detalhes de navegação do sistema.</p>
                        </div>

                        <div className="settings-color-showcase">
                          <div className="settings-color-display" style={{ '--settings-accent': panelDraft.accent } as CSSProperties}>
                            <i className="bx bx-palette"></i>
                          </div>
                          <div className="settings-color-code">
                            <label>Hex selecionado</label>
                            <div className="settings-color-code-row">
                              <input
                                type="text"
                                value={panelDraft.accent.toUpperCase()}
                                readOnly
                                aria-label="Código hexadecimal da cor de destaque"
                              />
                              <button
                                type="button"
                                className="settings-copy-button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(panelDraft.accent.toUpperCase())
                                  setPanelFeedback('Código da cor copiado para a área de transferência.')
                                }}
                              >
                                <i className="bx bx-copy"></i>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="settings-color-picker">
                          <input
                            type="color"
                            value={panelDraft.accent}
                            onChange={(event) => updatePanelDraft((current) => ({ ...current, accent: event.target.value }))}
                            aria-label="Selecionar cor de destaque"
                          />
                          <div className="settings-color-code">
                            <strong>{panelDraft.accent.toUpperCase()}</strong>
                            <span>Aplicado quando você salvar as preferências visuais.</span>
                          </div>
                        </div>

                        <div className="settings-preset-grid settings-preset-grid-swatches">
                          {USER_APPEARANCE_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              className={`settings-preset settings-preset-swatch-card ${panelDraft.accent === preset.value ? 'active' : ''}`}
                              onClick={() => updatePanelDraft((current) => ({ ...current, accent: preset.value }))}
                            >
                              <span className="settings-preset-swatch" style={{ background: preset.value }}></span>
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="glass-item settings-block settings-block-full settings-block-obsidian">
                        <div className="settings-obsidian-head">
                          <div>
                            <span>Atmosfera de fundo</span>
                            <h2>Profundidade e névoa do sistema</h2>
                          </div>
                          <p>Controle a cor que sustenta o gradiente e a sensação de fundo da interface inteira.</p>
                        </div>

                        <div className="settings-background-shell">
                          <div className="settings-background-preview" style={backgroundPreviewStyle}>
                            <div className="settings-background-preview-card">
                              <span>Prévia do fundo</span>
                              <strong>{panelDraft.backgroundTint.toUpperCase()}</strong>
                              <small>{`rgb(${backgroundTintRgb.r}, ${backgroundTintRgb.g}, ${backgroundTintRgb.b})`}</small>
                            </div>
                          </div>

                          <div className="settings-background-controls">
                            <div className="settings-color-picker">
                              <input
                                type="color"
                                value={panelDraft.backgroundTint}
                                onChange={(event) => updatePanelDraft((current) => ({ ...current, backgroundTint: event.target.value }))}
                                aria-label="Selecionar cor do fundo do app"
                              />
                              <div className="settings-color-code">
                                <strong>{panelDraft.backgroundTint.toUpperCase()}</strong>
                                <span>Essa cor sustenta a névoa do app inteiro.</span>
                              </div>
                            </div>

                            <div className="settings-rgb-grid">
                              <label className="settings-rgb-field">
                                <span>R</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="255"
                                  value={backgroundTintRgb.r}
                                  onChange={(event) => handleBackgroundRgbChannelChange('r', event.target.value)}
                                />
                              </label>
                              <label className="settings-rgb-field">
                                <span>G</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="255"
                                  value={backgroundTintRgb.g}
                                  onChange={(event) => handleBackgroundRgbChannelChange('g', event.target.value)}
                                />
                              </label>
                              <label className="settings-rgb-field">
                                <span>B</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="255"
                                  value={backgroundTintRgb.b}
                                  onChange={(event) => handleBackgroundRgbChannelChange('b', event.target.value)}
                                />
                              </label>
                            </div>

                            <div className="settings-preset-grid">
                              {PANEL_BACKGROUND_PRESETS.map((preset) => (
                                <button
                                  key={preset.value}
                                  type="button"
                                  className={`settings-preset ${panelDraft.backgroundTint === preset.value ? 'active' : ''}`}
                                  onClick={() => updatePanelDraft((current) => ({ ...current, backgroundTint: preset.value }))}
                                >
                                  <span className="settings-preset-swatch" style={{ background: preset.value }}></span>
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {canManageClients && activeSettingsTab === 'general' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>Integrações globais</h2>
                      <p>Essas credenciais abastecem a operação inteira. Depois, em cada cliente, você escolhe apenas as contas e funis vinculados.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Contas de anúncio</span>
                        <h3>Mídia e plataformas de aquisição</h3>
                        <p>Concentre aqui as credenciais que alimentam leitura de mídia, campanhas e resultado por conta.</p>
                      </div>

                      <div className="settings-integrations-grid settings-category-grid">
                        <div className="integration-block integration-block-meta">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#3b82f6', borderColor: '#3b82f633' }}>
                              <i className="bx bxl-meta"></i>
                            </div>
                            <div>
                              <h3>Meta Ads</h3>
                              <p>Escolha entre token manual ou conta conectada via Meta Login, e use a forma que fizer mais sentido para cada operação.</p>
                            </div>
                          </div>

                          <div className="settings-choice-row settings-choice-row-compact">
                            <button
                              type="button"
                              className={`settings-choice ${metaConnectionMode === 'manual' ? 'active' : ''}`}
                              onClick={() => handleGlobalIntegrationChange('metaConnectionMode', 'manual')}
                            >
                              <i className="bx bx-key"></i>
                              Token manual
                            </button>
                            <button
                              type="button"
                              className={`settings-choice ${metaConnectionMode === 'oauth' ? 'active' : ''}`}
                              onClick={() => handleGlobalIntegrationChange('metaConnectionMode', 'oauth')}
                            >
                              <i className="bx bx-link-alt"></i>
                              Conta conectada
                            </button>
                          </div>

                          {metaConnectionMode === 'manual' ? (
                            <div className="input-group">
                              <label>Token manual da Meta</label>
                              <input
                                type="password"
                                value={globalIntegrations.metaAccessToken || ''}
                                onChange={(event) => handleGlobalIntegrationChange('metaAccessToken', event.target.value)}
                                placeholder="Cole aqui o token de acesso da Meta"
                              />
                              <small className="settings-help-text">
                                {hasMetaManualToken
                                  ? 'Token manual salvo. Você pode seguir usando esse modo normalmente.'
                                  : 'Cole o token da Meta para vincular a conta manualmente.'}
                              </small>
                            </div>
                          ) : (
                            <>
                              <div className="meta-connection-card">
                                <div className="meta-connection-copy">
                                  <strong>{hasMetaOauthConnection ? 'Conta conectada' : 'Conta ainda não conectada'}</strong>
                                  <span>
                                    {hasMetaOauthConnection
                                      ? `${metaConnection.userName || 'Usuário Meta'} conectado${metaConnection.expiresAt ? ` até ${new Date(metaConnection.expiresAt).toLocaleDateString('pt-BR')}` : ''}.`
                                      : 'Conecte sua conta da Meta para vincular a operação por login.'}
                                  </span>
                                </div>
                                <div className="meta-connection-actions">
                                  <a href="/api/meta/auth/start?return_to=/settings?tab=general" className="btn btn-primary">
                                    {hasMetaOauthConnection ? 'Reconectar Meta' : 'Conectar Meta'}
                                  </a>
                                  {hasMetaOauthConnection && (
                                    <button type="button" className="btn btn-secondary" onClick={handleMetaDisconnect}>
                                      Desconectar
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="meta-connection-guide">
                                <div className="meta-connection-guide-card">
                                  <span className="meta-connection-guide-kicker">Status</span>
                                  <strong>{hasMetaOauthConnection ? 'Conexão pronta para uso' : 'Conexão ainda pendente'}</strong>
                                  <p>
                                    {hasMetaOauthConnection
                                      ? 'A conta da Meta já está vinculada a esta operação e pode ser usada para listar contas de anúncio.'
                                      : 'Conecte uma conta com acesso ao Business Manager e às contas de anúncio que você quer usar no app.'}
                                  </p>
                                </div>

                                <div className="meta-connection-guide-card">
                                  <span className="meta-connection-guide-kicker">Infraestrutura</span>
                                  <strong>{metaConnectionSetupRequired ? 'Falta liberar a tabela da conexão' : 'Base pronta para autenticação'}</strong>
                                  <p>
                                    {metaConnectionSetupRequired
                                      ? 'A tabela workspace_meta_connections ainda não existe no Supabase. Sem ela, o login conecta mas não consegue persistir a sessão da Meta.'
                                      : 'A persistência da conexão está pronta. O próximo passo é garantir redirect URI e permissões avançadas no Facebook Developers.'}
                                  </p>
                                </div>

                                <div className="meta-connection-guide-card">
                                  <span className="meta-connection-guide-kicker">Próximos passos</span>
                                  <strong>Checklist do Facebook Developers</strong>
                                  <div className="meta-connection-checklist">
                                    <span>1. Configure a redirect URI com <code>/api/meta/auth/callback</code>.</span>
                                    <span>2. Ative <code>Login OAuth na Web</code> e mantenha HTTPS ligado.</span>
                                    <span>3. Use a página pública em <Link href="/privacy" target="_blank" rel="noreferrer">Política e Privacidade</Link>.</span>
                                    <span>4. Solicite <code>ads_read</code>, <code>ads_management</code> e <code>business_management</code> com acesso avançado.</span>
                                  </div>
                                </div>
                              </div>

                              {metaConnectionNotice ? <div className="settings-callout success">{metaConnectionNotice}</div> : null}
                              {metaConnectionError ? <div className="settings-callout error">{metaConnectionError}</div> : null}
                              {metaConnectionSetupRequired ? (
                                <div className="settings-callout warning">
                                  Falta aplicar a migration da tabela <code>workspace_meta_connections</code> no Supabase para liberar a conexão da Meta.
                                </div>
                              ) : null}
                              {isMetaConnectionLoading ? <div className="settings-callout info">Carregando status da conexão da Meta...</div> : null}
                            </>
                          )}
                        </div>

                        {advertisingIntegrationGroups.map((group) => (
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

                            {group.fields.map((field) => (
                              <div key={field.name} className="input-group">
                                <label>{field.label}</label>
                                <input
                                  type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                                  value={String(globalIntegrations[field.name] || '')}
                                  onChange={(event) => handleGlobalIntegrationChange(field.name, event.target.value)}
                                  placeholder={field.placeholder}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">CRMs</span>
                        <h3>Comercial, funis e relacionamento</h3>
                        <p>Separe aqui as credenciais usadas para pipelines, oportunidades, vendas e acompanhamento comercial.</p>
                      </div>

                      <div className="settings-integrations-grid settings-category-grid">
                        {crmIntegrationGroups.map((group) => (
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

                            {group.fields.map((field) => (
                              <div key={field.name} className="input-group">
                                <label>{field.label}</label>
                                <input
                                  type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                                  value={String(globalIntegrations[field.name] || '')}
                                  onChange={(event) => handleGlobalIntegrationChange(field.name, event.target.value)}
                                  placeholder={field.placeholder}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">IA</span>
                        <h3>Configuração da IA da operação</h3>
                        <p>A área de uso da IA fica na Home, mas a configuração do provider e do prompt continua centralizada aqui.</p>
                      </div>

                      <div className="settings-integrations-grid settings-category-grid">
                        <div className="integration-block integration-block-meta">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#8b5cf6', borderColor: '#8b5cf633' }}>
                              <i className="bx bx-bot"></i>
                            </div>
                            <div>
                              <h3>Insights com IA</h3>
                              <p>Você pode manter várias chaves salvas. O app usa sempre a IA selecionada como ativa, sem perder as configurações das demais.</p>
                            </div>
                          </div>

                          <div className="settings-choice-row settings-choice-row-compact">
                            <button
                              type="button"
                              className={`settings-choice ${globalIntegrations.aiAnalysisEnabled ? 'active' : ''}`}
                              onClick={() => handleGlobalIntegrationChange('aiAnalysisEnabled', true)}
                            >
                              <i className="bx bx-check-circle"></i>
                              Ativar análise
                            </button>
                            <button
                              type="button"
                              className={`settings-choice ${!globalIntegrations.aiAnalysisEnabled ? 'active' : ''}`}
                              onClick={() => handleGlobalIntegrationChange('aiAnalysisEnabled', false)}
                            >
                              <i className="bx bx-x-circle"></i>
                              Pausar análise
                            </button>
                          </div>

                          <div className="settings-ai-grid">
                            <div className="input-group">
                              <label>IA ativa</label>
                              <select
                                value={globalIntegrations.aiProvider || selectedAiProvider.value}
                                onChange={(event) => handleAiProviderChange(event.target.value)}
                              >
                                {AI_PROVIDER_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <small>{selectedAiProvider.description}</small>
                            </div>

                            <div className="input-group">
                              <label>Base URL</label>
                              <input
                                type="text"
                                value={activeAiProviderConfig?.baseUrl || ''}
                                onChange={(event) => handleAiProviderFieldChange('baseUrl', event.target.value)}
                                placeholder="https://api.openai.com/v1"
                              />
                              <small>Essa Base URL fica salva só para {selectedAiProvider.label}.</small>
                            </div>

                            <div className="input-group">
                              <label>Modelo</label>
                              <input
                                type="text"
                                value={activeAiProviderConfig?.model || ''}
                                onChange={(event) => handleAiProviderFieldChange('model', event.target.value)}
                                placeholder={selectedAiProvider.modelPlaceholder}
                              />
                            </div>

                            <div className="input-group">
                              <label>Chave da API</label>
                              <input
                                type="password"
                                value={activeAiProviderConfig?.apiKey || ''}
                                onChange={(event) => handleAiProviderFieldChange('apiKey', event.target.value)}
                                placeholder="Cole aqui a chave da API"
                              />
                            </div>
                          </div>

                          <div className="settings-callout info">
                            A chamada da IA roda somente no servidor. Claude usa a API nativa da Anthropic, Gemini funciona pelo endpoint compatível, e OpenRouter/Groq/Manus podem ser configurados pela Base URL do provider. Trocar a IA ativa não apaga os dados salvos das outras.
                          </div>
                        </div>

                        <div className="integration-block integration-block-meta">
                          <div className="input-group">
                            <label>Prompt do dashboard</label>
                            <div className="settings-choice-row settings-choice-row-compact">
                              <button
                                type="button"
                                className="settings-choice"
                                onClick={() => handleApplyPromptTemplate('text')}
                              >
                                <i className="bx bx-text"></i>
                                Modelo texto
                              </button>
                              <button
                                type="button"
                                className={`settings-choice ${aiPromptInspection.isJson ? 'active' : ''}`}
                                onClick={() => handleApplyPromptTemplate('json')}
                              >
                                <i className="bx bx-code-curly"></i>
                                Modelo JSON
                              </button>
                              <button
                                type="button"
                                className="settings-choice"
                                onClick={handleFormatJsonPrompt}
                                disabled={!aiPromptInspection.isJson || !aiPromptInspection.isValid}
                              >
                                <i className="bx bx-magic-wand"></i>
                                Formatar JSON
                              </button>
                            </div>
                            <textarea
                              value={globalIntegrations.aiDashboardPrompt || ''}
                              onChange={(event) => handleGlobalIntegrationChange('aiDashboardPrompt', event.target.value)}
                              placeholder='Descreva como a IA deve analisar os números da dashboard, ou cole um JSON como {"role":"...","rules":["..."],"output":{...}}.'
                              rows={18}
                            />
                            <small>
                              {aiPromptInspection.isJson
                                ? aiPromptInspection.isValid
                                  ? 'JSON válido. O app vai converter esse objeto em instruções de sistema antes de chamar a IA.'
                                  : `JSON inválido: ${aiPromptInspection.error}`
                                : 'Texto livre também continua funcionando normalmente.'}
                            </small>
                            <small>
                              Dica: no modo JSON, você pode usar chaves como `role`, `objective`, `instructions`, `rules`, `style`, `context`, `output` ou `outputSchema`.
                            </small>
                          </div>
                        </div>

                        <div className="integration-block integration-block-meta">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#38bdf8', borderColor: '#38bdf833' }}>
                              <i className="bx bx-cog"></i>
                            </div>
                            <div>
                              <h3>Agentes do chat</h3>
                              <p>Crie agentes com prompts próprios para copy, mídia, operação ou qualquer outro papel que você queira usar no chat.</p>
                            </div>
                          </div>

                          <div className="settings-choice-row settings-choice-row-compact">
                            {availableAiAgents.map((agent) => (
                              <button
                                key={agent.id}
                                type="button"
                                className={`settings-choice ${selectedAiAgentId === agent.id ? 'active' : ''}`}
                                onClick={() => setSelectedAiAgentId(agent.id)}
                              >
                                <i className="bx bx-bot"></i>
                                {agent.name}
                              </button>
                            ))}
                            <button type="button" className="settings-choice" onClick={handleCreateAiAgent}>
                              <i className="bx bx-plus"></i>
                              Novo agente
                            </button>
                          </div>

                          {selectedAiAgent ? (
                            <div className="settings-ai-grid">
                              <div className="input-group">
                                <label>Nome do agente</label>
                                <input
                                  type="text"
                                  value={selectedAiAgent.name}
                                  onChange={(event) =>
                                    handleAiAgentFieldChange(selectedAiAgent.id, 'name', event.target.value)
                                  }
                                  placeholder="Ex.: Copywriter"
                                />
                              </div>

                              <div className="input-group">
                                <label>Descrição curta</label>
                                <input
                                  type="text"
                                  value={selectedAiAgent.description}
                                  onChange={(event) =>
                                    handleAiAgentFieldChange(selectedAiAgent.id, 'description', event.target.value)
                                  }
                                  placeholder="Ex.: Headlines, copies e CTAs"
                                />
                              </div>

                              <div className="input-group settings-ai-grid-full">
                                <label>Prompt do agente</label>
                                <textarea
                                  value={selectedAiAgent.prompt}
                                  onChange={(event) =>
                                    handleAiAgentFieldChange(selectedAiAgent.id, 'prompt', event.target.value)
                                  }
                                  placeholder="Descreva como esse agente deve se comportar."
                                  rows={10}
                                />
                                <small>Esse prompt será somado ao prompt global da IA quando o agente for escolhido no chat.</small>
                              </div>
                            </div>
                          ) : null}

                          <div className="settings-choice-row settings-choice-row-compact">
                            <button
                              type="button"
                              className="settings-choice"
                              onClick={() => handleRemoveAiAgent(selectedAiAgent?.id || '')}
                              disabled={availableAiAgents.length <= 1 || !selectedAiAgent}
                            >
                              <i className="bx bx-trash"></i>
                              Remover agente
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {canManageClients && activeSettingsTab === 'operation' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>Operação</h2>
                      <p>Essas credenciais ficam no nível da operação para abastecer as dashboards internas do time.</p>
                    </div>
                  </div>

                  <div className="settings-integrations-grid settings-integrations-grid-operation">
                    <div className="settings-callout info settings-operation-callout">
                      Essa aba centraliza as credenciais globais do ClickUp e Monday usadas nas dashboards operacionais. Os IDs ficam aqui no nível da operação, não dentro dos clientes.
                    </div>

                    {operationIntegrationGroups.map((group) => (
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

                        {group.fields.map((field) => (
                          <div key={field.name} className="input-group">
                            <label>{field.label}</label>
                            <input
                              type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                              value={String(globalIntegrations[field.name] || '')}
                              onChange={(event) => handleGlobalIntegrationChange(field.name, event.target.value)}
                              placeholder={field.placeholder}
                            />
                            {field.name === 'clickUpListIds' || field.name === 'mondayBoardIds' ? (
                              <small className="settings-help-text">Separe múltiplos IDs por vírgula. Esses IDs ficam globais na operação.</small>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canManageClients && activeSettingsTab === 'calendar' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>Agenda da operação</h2>
                      <p>Centralize aqui a configuração da agenda operacional e o acesso ao Google Calendar da equipe.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Agenda</span>
                        <h3>Google Calendar</h3>
                        <p>A área de agenda aparece na Home como produto do app, mas a configuração operacional dela fica centralizada aqui.</p>
                      </div>

                      <div className="settings-integrations-grid settings-category-grid">
                        <div className="integration-block integration-block-meta">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#10b981', borderColor: '#10b98133' }}>
                              <i className="bx bx-calendar-event"></i>
                            </div>
                            <div>
                              <h3>Configuração da agenda</h3>
                              <p>Use essa área para conectar sua conta Google, escolher o calendário ativo e organizar a rotina operacional fora da leitura analítica.</p>
                            </div>
                          </div>

                          <div className="settings-callout info">
                            A agenda continua como área do produto na Home, mas a conexão e os detalhes operacionais ficam organizados dentro de Configurações.
                          </div>
                          <div className="settings-choice-row settings-choice-row-compact">
                            <Link href="/calendar" className="btn btn-primary">
                              Abrir agenda
                            </Link>
                            <Link href="/calendar" className="btn btn-secondary">
                              Gerenciar conexão
                            </Link>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              <div className="settings-action-bar settings-action-bar-global">
                <div className="settings-action-copy">
                  <strong>Configuração pronta para aplicar</strong>
                  <span>
                    {settingsSaveFeedback ||
                      panelFeedback ||
                      (activeSettingsTab === 'panel'
                        ? 'Ajuste aparência, modo e atmosfera. Salve quando quiser aplicar o tema em todo o app.'
                        : 'As integrações operacionais já sincronizam em tempo real, mas você pode usar este botão para confirmar e reaplicar a configuração atual.')}
                  </span>
                </div>
                <div className="settings-action-buttons">
                  <button
                    type="button"
                    className="btn btn-secondary settings-ghost-button"
                    onClick={handleResetPanelDraft}
                    disabled={!hasPendingPanelChanges}
                  >
                    Descartar alterações
                  </button>
                  <button type="button" className="btn btn-primary settings-save-button" onClick={handleSaveCurrentSettings}>
                    Salvar configuração
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .settings-main {
          width: 100%;
        }

        .settings-panel {
          padding: 40px;
          display: grid;
          gap: 28px;
          background:
            radial-gradient(circle at 100% 0%, rgba(78, 137, 255, 0.08), transparent 28%),
            radial-gradient(circle at 0% 100%, rgba(78, 222, 99, 0.06), transparent 24%),
            rgba(16, 19, 26, 0.78);
          border: 1px solid rgba(69, 71, 75, 0.22);
          border-radius: 24px;
        }

        .settings-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-head h1 {
          font-size: 42px;
          margin-bottom: 8px;
          font-family: var(--font-family-headline);
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .settings-head p,
        .settings-block p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .settings-shell {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          align-items: start;
        }

        .settings-section-sidebar {
          padding: 28px;
          display: grid;
          gap: 18px;
          position: sticky;
          top: 24px;
          align-self: start;
          max-height: calc(100vh - 120px);
          overflow: auto;
          background: rgba(25, 28, 34, 0.78);
          border: 1px solid rgba(69, 71, 75, 0.2);
          border-radius: 24px;
        }

        .settings-sidebar-title {
          display: grid;
          gap: 8px;
        }

        .settings-sidebar-title span {
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .settings-sidebar-title strong {
          max-width: 24ch;
          font-size: 28px;
          line-height: 1.2;
          font-family: var(--font-family-headline);
          letter-spacing: -0.03em;
        }

        .settings-sidebar-nav {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .settings-sidebar-link {
          width: 100%;
          min-height: 120px;
          padding: 18px 20px;
          border-radius: 20px;
          border: 1px solid rgba(69, 71, 75, 0.18);
          background: rgba(29, 32, 38, 0.84);
          color: var(--text-primary);
          font: inherit;
          text-align: left;
          cursor: pointer;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 14px;
          align-content: start;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .settings-sidebar-link i {
          font-size: 20px;
          color: var(--accent-blue);
          margin-top: 1px;
        }

        .settings-sidebar-link div {
          display: grid;
          gap: 6px;
        }

        .settings-sidebar-link strong {
          font-size: 15px;
          font-family: var(--font-family-headline);
          font-weight: 700;
        }

        .settings-sidebar-link span {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .settings-sidebar-link.active {
          border-color: color-mix(in srgb, var(--accent-blue) 28%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 10%, transparent), transparent);
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-blue) 10%, transparent);
        }

        .settings-section-content,
        .settings-panel-layout {
          display: grid;
          gap: 24px;
        }

        .settings-panel-layout-obsidian {
          gap: 28px;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .settings-block-full {
          margin-top: 4px;
        }

        .settings-block {
          padding: 24px;
          display: grid;
          gap: 18px;
          border-radius: 22px;
        }

        .settings-block-hero {
          gap: 26px;
        }

        .settings-block-obsidian {
          background: rgba(25, 28, 34, 0.72);
          border: 1px solid rgba(69, 71, 75, 0.18);
        }

        .settings-block h2 {
          font-size: 22px;
          font-family: var(--font-family-headline);
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .settings-hero-kicker,
        .settings-obsidian-head span {
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .settings-hero-kicker {
          display: inline-flex;
          margin-bottom: 10px;
        }

        .settings-obsidian-head {
          display: grid;
          gap: 8px;
        }

        .settings-obsidian-head p {
          margin: 0;
          max-width: 660px;
        }

        .settings-mode-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-mode-card {
          position: relative;
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(69, 71, 75, 0.18);
          background: rgba(25, 28, 34, 0.7);
          display: grid;
          gap: 18px;
          text-align: left;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.3s ease;
        }

        .settings-mode-card:hover {
          border-color: color-mix(in srgb, var(--accent-blue) 25%, transparent);
          transform: translateY(-2px);
        }

        .settings-mode-card.active {
          border-color: color-mix(in srgb, var(--accent-blue) 45%, transparent);
          box-shadow: 0 0 30px color-mix(in srgb, var(--accent-blue) 8%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 7%, transparent), rgba(25, 28, 34, 0.7)),
            rgba(25, 28, 34, 0.7);
        }

        .settings-mode-preview {
          min-height: 136px;
          border-radius: 14px;
          padding: 14px;
          display: grid;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .settings-mode-preview span {
          display: block;
          height: 8px;
          border-radius: 999px;
        }

        .settings-mode-preview span:first-child {
          width: 44%;
        }

        .settings-mode-preview span:nth-child(2) {
          width: 72%;
        }

        .settings-mode-preview div {
          margin-top: auto;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .settings-mode-preview div i {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-size: 8px;
        }

        .settings-mode-preview div strong {
          display: block;
          flex: 1;
          min-height: 26px;
          border-radius: 8px;
        }

        .settings-mode-preview-dark {
          background: #0b0e14;
        }

        .settings-mode-preview-dark span {
          background: #32353c;
        }

        .settings-mode-preview-dark div i {
          background: color-mix(in srgb, var(--accent-blue) 16%, transparent);
          color: var(--accent-blue);
        }

        .settings-mode-preview-dark div strong {
          background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
        }

        .settings-mode-preview-light {
          background: #e1e2eb;
        }

        .settings-mode-preview-light span {
          background: rgba(50, 53, 60, 0.24);
        }

        .settings-mode-preview-light div i {
          background: var(--accent-blue);
          color: white;
        }

        .settings-mode-preview-light div strong {
          background: color-mix(in srgb, var(--accent-blue) 14%, transparent);
        }

        .settings-mode-copy {
          display: grid;
          gap: 6px;
        }

        .settings-mode-copy strong {
          font-family: var(--font-family-headline);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }

        .settings-mode-copy p {
          margin: 0;
          color: var(--text-secondary);
        }

        .settings-mode-check {
          position: absolute;
          top: 18px;
          right: 18px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: var(--accent-blue);
          color: #001944;
          font-size: 16px;
          box-shadow: 0 0 20px color-mix(in srgb, var(--accent-blue) 20%, transparent);
        }

        .settings-mode-check i {
          color: #001944;
        }

        .settings-grid-obsidian {
          grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.1fr);
        }

        .settings-choice-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .settings-choice,
        .settings-preset {
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 16px;
          cursor: pointer;
          font: inherit;
        }

        .settings-choice {
          min-width: 180px;
          padding: 16px 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .settings-choice-row-compact .settings-choice {
          min-width: 0;
          flex: 1 1 220px;
        }

        .settings-choice.active,
        .settings-preset.active {
          border-color: var(--accent-blue);
          background: var(--theme-surface);
        }

        .settings-color-picker {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px;
          border-radius: 18px;
          background: rgba(11, 14, 20, 0.9);
          border: 1px solid rgba(69, 71, 75, 0.18);
        }

        .settings-color-picker input[type='color'] {
          width: 72px;
          min-width: 72px;
          height: 56px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .settings-color-code {
          display: grid;
          gap: 4px;
        }

        .settings-color-code label {
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-color-showcase {
          display: grid;
          grid-template-columns: 96px minmax(0, 1fr);
          gap: 20px;
          align-items: center;
          padding: 4px 0 6px;
        }

        .settings-color-display {
          width: 96px;
          height: 96px;
          border-radius: 24px;
          display: grid;
          place-items: center;
          background: var(--settings-accent, #4e89ff);
          box-shadow: 0 0 40px color-mix(in srgb, var(--settings-accent, #4e89ff) 35%, transparent);
          color: white;
          font-size: 32px;
        }

        .settings-color-code-row {
          display: flex;
          gap: 10px;
        }

        .settings-color-code-row input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          background: rgba(11, 14, 20, 0.9);
          border: 1px solid rgba(69, 71, 75, 0.18);
          color: var(--accent-blue);
          font-weight: 700;
        }

        .settings-copy-button {
          width: 48px;
          min-width: 48px;
          border-radius: 12px;
          border: 1px solid rgba(69, 71, 75, 0.18);
          background: rgba(39, 42, 49, 0.72);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .settings-copy-button:hover {
          color: var(--accent-blue);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, transparent);
        }

        .settings-background-shell {
          display: grid;
          grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
          gap: 20px;
          align-items: stretch;
        }

        .settings-background-preview {
          min-height: 320px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          overflow: hidden;
          position: relative;
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--panel-bg-tint) 28%, transparent) 0%, transparent 26%),
            radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--panel-bg-tint) 18%, transparent) 0%, transparent 22%),
            radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--panel-bg-tint) 14%, transparent) 0%, transparent 24%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0)),
            rgba(9, 13, 22, 0.96);
          display: grid;
          place-items: end start;
          padding: 20px;
        }

        .settings-background-preview-card {
          width: min(100%, 260px);
          padding: 18px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.68);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          display: grid;
          gap: 6px;
        }

        .settings-background-preview-card span {
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-background-preview-card strong {
          font-size: 24px;
          line-height: 1.05;
        }

        .settings-background-preview-card small {
          color: var(--text-muted);
          font-size: 12px;
        }

        .settings-background-controls {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .settings-rgb-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .settings-rgb-field {
          display: grid;
          gap: 8px;
        }

        .settings-rgb-field span {
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .settings-rgb-field input {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
        }

        .settings-rgb-field input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .settings-preset-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .settings-preset-grid-swatches {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .settings-preset {
          padding: 14px 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .settings-section-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-tab-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .settings-tab {
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          font: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
        }

        .settings-tab.active {
          border-color: var(--accent-blue);
          background: rgba(59, 130, 246, 0.12);
          color: var(--text-primary);
        }

        .settings-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 24px 28px;
          border-radius: 22px;
          background: rgba(25, 28, 34, 0.7);
          border: 1px solid rgba(69, 71, 75, 0.18);
          backdrop-filter: blur(20px);
        }

        .settings-action-bar-global {
          position: sticky;
          bottom: 16px;
          z-index: 10;
          margin-top: 8px;
        }

        .settings-action-copy {
          display: grid;
          gap: 6px;
        }

        .settings-action-copy strong {
          font-family: var(--font-family-headline);
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .settings-action-copy span {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.6;
        }

        .settings-action-buttons {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .settings-ghost-button {
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(69, 71, 75, 0.22);
        }

        .settings-ghost-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .settings-save-button {
          padding-inline: 24px;
        }

        .settings-integrations-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-general-layout {
          display: grid;
          gap: 22px;
        }

        .settings-category-shell {
          display: grid;
          gap: 18px;
          padding: 22px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .settings-category-head {
          display: grid;
          gap: 6px;
        }

        .settings-category-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-category-head h3 {
          font-size: 24px;
          margin: 0;
        }

        .settings-category-head p {
          margin: 0;
          max-width: 780px;
        }

        .settings-category-grid {
          align-items: start;
        }

        .settings-integrations-grid-operation {
          align-items: start;
        }

        .integration-block-meta {
          grid-column: 1 / -1;
          display: grid;
          gap: 16px;
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

        .input-group {
          display: grid;
          gap: 8px;
        }

        .input-group label {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .input-group small,
        .settings-help-text {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .input-group input,
        .input-group select,
        .input-group textarea {
          width: 100%;
          min-height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .input-group select {
          appearance: none;
          cursor: pointer;
        }

        .input-group textarea {
          min-height: 240px;
          padding: 14px;
          resize: vertical;
          line-height: 1.6;
        }

        .input-group input:focus,
        .input-group select:focus,
        .input-group textarea:focus {
          outline: none;
          border-color: var(--accent-blue);
        }

        .settings-ai-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .settings-ai-grid-full {
          grid-column: 1 / -1;
        }

        .settings-preset-swatch {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          flex-shrink: 0;
        }

        .meta-connection-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
        }

        .meta-connection-copy {
          display: grid;
          gap: 6px;
        }

        .meta-connection-copy strong {
          font-size: 15px;
        }

        .meta-connection-copy span {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .meta-connection-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .meta-connection-guide {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .meta-connection-guide-card {
          padding: 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          display: grid;
          gap: 10px;
          align-content: start;
        }

        .meta-connection-guide-kicker {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .meta-connection-guide-card strong {
          font-size: 16px;
          line-height: 1.3;
          color: var(--text-primary);
        }

        .meta-connection-guide-card p {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.6;
        }

        .meta-connection-checklist {
          display: grid;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.6;
        }

        .meta-connection-checklist span {
          display: block;
        }

        .settings-callout {
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 13px;
          line-height: 1.5;
        }

        .settings-callout.success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #bbf7d0;
        }

        .settings-callout.error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fecaca;
        }

        .settings-callout.warning {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #fde68a;
        }

        .settings-callout.info {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #bfdbfe;
        }

        .settings-operation-callout {
          grid-column: 1 / -1;
        }

        @media (max-width: 980px) {
          .settings-section-sidebar {
            position: static;
            max-height: none;
            overflow: visible;
          }

          .settings-sidebar-nav {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .settings-grid {
            grid-template-columns: 1fr;
          }

          .settings-mode-grid {
            grid-template-columns: 1fr;
          }

          .settings-integrations-grid {
            grid-template-columns: 1fr;
          }

          .settings-background-shell {
            grid-template-columns: 1fr;
          }

          .settings-ai-grid {
            grid-template-columns: 1fr;
          }

          .settings-color-showcase {
            grid-template-columns: 1fr;
          }

          .settings-action-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .settings-category-shell {
            padding: 18px;
          }

          .meta-connection-card {
            flex-direction: column;
            align-items: stretch;
          }

          .meta-connection-guide {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .settings-sidebar-nav {
            grid-template-columns: 1fr;
          }

          .settings-sidebar-title strong {
            max-width: none;
            font-size: 24px;
          }

          .settings-sidebar-link {
            min-height: 0;
          }
        }

        @media (max-width: 768px) {
          .settings-head {
            flex-direction: column;
            align-items: flex-start;
          }

          .settings-panel {
            padding: 24px;
          }

          .settings-head h1 {
            font-size: 34px;
          }

          .settings-preset-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .settings-rgb-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
