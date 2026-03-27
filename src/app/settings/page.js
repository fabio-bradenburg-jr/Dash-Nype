'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'
import { DEFAULT_PREFERENCES, loadDashboardPreferences, saveDashboardPreferences } from '@/lib/dashboard-storage'
import {
  AI_PROVIDER_OPTIONS,
  createDefaultAiProviders,
  DEFAULT_AI_DASHBOARD_PROMPT,
  DEFAULT_AI_DASHBOARD_PROMPT_JSON,
  getAiProviderOption,
  inspectAiDashboardPrompt,
  normalizeAiSettings,
} from '@/lib/ai-config'

const PANEL_BACKGROUND_PRESETS = [
  { label: 'Azulado', value: '#3b82f6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Laranja', value: '#f59e0b' },
  { label: 'Rosa', value: '#f43f5e' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Turquesa', value: '#14b8a6' },
]

const GLOBAL_INTEGRATION_GROUPS = [
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

function clampRgbChannel(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(255, parsed))
}

function hexToRgb(hexValue) {
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

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clampRgbChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

export default function SettingsPage() {
  const { appearance, updateAppearance, access } = useUser()
  const canManageClients = Boolean(access?.canManageClients)
  const [serverState, setServerState] = useState(null)
  const [globalIntegrations, setGlobalIntegrations] = useState(() => {
    const preferences = loadDashboardPreferences()
    return {
      ...DEFAULT_PREFERENCES.globalIntegrations,
      ...(preferences.globalIntegrations || {}),
    }
  })
  const [metaConnection, setMetaConnection] = useState({
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
  const [activeSettingsTab, setActiveSettingsTab] = useState('panel')
  const metaConnectionMode = globalIntegrations.metaConnectionMode === 'oauth' ? 'oauth' : 'manual'
  const hasMetaManualToken = Boolean(String(globalIntegrations.metaAccessToken || '').trim())
  const hasMetaOauthConnection = Boolean(metaConnection.connected)
  const generalIntegrationGroups = GLOBAL_INTEGRATION_GROUPS.filter((group) => !OPERATION_INTEGRATION_TITLES.has(group.title))
  const operationIntegrationGroups = GLOBAL_INTEGRATION_GROUPS.filter((group) => OPERATION_INTEGRATION_TITLES.has(group.title))
  const advertisingIntegrationGroups = generalIntegrationGroups.filter((group) => AD_ACCOUNT_INTEGRATION_TITLES.has(group.title))
  const crmIntegrationGroups = generalIntegrationGroups.filter((group) => CRM_INTEGRATION_TITLES.has(group.title))
  const backgroundTintRgb = hexToRgb(appearance.backgroundTint)
  const selectedAiProvider = getAiProviderOption(globalIntegrations.aiProvider)
  const activeAiProviderConfig = globalIntegrations.aiProviders?.[selectedAiProvider.value] || createDefaultAiProviders()[selectedAiProvider.value]
  const aiPromptInspection = inspectAiDashboardPrompt(globalIntegrations.aiDashboardPrompt)

  const persistGlobalIntegrations = useCallback(
    async (nextIntegrations) => {
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

        const state = await response.json()
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
        const data = await response.json().catch(() => null)

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
        setMetaConnectionError(error.message || 'Não foi possível carregar a conexão da Meta.')
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
    } else if (tab === 'ai') {
      setActiveSettingsTab('ai')
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

  const handleGlobalIntegrationChange = (fieldName, value) => {
    setGlobalIntegrations((current) => {
      const nextIntegrations = {
        ...current,
        [fieldName]: value,
      }

      persistGlobalIntegrations(nextIntegrations).catch((error) => {
        console.error('Erro ao salvar integrações globais no servidor:', error)
      })

      return nextIntegrations
    })
  }

  const handleAiProviderChange = (providerValue) => {
    const providerOption = getAiProviderOption(providerValue)

    setGlobalIntegrations((current) => {
      const nextProviders = {
        ...createDefaultAiProviders(),
        ...(current.aiProviders || {}),
      }
      const currentProviderConfig = nextProviders[providerOption.value] || createDefaultAiProviders()[providerOption.value]
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
      }

      const normalizedNextIntegrations = {
        ...nextIntegrations,
        ...normalizeAiSettings(nextIntegrations),
      }

      persistGlobalIntegrations(normalizedNextIntegrations).catch((error) => {
        console.error('Erro ao salvar configurações de IA no servidor:', error)
      })

      return normalizedNextIntegrations
    })
  }

  const handleAiProviderFieldChange = (fieldName, value) => {
    setGlobalIntegrations((current) => {
      const providerKey = getAiProviderOption(current.aiProvider).value
      const nextProviders = {
        ...createDefaultAiProviders(),
        ...(current.aiProviders || {}),
      }
      const currentProviderConfig = nextProviders[providerKey] || createDefaultAiProviders()[providerKey]
      const nextIntegrations = {
        ...current,
        aiProviders: {
          ...nextProviders,
          [providerKey]: {
            ...currentProviderConfig,
            [fieldName]: value,
          },
        },
      }
      const normalizedNextIntegrations = {
        ...nextIntegrations,
        ...normalizeAiSettings(nextIntegrations),
      }

      persistGlobalIntegrations(normalizedNextIntegrations).catch((error) => {
        console.error('Erro ao salvar credenciais do provider de IA:', error)
      })

      return normalizedNextIntegrations
    })
  }

  const handleApplyPromptTemplate = (mode) => {
    handleGlobalIntegrationChange(
      'aiDashboardPrompt',
      mode === 'json' ? DEFAULT_AI_DASHBOARD_PROMPT_JSON : DEFAULT_AI_DASHBOARD_PROMPT
    )
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
      const data = await response.json().catch(() => null)

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
        }

        setGlobalIntegrations(nextIntegrations)
        await persistGlobalIntegrations(nextIntegrations)
      }
    } catch (error) {
      setMetaConnectionError(error.message || 'Não foi possível desconectar a conta da Meta.')
    }
  }

  const handleBackgroundRgbChannelChange = (channel, value) => {
    updateAppearance((current) => {
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

  const handleSettingsTabChange = (nextTab) => {
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
          <Link href="/dashboard" className="nav-item">
            <i className="bx bx-arrow-back"></i>
            Voltar ao dashboard
          </Link>
          <Link href="/calendar" className="nav-item">
            <i className="bx bx-calendar-event"></i>
            Agenda
          </Link>
          <Link href="/assistant" className="nav-item">
            <i className="bx bx-bot"></i>
            Assistente
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
            <Link href="/dashboard" className="btn btn-secondary">
              Voltar
            </Link>
          </div>

          <div className="settings-shell">
            <aside className="glass-item settings-section-sidebar">
              <div className="settings-sidebar-title">
                <span>Painel de configuração</span>
                <strong>Escolha a área que quer ajustar</strong>
              </div>

              <div className="settings-sidebar-nav">
                <button
                  type="button"
                  className={`settings-sidebar-link ${activeSettingsTab === 'panel' ? 'active' : ''}`}
                  onClick={() => handleSettingsTabChange('panel')}
                >
                  <i className="bx bx-layout"></i>
                  <div>
                    <strong>Meu painel</strong>
                    <span>Cores, fundo e aparência do app.</span>
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
                        <span>Contas de anúncio e CRMs.</span>
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
                        <span>ClickUp, Monday e IDs globais.</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`settings-sidebar-link ${activeSettingsTab === 'ai' ? 'active' : ''}`}
                      onClick={() => handleSettingsTabChange('ai')}
                    >
                      <i className="bx bx-bot"></i>
                      <div>
                        <strong>IA</strong>
                        <span>Provider, modelo e prompt de análise.</span>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </aside>

            <div className="settings-section-content">
              {activeSettingsTab === 'panel' && (
                <div className="settings-panel-layout">
                  <div className="glass-item settings-block settings-block-full">
                    <div className="settings-section-head">
                      <div>
                        <h2>Meu painel</h2>
                        <p>Defina aqui a atmosfera visual do app: modo, cor de destaque e a cor RGB do fundo mesclado no gradiente.</p>
                      </div>
                    </div>

                    <div className="settings-grid">
                      <div className="glass-item settings-block">
                        <h2>Modo de visualização</h2>
                        <p>Escolha se quer trabalhar com a interface clara ou escura.</p>
                        <div className="settings-choice-row">
                          <button
                            type="button"
                            className={`settings-choice ${appearance.mode === 'dark' ? 'active' : ''}`}
                            onClick={() => updateAppearance((current) => ({ ...current, mode: 'dark' }))}
                          >
                            <i className="bx bx-moon"></i>
                            Escuro
                          </button>
                          <button
                            type="button"
                            className={`settings-choice ${appearance.mode === 'light' ? 'active' : ''}`}
                            onClick={() => updateAppearance((current) => ({ ...current, mode: 'light' }))}
                          >
                            <i className="bx bx-sun"></i>
                            Claro
                          </button>
                        </div>
                      </div>

                      <div className="glass-item settings-block">
                        <h2>Cor de destaque</h2>
                        <p>Essa cor aparece nos botões, links ativos e detalhes principais da sua interface.</p>
                        <div className="settings-color-picker">
                          <input
                            type="color"
                            value={appearance.accent}
                            onChange={(event) => updateAppearance((current) => ({ ...current, accent: event.target.value }))}
                            aria-label="Selecionar cor de destaque"
                          />
                          <div className="settings-color-code">
                            <strong>{appearance.accent.toUpperCase()}</strong>
                            <span>Aplicado imediatamente na sua conta neste navegador.</span>
                          </div>
                        </div>
                        <div className="settings-preset-grid">
                          {USER_APPEARANCE_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              className={`settings-preset ${appearance.accent === preset.value ? 'active' : ''}`}
                              onClick={() => updateAppearance((current) => ({ ...current, accent: preset.value }))}
                            >
                              <span className="settings-preset-swatch" style={{ background: preset.value }}></span>
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="glass-item settings-block settings-block-full">
                      <h2>Cor do fundo do app</h2>
                      <p>Esse RGB controla a névoa/gradiente do fundo do painel. Se quiser, deixe mais azulado, esverdeado, laranja ou qualquer outro clima.</p>

                      <div className="settings-background-shell">
                        <div className="settings-background-preview" style={{ '--panel-bg-tint': appearance.backgroundTint }}>
                          <div className="settings-background-preview-card">
                            <span>Prévia do fundo</span>
                            <strong>{appearance.backgroundTint.toUpperCase()}</strong>
                            <small>{`rgb(${backgroundTintRgb.r}, ${backgroundTintRgb.g}, ${backgroundTintRgb.b})`}</small>
                          </div>
                        </div>

                        <div className="settings-background-controls">
                          <div className="settings-color-picker">
                            <input
                              type="color"
                              value={appearance.backgroundTint}
                              onChange={(event) => updateAppearance((current) => ({ ...current, backgroundTint: event.target.value }))}
                              aria-label="Selecionar cor do fundo do app"
                            />
                            <div className="settings-color-code">
                              <strong>{appearance.backgroundTint.toUpperCase()}</strong>
                              <span>Essa cor é aplicada no fundo atmosférico do app inteiro.</span>
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
                                className={`settings-preset ${appearance.backgroundTint === preset.value ? 'active' : ''}`}
                                onClick={() => updateAppearance((current) => ({ ...current, backgroundTint: preset.value }))}
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

                            {(group.fields || (group.field ? [group.field] : [])).map((field) => (
                              <div key={field.name} className="input-group">
                                <label>{field.label}</label>
                                <input
                                  type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                                  value={globalIntegrations[field.name] || ''}
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

                            {(group.fields || (group.field ? [group.field] : [])).map((field) => (
                              <div key={field.name} className="input-group">
                                <label>{field.label}</label>
                                <input
                                  type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                                  value={globalIntegrations[field.name] || ''}
                                  onChange={(event) => handleGlobalIntegrationChange(field.name, event.target.value)}
                                  placeholder={field.placeholder}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
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

                        {(group.fields || (group.field ? [group.field] : [])).map((field) => (
                          <div key={field.name} className="input-group">
                            <label>{field.label}</label>
                            <input
                              type={field.name.toLowerCase().includes('token') ? 'password' : 'text'}
                              value={globalIntegrations[field.name] || ''}
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

              {canManageClients && activeSettingsTab === 'ai' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>IA para análise do dashboard</h2>
                      <p>Configure aqui a API, o modelo e o prompt base que a IA vai usar para interpretar os números da dashboard.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Provider</span>
                        <h3>Conexão da IA</h3>
                        <p>Cadastre as credenciais por provider e escolha abaixo qual IA fica ativa para a análise da dashboard.</p>
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
                      </div>
                    </section>

                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Prompt</span>
                        <h3>Instrução base da análise</h3>
                        <p>Esse prompt será combinado com os números da dashboard para a IA devolver resumo executivo, alertas, oportunidades e próximos passos.</p>
                      </div>

                      <div className="settings-integrations-grid settings-category-grid">
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
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .settings-main {
          width: 100%;
        }

        .settings-panel {
          padding: 32px;
          display: grid;
          gap: 24px;
        }

        .settings-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .settings-head h1 {
          font-size: 30px;
          margin-bottom: 8px;
        }

        .settings-head p,
        .settings-block p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .settings-shell {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }

        .settings-section-sidebar {
          padding: 18px;
          display: grid;
          gap: 18px;
          position: sticky;
          top: 24px;
        }

        .settings-sidebar-title {
          display: grid;
          gap: 6px;
        }

        .settings-sidebar-title span {
          color: #93c5fd;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-sidebar-title strong {
          font-size: 18px;
          line-height: 1.35;
        }

        .settings-sidebar-nav {
          display: grid;
          gap: 10px;
        }

        .settings-sidebar-link {
          width: 100%;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          font: inherit;
          text-align: left;
          cursor: pointer;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .settings-sidebar-link i {
          font-size: 20px;
          color: #93c5fd;
          margin-top: 1px;
        }

        .settings-sidebar-link div {
          display: grid;
          gap: 4px;
        }

        .settings-sidebar-link strong {
          font-size: 15px;
        }

        .settings-sidebar-link span {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .settings-sidebar-link.active {
          border-color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 16%, transparent);
          transform: translateY(-1px);
        }

        .settings-section-content,
        .settings-panel-layout {
          display: grid;
          gap: 20px;
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
          border-radius: 20px;
        }

        .settings-block h2 {
          font-size: 22px;
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
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
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

        .settings-background-shell {
          display: grid;
          grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
          gap: 18px;
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
          .settings-shell {
            grid-template-columns: 1fr;
          }

          .settings-section-sidebar {
            position: static;
          }

          .settings-grid {
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

        @media (max-width: 768px) {
          .settings-head {
            flex-direction: column;
            align-items: flex-start;
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
