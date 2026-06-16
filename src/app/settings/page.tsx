'use client'

import type { ChangeEvent, CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { DEFAULT_USER_APPEARANCE } from '@/lib/user-appearance-storage'
import {
  createClientCustomColumnRecord,
  createClientImplementationPhaseRecord,
  createOperationCustomFieldRecord,
  createClientCustomTabRecord,
  createOperationLaneRecord,
  createOperationSettingsRecord,
  createOperationStatusRecord,
  DEFAULT_CLIENT_IMPLEMENTATION_PHASES,
  DEFAULT_PREFERENCES,
  loadDashboardPreferences,
  saveDashboardPreferences,
} from '@/lib/dashboard-storage'
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
import type {
  ClientCustomColumnRecord,
  ClientCustomTabRecord,
  ClientImplementationPhaseRecord,
  ClientRecord,
  DashboardIntegrations,
  OperationCustomFieldRecord,
  OperationSettingsRecord,
} from '@/lib/types/dashboard'
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

interface GoogleAdsConnectionState {
  connected: boolean
  googleEmail: string
  googleName: string
  scopes: string
  expiresAt: string
  managerCustomerId: string
}

type SettingsTab = 'panel' | 'general' | 'ai' | 'operation' | 'clients'

const SETTINGS_TAB_STORAGE_KEY = 'dash_settings_active_tab'

const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    title: 'Meta Ads',
    description: 'Conecte sua conta Meta para acessar campanhas e métricas de anúncios.',
    icon: 'M',
    accent: '#1877F2',
    fields: [
      { name: 'metaAccessToken', label: 'Access Token', placeholder: 'EAAxxxxx...' },
      { name: 'metaAdAccountId', label: 'Ad Account ID', placeholder: 'act_xxxxxxxxxx' },
    ],
  },
  {
    title: 'Google Ads',
    description: 'Conecte sua conta Google Ads para campanhas de busca e display.',
    icon: 'G',
    accent: '#4285F4',
    fields: [
      { name: 'googleAdsCustomerId', label: 'Customer ID', placeholder: 'xxx-xxx-xxxx' },
      { name: 'googleAdsRefreshToken', label: 'Refresh Token', placeholder: 'Token de atualização' },
    ],
  },
]

const APPEARANCE_KEYS: (keyof UserAppearance)[] = [
  'companyName',
  'companyLogo',
  'primaryColor',
  'accentColor',
  'fontFamily',
  'dashboardTitle',
  'sidebarStyle',
  'borderRadius',
  'cardShadow',
  'darkMode',
]

export function SettingsPage() {
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [integrations, setIntegrations] = useState<DashboardIntegrations>({})
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    aiProvider: '',
    aiModel: '',
    aiProviders: {},
    aiAgents: [],
    aiSystemPrompt: DEFAULT_AI_DASHBOARD_PROMPT,
    aiSystemPromptJson: DEFAULT_AI_DASHBOARD_PROMPT_JSON,
  })
  const [appearance, setAppearance] = useState<UserAppearance>({ ...DEFAULT_USER_APPEARANCE })
  const [operationSettings, setOperationSettings] = useState<OperationSettingsRecord>(
    createOperationSettingsRecord({}),
  )
  const [clientsConfig, setClientsConfig] = useState<{
    customColumns: ClientCustomColumnRecord[]
    implementationPhases: ClientImplementationPhaseRecord[]
    customTabs: ClientCustomTabRecord[]
  }>({
    customColumns: [],
    implementationPhases: DEFAULT_CLIENT_IMPLEMENTATION_PHASES.map((p) =>
      createClientImplementationPhaseRecord(p),
    ),
    customTabs: [],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [metaConnection, setMetaConnection] = useState<MetaConnectionState | null>(null)
  const [googleAdsConnection, setGoogleAdsConnection] = useState<GoogleAdsConnectionState | null>(
    null,
  )
  const [metaLoading, setMetaLoading] = useState(false)
  const [googleAdsLoading, setGoogleAdsLoading] = useState(false)
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true)

  const [newOperationLane, setNewOperationLane] = useState('')
  const [newOperationStatus, setNewOperationStatus] = useState('')
  const [newOperationCustomField, setNewOperationCustomField] = useState('')
  const [newClientCustomColumn, setNewClientCustomColumn] = useState('')
  const [newClientCustomTab, setNewClientCustomTab] = useState('')
  const [newClientImplementationPhase, setNewClientImplementationPhase] = useState('')

  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentDescription, setNewAgentDescription] = useState('')
  const [newAgentPrompt, setNewAgentPrompt] = useState('')
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [promptInspection, setPromptInspection] = useState<ReturnType<typeof inspectAiDashboardPrompt> | null>(null)

  const [connectedClients, setConnectedClients] = useState<ClientRecord[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)

  // Load preferences
  useEffect(() => {
    const load = async () => {
      try {
        const prefs = await loadDashboardPreferences()
        if (prefs.integrations) setIntegrations(prefs.integrations)
        if (prefs.aiSettings) setAiSettings(normalizeAiSettings(prefs.aiSettings))
        if (prefs.operationSettings)
          setOperationSettings(
            createOperationSettingsRecord(prefs.operationSettings),
          )
        if (prefs.clientsConfig) {
          setClientsConfig({
            customColumns: (prefs.clientsConfig.customColumns ?? []).map(
              createClientCustomColumnRecord,
            ),
            implementationPhases: (
              prefs.clientsConfig.implementationPhases ?? DEFAULT_CLIENT_IMPLEMENTATION_PHASES
            ).map(createClientImplementationPhaseRecord),
            customTabs: (prefs.clientsConfig.customTabs ?? []).map(createClientCustomTabRecord),
          })
        }
      } catch {
        // ignore
      } finally {
        setIsLoadingPrefs(false)
      }
    }
    load()
  }, [])

  // Restore tab from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)
      if (saved && ['panel', 'general', 'ai', 'operation', 'clients'].includes(saved)) {
        setActiveTab(saved as SettingsTab)
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch appearance
  useEffect(() => {
    const fetchAppearance = async () => {
      try {
        const res = await fetch('/api/user/appearance')
        if (res.ok) {
          const data = await res.json()
          setAppearance({ ...DEFAULT_USER_APPEARANCE, ...data })
        }
      } catch {
        // ignore
      }
    }
    fetchAppearance()
  }, [])

  // Load Meta connection status
  useEffect(() => {
    const fetchMeta = async () => {
      setMetaLoading(true)
      try {
        const res = await fetch('/api/meta/connection-status')
        if (res.ok) {
          const data = await res.json()
          setMetaConnection(data)
        }
      } catch {
        // ignore
      } finally {
        setMetaLoading(false)
      }
    }
    fetchMeta()
  }, [])

  // Load Google Ads connection status
  useEffect(() => {
    const fetchGoogleAds = async () => {
      setGoogleAdsLoading(true)
      try {
        const res = await fetch('/api/google-ads/connection-status')
        if (res.ok) {
          const data = await res.json()
          setGoogleAdsConnection(data)
        }
      } catch {
        // ignore
      } finally {
        setGoogleAdsLoading(false)
      }
    }
    fetchGoogleAds()
  }, [])

  // Load connected clients when panel tab is active
  useEffect(() => {
    if (activeTab !== 'panel') return
    const fetchClients = async () => {
      setClientsLoading(true)
      try {
        const res = await fetch('/api/clients')
        if (res.ok) {
          const data = await res.json()
          setConnectedClients(data.clients ?? [])
        }
      } catch {
        // ignore
      } finally {
        setClientsLoading(false)
      }
    }
    fetchClients()
  }, [activeTab])

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
    try {
      localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab)
    } catch {
      // ignore
    }
  }, [])

  const handleIntegrationChange = useCallback(
    (field: string, value: string) => {
      setIntegrations((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleAiProviderChange = useCallback(
    (provider: string) => {
      setAiSettings((prev) => ({
        ...prev,
        aiProvider: provider,
      }))
    },
    [],
  )

  const handleAiProviderConfigChange = useCallback(
    (provider: string, field: keyof AiProviderConfig, value: string) => {
      setAiSettings((prev) => ({
        ...prev,
        aiProviders: {
          ...prev.aiProviders,
          [provider]: {
            ...(prev.aiProviders?.[provider] ?? {}),
            [field]: value,
          },
        },
      }))
    },
    [],
  )

  const handleAppearanceChange = useCallback(
    (field: keyof UserAppearance, value: string | boolean) => {
      setAppearance((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const handleAddAgent = useCallback(() => {
    if (!newAgentName.trim()) return
    const agent: AiAgent = {
      id: `agent-${Date.now()}`,
      name: newAgentName.trim(),
      description: newAgentDescription.trim(),
      systemPrompt: newAgentPrompt.trim(),
      enabled: true,
    }
    setAiSettings((prev) => ({
      ...prev,
      aiAgents: [...(prev.aiAgents ?? []), agent],
    }))
    setNewAgentName('')
    setNewAgentDescription('')
    setNewAgentPrompt('')
  }, [newAgentName, newAgentDescription, newAgentPrompt])

  const handleEditAgent = useCallback(
    (id: string) => {
      const agent = aiSettings.aiAgents?.find((a) => a.id === id)
      if (!agent) return
      setEditingAgentId(id)
      setNewAgentName(agent.name)
      setNewAgentDescription(agent.description ?? '')
      setNewAgentPrompt(agent.systemPrompt ?? '')
    },
    [aiSettings.aiAgents],
  )

  const handleSaveAgent = useCallback(() => {
    if (!editingAgentId || !newAgentName.trim()) return
    setAiSettings((prev) => ({
      ...prev,
      aiAgents: (prev.aiAgents ?? []).map((a) =>
        a.id === editingAgentId
          ? {
              ...a,
              name: newAgentName.trim(),
              description: newAgentDescription.trim(),
              systemPrompt: newAgentPrompt.trim(),
            }
          : a,
      ),
    }))
    setEditingAgentId(null)
    setNewAgentName('')
    setNewAgentDescription('')
    setNewAgentPrompt('')
  }, [editingAgentId, newAgentName, newAgentDescription, newAgentPrompt])

  const handleDeleteAgent = useCallback((id: string) => {
    setAiSettings((prev) => ({
      ...prev,
      aiAgents: (prev.aiAgents ?? []).filter((a) => a.id !== id),
    }))
  }, [])

  const handleToggleAgent = useCallback((id: string) => {
    setAiSettings((prev) => ({
      ...prev,
      aiAgents: (prev.aiAgents ?? []).map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a,
      ),
    }))
  }, [])

  const handleResetAgents = useCallback(() => {
    setAiSettings((prev) => ({
      ...prev,
      aiAgents: createDefaultAiAgents(),
    }))
  }, [])

  const handleResetProviders = useCallback(() => {
    setAiSettings((prev) => ({
      ...prev,
      aiProviders: createDefaultAiProviders(),
    }))
  }, [])

  const handleInspectPrompt = useCallback(() => {
    const result = inspectAiDashboardPrompt(
      aiSettings.aiSystemPrompt ?? DEFAULT_AI_DASHBOARD_PROMPT,
    )
    setPromptInspection(result)
  }, [aiSettings.aiSystemPrompt])

  const handleAddOperationLane = useCallback(() => {
    const name = newOperationLane.trim()
    if (!name) return
    setOperationSettings((prev) => ({
      ...prev,
      lanes: [
        ...(prev.lanes ?? []),
        createOperationLaneRecord({ name }),
      ],
    }))
    setNewOperationLane('')
  }, [newOperationLane])

  const handleDeleteOperationLane = useCallback((id: string) => {
    setOperationSettings((prev) => ({
      ...prev,
      lanes: (prev.lanes ?? []).filter((l) => l.id !== id),
    }))
  }, [])

  const handleAddOperationStatus = useCallback(() => {
    const name = newOperationStatus.trim()
    if (!name) return
    setOperationSettings((prev) => ({
      ...prev,
      statuses: [
        ...(prev.statuses ?? []),
        createOperationStatusRecord({ name }),
      ],
    }))
    setNewOperationStatus('')
  }, [newOperationStatus])

  const handleDeleteOperationStatus = useCallback((id: string) => {
    setOperationSettings((prev) => ({
      ...prev,
      statuses: (prev.statuses ?? []).filter((s) => s.id !== id),
    }))
  }, [])

  const handleAddOperationCustomField = useCallback(() => {
    const name = newOperationCustomField.trim()
    if (!name) return
    setOperationSettings((prev) => ({
      ...prev,
      customFields: [
        ...(prev.customFields ?? []),
        createOperationCustomFieldRecord({ name }),
      ],
    }))
    setNewOperationCustomField('')
  }, [newOperationCustomField])

  const handleDeleteOperationCustomField = useCallback((id: string) => {
    setOperationSettings((prev) => ({
      ...prev,
      customFields: (prev.customFields ?? []).filter((f) => f.id !== id),
    }))
  }, [])

  const handleAddClientCustomColumn = useCallback(() => {
    const name = newClientCustomColumn.trim()
    if (!name) return
    setClientsConfig((prev) => ({
      ...prev,
      customColumns: [...prev.customColumns, createClientCustomColumnRecord({ name })],
    }))
    setNewClientCustomColumn('')
  }, [newClientCustomColumn])

  const handleDeleteClientCustomColumn = useCallback((id: string) => {
    setClientsConfig((prev) => ({
      ...prev,
      customColumns: prev.customColumns.filter((c) => c.id !== id),
    }))
  }, [])

  const handleAddClientCustomTab = useCallback(() => {
    const name = newClientCustomTab.trim()
    if (!name) return
    setClientsConfig((prev) => ({
      ...prev,
      customTabs: [...prev.customTabs, createClientCustomTabRecord({ name })],
    }))
    setNewClientCustomTab('')
  }, [newClientCustomTab])

  const handleDeleteClientCustomTab = useCallback((id: string) => {
    setClientsConfig((prev) => ({
      ...prev,
      customTabs: prev.customTabs.filter((t) => t.id !== id),
    }))
  }, [])

  const handleAddClientImplementationPhase = useCallback(() => {
    const name = newClientImplementationPhase.trim()
    if (!name) return
    setClientsConfig((prev) => ({
      ...prev,
      implementationPhases: [
        ...prev.implementationPhases,
        createClientImplementationPhaseRecord({ name }),
      ],
    }))
    setNewClientImplementationPhase('')
  }, [newClientImplementationPhase])

  const handleDeleteClientImplementationPhase = useCallback((id: string) => {
    setClientsConfig((prev) => ({
      ...prev,
      implementationPhases: prev.implementationPhases.filter((p) => p.id !== id),
    }))
  }, [])

  const currentProviderOption = useMemo(
    () => getAiProviderOption(aiSettings.aiProvider ?? ''),
    [aiSettings.aiProvider],
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveMessage('')
    try {
      const prefs = await loadDashboardPreferences()
      const updated = {
        ...prefs,
        integrations,
        aiSettings,
        operationSettings,
        clientsConfig,
      }
      await saveDashboardPreferences(updated)

      // Save appearance
      await fetch('/api/user/appearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appearance),
      })

      setSaveMessage('Configurações salvas com sucesso!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('Erro ao salvar configurações.')
    } finally {
      setIsSaving(false)
    }
  }, [integrations, aiSettings, appearance, operationSettings, clientsConfig])

  const handleMetaDisconnect = useCallback(async () => {
    try {
      await fetch('/api/meta/disconnect', { method: 'POST' })
      setMetaConnection(null)
    } catch {
      // ignore
    }
  }, [])

  const handleGoogleAdsDisconnect = useCallback(async () => {
    try {
      await fetch('/api/google-ads/disconnect', { method: 'POST' })
      setGoogleAdsConnection(null)
    } catch {
      // ignore
    }
  }, [])

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'var(--bg-primary, #f9fafb)',
    color: 'var(--text-primary, #111)',
    outline: 'none',
  }

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary, #666)',
    marginBottom: '4px',
  }

  const sectionStyle: CSSProperties = {
    marginBottom: '24px',
  }

  const sectionTitleStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary, #111)',
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
  }

  const tabStyle = (isActive: boolean): CSSProperties => ({
    padding: '8px 16px',
    border: 'none',
    borderBottom: isActive ? '2px solid var(--accent, #006c44)' : '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--accent, #006c44)' : 'var(--text-secondary, #666)',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  const addBtnStyle: CSSProperties = {
    padding: '6px 12px',
    background: 'var(--accent, #006c44)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    flexShrink: 0,
  }

  const deleteBtnStyle: CSSProperties = {
    padding: '2px 8px',
    background: 'transparent',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
  }

  if (isLoadingPrefs) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'var(--text-secondary, #666)',
          fontSize: '14px',
        }}
      >
        Carregando...
      </div>
    )
  }

  return (
    <div
      className="settings-page-wrapper"
      style={{
        fontFamily: 'var(--font-sans, sans-serif)',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '24px 20px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/"
            style={{
              color: 'var(--text-secondary, #666)',
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            ← Voltar
          </Link>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-primary, #111)',
              margin: 0,
            }}
          >
            Configurações
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saveMessage && (
            <span
              style={{
                fontSize: '13px',
                color: saveMessage.includes('Erro') ? '#b91c1c' : '#006c44',
                fontWeight: 500,
              }}
            >
              {saveMessage}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 20px',
              background: 'var(--accent, #006c44)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          marginBottom: '24px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {(['panel', 'general', 'ai', 'operation', 'clients'] as SettingsTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={tabStyle(activeTab === tab)}
          >
            {tab === 'panel' && 'Painel'}
            {tab === 'general' && 'Geral'}
            {tab === 'ai' && 'IA'}
            {tab === 'operation' && 'Operação'}
            {tab === 'clients' && 'Clientes'}
          </button>
        ))}
      </div>

      {/* Panel Tab */}
      {activeTab === 'panel' && (
        <div>
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Clientes Conectados</div>
            {clientsLoading ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: '13px' }}>
                Carregando...
              </div>
            ) : connectedClients.length === 0 ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: '13px' }}>
                Nenhum cliente conectado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {connectedClients.map((client) => (
                  <div
                    key={client.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: '8px',
                      background: 'var(--bg-surface, #fff)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: '14px',
                          color: 'var(--text-primary, #111)',
                        }}
                      >
                        {client.name}
                      </div>
                      {client.email && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary, #666)',
                            marginTop: '2px',
                          }}
                        >
                          {client.email}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background:
                          client.status === 'active' ? '#d1fae5' : 'var(--bg-primary, #f9fafb)',
                        color: client.status === 'active' ? '#065f46' : 'var(--text-secondary, #666)',
                        fontWeight: 500,
                      }}
                    >
                      {client.status === 'active' ? 'Ativo' : client.status ?? 'Indefinido'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* General Tab */}
      {activeTab === 'general' && (
        <div>
          {/* Integrations */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Integrações</div>
            {INTEGRATION_GROUPS.map((group) => (
              <div
                key={group.title}
                style={{
                  marginBottom: '20px',
                  padding: '16px',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '10px',
                  background: 'var(--bg-surface, #fff)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: group.accent,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '14px',
                      flexShrink: 0,
                    }}
                  >
                    {group.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: 'var(--text-primary, #111)',
                      }}
                    >
                      {group.title}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary, #666)',
                        marginTop: '1px',
                      }}
                    >
                      {group.description}
                    </div>
                  </div>
                </div>

                {/* OAuth connection status for Meta */}
                {group.title === 'Meta Ads' && (
                  <div style={{ marginBottom: '12px' }}>
                    {metaLoading ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>
                        Verificando conexão...
                      </div>
                    ) : metaConnection?.connected ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          background: '#d1fae5',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ color: '#065f46', fontSize: '12px', fontWeight: 500 }}>
                          ✓ Conectado como {metaConnection.userName}
                        </span>
                        <button
                          onClick={handleMetaDisconnect}
                          style={{
                            marginLeft: 'auto',
                            padding: '3px 8px',
                            fontSize: '11px',
                            background: 'transparent',
                            border: '1px solid #065f46',
                            borderRadius: '4px',
                            color: '#065f46',
                            cursor: 'pointer',
                          }}
                        >
                          Desconectar
                        </button>
                      </div>
                    ) : (
                      <a
                        href="/api/meta/auth"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          background: '#1877F2',
                          color: '#fff',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        Conectar Meta
                      </a>
                    )}
                  </div>
                )}

                {/* OAuth connection status for Google Ads */}
                {group.title === 'Google Ads' && (
                  <div style={{ marginBottom: '12px' }}>
                    {googleAdsLoading ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>
                        Verificando conexão...
                      </div>
                    ) : googleAdsConnection?.connected ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          background: '#dbeafe',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 500 }}>
                          ✓ Conectado como {googleAdsConnection.googleName}
                        </span>
                        <button
                          onClick={handleGoogleAdsDisconnect}
                          style={{
                            marginLeft: 'auto',
                            padding: '3px 8px',
                            fontSize: '11px',
                            background: 'transparent',
                            border: '1px solid #1d4ed8',
                            borderRadius: '4px',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                          }}
                        >
                          Desconectar
                        </button>
                      </div>
                    ) : (
                      <a
                        href="/api/google-ads/auth"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          background: '#4285F4',
                          color: '#fff',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        Conectar Google Ads
                      </a>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {group.fields.map((field) => (
                    <div key={field.name}>
                      <label style={labelStyle}>{field.label}</label>
                      <input
                        type={field.name.toLowerCase().includes('token') || field.name.toLowerCase().includes('key') ? 'password' : 'text'}
                        value={(integrations as Record<string, string>)[field.name] ?? ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          handleIntegrationChange(field.name, e.target.value)
                        }
                        placeholder={field.placeholder}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Appearance */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Aparência</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              {APPEARANCE_KEYS.map((key) => {
                const val = appearance[key]
                if (key === 'darkMode') {
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id={`appearance-${key}`}
                        checked={!!val}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          handleAppearanceChange(key, e.target.checked)
                        }
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label
                        htmlFor={`appearance-${key}`}
                        style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary, #111)' }}
                      >
                        Modo Escuro
                      </label>
                    </div>
                  )
                }
                return (
                  <div key={key}>
                    <label style={labelStyle}>{key}</label>
                    <input
                      type="text"
                      value={typeof val === 'string' ? val : ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleAppearanceChange(key, e.target.value)
                      }
                      style={inputStyle}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Tab */}
      {activeTab === 'ai' && (
        <div>
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Provedor de IA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Provedor</label>
                <select
                  value={aiSettings.aiProvider ?? ''}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    handleAiProviderChange(e.target.value)
                  }
                  style={{ ...inputStyle }}
                >
                  <option value="">Selecione...</option>
                  {AI_PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Per-provider config */}
          {aiSettings.aiProvider && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Configuração do Provedor</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentProviderOption?.fields?.map((field) => (
                  <div key={field.key}>
                    <label style={labelStyle}>{field.label}</label>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={
                        (aiSettings.aiProviders?.[aiSettings.aiProvider ?? ''] as Record<string, string> | undefined)?.[field.key] ?? ''
                      }
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        handleAiProviderConfigChange(
                          aiSettings.aiProvider ?? '',
                          field.key as keyof AiProviderConfig,
                          e.target.value,
                        )
                      }
                      placeholder={field.placeholder}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <button
                  onClick={handleResetProviders}
                  style={{
                    ...deleteBtnStyle,
                    alignSelf: 'flex-start',
                    marginTop: '4px',
                  }}
                >
                  Resetar Provedores
                </button>
              </div>
            </div>
          )}

          {/* AI Agents */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Agentes de IA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {(aiSettings.aiAgents ?? []).map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '8px',
                    background: 'var(--bg-surface, #fff)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agent.enabled ?? true}
                    onChange={() => handleToggleAgent(agent.id)}
                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '13px',
                        color: 'var(--text-primary, #111)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.name}
                    </div>
                    {agent.description && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary, #666)',
                          marginTop: '1px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {agent.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleEditAgent(agent.id)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '11px',
                      background: 'transparent',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: 'var(--text-secondary, #666)',
                    }}
                  >
                    Editar
                  </button>
                  <button onClick={() => handleDeleteAgent(agent.id)} style={deleteBtnStyle}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add / Edit Agent Form */}
            <div
              style={{
                padding: '12px',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: '8px',
                background: 'var(--bg-surface, #fff)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary, #111)' }}>
                {editingAgentId ? 'Editar Agente' : 'Novo Agente'}
              </div>
              <input
                type="text"
                placeholder="Nome do agente"
                value={newAgentName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewAgentName(e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Descrição (opcional)"
                value={newAgentDescription}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewAgentDescription(e.target.value)
                }
                style={inputStyle}
              />
              <textarea
                placeholder="System prompt do agente (opcional)"
                value={newAgentPrompt}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setNewAgentPrompt(e.target.value)
                }
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                {editingAgentId ? (
                  <>
                    <button onClick={handleSaveAgent} style={addBtnStyle}>
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditingAgentId(null)
                        setNewAgentName('')
                        setNewAgentDescription('')
                        setNewAgentPrompt('')
                      }}
                      style={deleteBtnStyle}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button onClick={handleAddAgent} style={addBtnStyle}>
                    Adicionar Agente
                  </button>
                )}
                <button
                  onClick={handleResetAgents}
                  style={{ ...deleteBtnStyle, marginLeft: 'auto' }}
                >
                  Resetar Padrão
                </button>
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>System Prompt do Dashboard</div>
            <textarea
              value={aiSettings.aiSystemPrompt ?? DEFAULT_AI_DASHBOARD_PROMPT}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setAiSettings((prev) => ({ ...prev, aiSystemPrompt: e.target.value }))
              }
              rows={10}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleInspectPrompt}
                style={{
                  padding: '5px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-secondary, #666)',
                }}
              >
                Inspecionar
              </button>
              <button
                onClick={() =>
                  setAiSettings((prev) => ({
                    ...prev,
                    aiSystemPrompt: DEFAULT_AI_DASHBOARD_PROMPT,
                  }))
                }
                style={deleteBtnStyle}
              >
                Resetar
              </button>
            </div>
            {promptInspection && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: 'var(--bg-primary, #f9fafb)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-primary, #111)',
                }}
              >
                <div><strong>Válido:</strong> {String(promptInspection.isValid)}</div>
                <div><strong>Tokens estimados:</strong> {promptInspection.estimatedTokens}</div>
                {promptInspection.warnings?.map((w, i) => (
                  <div key={i} style={{ color: '#b45309' }}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Operation Tab */}
      {activeTab === 'operation' && (
        <div>
          {/* Lanes */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Lanes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {(operationSettings.lanes ?? []).map((lane) => (
                <div
                  key={lane.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{lane.name}</span>
                  <button onClick={() => handleDeleteOperationLane(lane.id)} style={deleteBtnStyle}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Nova lane"
                value={newOperationLane}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewOperationLane(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddOperationLane()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddOperationLane} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>

          {/* Statuses */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {(operationSettings.statuses ?? []).map((status) => (
                <div
                  key={status.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{status.name}</span>
                  <button
                    onClick={() => handleDeleteOperationStatus(status.id)}
                    style={deleteBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Novo status"
                value={newOperationStatus}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewOperationStatus(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddOperationStatus()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddOperationStatus} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>

          {/* Custom Fields */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Campos Customizados</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {(operationSettings.customFields ?? []).map((field) => (
                <div
                  key={field.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{field.name}</span>
                  <button
                    onClick={() => handleDeleteOperationCustomField(field.id)}
                    style={deleteBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Novo campo"
                value={newOperationCustomField}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewOperationCustomField(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddOperationCustomField()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddOperationCustomField} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clients Tab */}
      {activeTab === 'clients' && (
        <div>
          {/* Custom Columns */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Colunas Customizadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {clientsConfig.customColumns.map((col) => (
                <div
                  key={col.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{col.name}</span>
                  <button
                    onClick={() => handleDeleteClientCustomColumn(col.id)}
                    style={deleteBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Nova coluna"
                value={newClientCustomColumn}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewClientCustomColumn(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddClientCustomColumn()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddClientCustomColumn} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>

          {/* Custom Tabs */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Abas Customizadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {clientsConfig.customTabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{tab.name}</span>
                  <button
                    onClick={() => handleDeleteClientCustomTab(tab.id)}
                    style={deleteBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Nova aba"
                value={newClientCustomTab}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewClientCustomTab(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddClientCustomTab()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddClientCustomTab} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>

          {/* Implementation Phases */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Fases de Implementação</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {clientsConfig.implementationPhases.map((phase) => (
                <div
                  key={phase.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '6px',
                    background: 'var(--bg-surface, #fff)',
                    fontSize: '13px',
                  }}
                >
                  <span>{phase.name}</span>
                  <button
                    onClick={() => handleDeleteClientImplementationPhase(phase.id)}
                    style={deleteBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Nova fase"
                value={newClientImplementationPhase}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewClientImplementationPhase(e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddClientImplementationPhase()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleAddClientImplementationPhase} style={addBtnStyle}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .settings-page-wrapper {
          box-sizing: border-box;
        }
        .settings-page-wrapper * {
          box-sizing: border-box;
        }
        .settings-page-wrapper input:focus,
        .settings-page-wrapper select:focus,
        .settings-page-wrapper textarea:focus {
          border-color: var(--accent, #006c44) !important;
          box-shadow: 0 0 0 2px color-mix(in srgb, #006c44 15%, transparent) !important;
        }
        .settings-page-wrapper button:hover:not(:disabled) {
          opacity: 0.85 !important;
        }
        .settings-page-wrapper a:hover {
          opacity: 0.85 !important;
          border-color: color-mix(in srgb, #006c44 34%, #bbcabe) !important;
        }
      `}</style>
    </div>
  )
}

export default function SettingsPageRoute() { return <SettingsPage /> }
