'use client'

import type { ChangeEvent, CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/contexts/UserContext'
import { DEFAULT_USER_APPEARANCE } from '@/lib/user-appearance-storage'
import { USER_APPEARANCE_PRESETS } from '@/lib/user-appearance-storage'
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

type SettingsTab = 'panel' | 'general' | 'operation' | 'clients'

const SETTINGS_TAB_STORAGE_KEY = 'dash_settings_active_tab'

type GlobalIntegrationsState = DashboardIntegrations & Record<string, unknown>

interface SettingsServerState {
  globalIntegrations?: Partial<GlobalIntegrationsState>
  clients?: ClientRecord[]
  operationSettings?: OperationSettingsRecord
  clientImplementationPhases?: ClientImplementationPhaseRecord[]
  clientSystemFields?: ClientCustomColumnRecord[]
  clientCustomColumns?: ClientCustomColumnRecord[]
  clientCustomTabs?: ClientCustomTabRecord[]
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

const CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS: Array<{ value: ClientCustomColumnRecord['type']; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'long_text', label: 'Area de texto' },
  { value: 'number', label: 'Numero' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Percentual' },
  { value: 'date', label: 'Data' },
  { value: 'link', label: 'Link' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'person', label: 'Pessoas' },
  { value: 'progress', label: 'Progresso' },
  { value: 'checkbox', label: 'Caixa de selecao' },
  { value: 'select', label: 'Dropdown' },
  { value: 'formula', label: 'Formula' },
  { value: 'flag', label: 'Flag' },
]

const DEFAULT_CLIENT_FIELD_TABS = [
  { key: 'geral', label: 'Geral' },
  { key: 'flags', label: 'Flags' },
  { key: 'quality', label: 'Quality Check' },
  { key: 'dados', label: 'Dados' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'branding', label: 'Branding' },
  { key: 'mais', label: 'Mais 1' },
]

const DEFAULT_CLIENT_SYSTEM_FIELDS: ClientCustomColumnRecord[] = [
  createClientCustomColumnRecord({ key: 'name', label: 'Cliente', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'cnpj', label: 'CNPJ', type: 'text', tabKey: 'geral', settings: { placeholder: '00.000.000/0000-00' } }),
  createClientCustomColumnRecord({ key: 'segment', label: 'Segmento', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'subsegment', label: 'Subsegmento', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'tier', label: 'Tier', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'squad', label: 'Squad', type: 'text', tabKey: 'dados' }),
  createClientCustomColumnRecord({ key: 'salesModel', label: 'Modelo de Vendas', type: 'select', tabKey: 'geral', options: ['INSIDE_SALES', 'ECOM', 'PDV'] }),
  createClientCustomColumnRecord({ key: 'implementationPhase', label: 'Etapa da Jornada', type: 'select', tabKey: 'geral', options: ['Implementação (Inside Sales)', 'Implementação (Ecom)', 'Implementação (PDV)'] }),
  createClientCustomColumnRecord({ key: 'status', label: 'Status', type: 'select', tabKey: 'geral', options: ['Ativo', 'Onboarding', 'Pausado', 'Risco', 'Churn'] }),
  createClientCustomColumnRecord({ key: 'product', label: 'Produto', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'fee', label: 'Fee', type: 'currency', tabKey: 'geral', settings: { currencyCode: 'BRL' } }),
  createClientCustomColumnRecord({ key: 'mediaInvestment', label: 'Investimento em Mídia', type: 'currency', tabKey: 'geral', settings: { currencyCode: 'BRL' } }),
  createClientCustomColumnRecord({ key: 'contractSignedAt', label: 'Assinatura do Contrato', type: 'date', tabKey: 'geral', settings: { dateFormat: 'dd/MM/yyyy' } }),
  createClientCustomColumnRecord({ key: 'churnDate', label: 'Data de Churn', type: 'date', tabKey: 'geral', settings: { dateFormat: 'dd/MM/yyyy' } }),
  createClientCustomColumnRecord({ key: 'startDate', label: 'Data de Entrada', type: 'date', tabKey: 'geral', settings: { dateFormat: 'dd/MM/yyyy' } }),
  createClientCustomColumnRecord({ key: 'implementationObservation', label: 'Observações da Jornada', type: 'long_text', tabKey: 'dados' }),
  createClientCustomColumnRecord({ key: 'step', label: 'STEP', type: 'text', tabKey: 'geral' }),
  createClientCustomColumnRecord({ key: 'ltv', label: 'LTV', type: 'currency', tabKey: 'geral', settings: { currencyCode: 'BRL' } }),
  createClientCustomColumnRecord({ key: 'monthlyRevenue', label: 'Faturamento', type: 'currency', tabKey: 'financeiro', settings: { currencyCode: 'BRL' } }),
  createClientCustomColumnRecord({ key: 'contributionMarginPercent', label: 'Margem de Contribuição (%)', type: 'percent', tabKey: 'financeiro', settings: { decimals: '2' } }),
  createClientCustomColumnRecord({ key: 'profitMarginPercent', label: 'Margem de Lucro (%)', type: 'percent', tabKey: 'financeiro', settings: { decimals: '2' } }),
  createClientCustomColumnRecord({ key: 'mmf', label: 'MM/F', type: 'number', tabKey: 'financeiro', settings: { decimals: '2' } }),
  createClientCustomColumnRecord({ key: 'roiMarketing', label: 'ROI do Marketing', type: 'number', tabKey: 'financeiro', settings: { decimals: '2' } }),
  createClientCustomColumnRecord({ key: 'projectManager', label: 'Gestor de Projetos', type: 'person', tabKey: 'dados' }),
  createClientCustomColumnRecord({ key: 'trafficManager', label: 'Gestor de Tráfego', type: 'person', tabKey: 'dados' }),
  createClientCustomColumnRecord({ key: 'designer', label: 'Designer', type: 'person', tabKey: 'dados' }),
  createClientCustomColumnRecord({ key: 'organicDemands', label: 'Demandas Orgânicas', type: 'number', tabKey: 'dados', settings: { decimals: '0' } }),
  createClientCustomColumnRecord({ key: 'trafficDemands', label: 'Demandas de Tráfego', type: 'number', tabKey: 'dados', settings: { decimals: '0' } }),
  createClientCustomColumnRecord({ key: 'totalDemands', label: 'Total de Demandas', type: 'number', tabKey: 'dados', settings: { decimals: '0' } }),
  createClientCustomColumnRecord({ key: 'contractUrl', label: 'Contrato', type: 'link', tabKey: 'branding' }),
  createClientCustomColumnRecord({ key: 'dashboardUrl', label: 'Dashboard', type: 'link', tabKey: 'branding' }),
  createClientCustomColumnRecord({ key: 'driveUrl', label: 'Drive', type: 'link', tabKey: 'branding' }),
]

function getResolvedClientImplementationPhases(phases?: ClientImplementationPhaseRecord[]): ClientImplementationPhaseRecord[] {
  return Array.isArray(phases) && phases.length
    ? phases
    : DEFAULT_CLIENT_IMPLEMENTATION_PHASES.map((phase) => createClientImplementationPhaseRecord(phase))
}

function syncImplementationPhaseSystemFieldOptions(
  fields: ClientCustomColumnRecord[],
  phases: ClientImplementationPhaseRecord[]
): ClientCustomColumnRecord[] {
  const options = phases
    .map((phase) => String(phase.label || '').trim())
    .filter(Boolean)

  return fields.map((field) =>
    field.key === 'implementationPhase'
      ? createClientCustomColumnRecord({
          ...field,
          options,
        })
      : field
  )
}

function getDynamicFieldSettings(type: ClientCustomColumnRecord['type']) {
  const sharedTabField = [{ key: 'placeholder', label: 'Placeholder', placeholder: 'Texto de ajuda do campo' }]

  switch (type) {
    case 'currency':
      return [
        { key: 'currencyCode', label: 'Moeda', placeholder: 'BRL, USD, EUR' },
        { key: 'decimals', label: 'Casas decimais', placeholder: '2' },
      ]
    case 'number':
    case 'percent':
    case 'progress':
      return [
        { key: 'decimals', label: 'Casas decimais', placeholder: '0, 1, 2...' },
        { key: 'suffix', label: 'Sufixo', placeholder: '%, pts, h...' },
      ]
    case 'date':
      return [{ key: 'dateFormat', label: 'Formato da data', placeholder: 'dd/MM/yyyy' }]
    case 'select':
      return [{ key: 'selectAppearance', label: 'Estilo do dropdown', placeholder: 'single, badge...' }]
    case 'checkbox':
      return [
        { key: 'checkedLabel', label: 'Texto marcado', placeholder: 'Sim' },
        { key: 'uncheckedLabel', label: 'Texto desmarcado', placeholder: 'Nao' },
      ]
    case 'phone':
      return [{ key: 'countryCode', label: 'Codigo do país', placeholder: '+55' }]
    case 'email':
      return [{ key: 'domainHint', label: 'Domínio sugerido', placeholder: 'empresa.com' }]
    case 'person':
      return [{ key: 'roleHint', label: 'Perfil sugerido', placeholder: 'CS, Design, Mídia...' }]
    case 'formula':
      return [{ key: 'formulaFormat', label: 'Formato de saída', placeholder: 'number, currency, percent' }]
    default:
      return sharedTabField
  }
}

function normalizeSelectOptionsInput(value: string): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function normalizePhaseChecklistInput(value: string): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function appendDropdownOption(currentValue: string, nextOption: string): string {
  const options = normalizeSelectOptionsInput(
    [currentValue, nextOption].filter(Boolean).join(',')
  )
  return options.join(', ')
}

function fieldHasFilledValue(client: ClientRecord, fieldKey: string, source: 'system' | 'custom'): boolean {
  const rawValue =
    source === 'custom'
      ? client?.customFieldValues?.[fieldKey]
      : client?.[fieldKey as keyof ClientRecord]

  if (Array.isArray(rawValue)) return rawValue.length > 0
  if (typeof rawValue === 'boolean') return rawValue
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) && rawValue !== 0
  if (rawValue && typeof rawValue === 'object') return Object.keys(rawValue).length > 0
  return String(rawValue || '').trim().length > 0
}

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
  const [clientSystemFields, setClientSystemFields] = useState<ClientCustomColumnRecord[]>(() => {
    const preferences = loadDashboardPreferences()
    const phases = getResolvedClientImplementationPhases(preferences.clientImplementationPhases)
    const fields = Array.isArray(preferences.clientSystemFields) && preferences.clientSystemFields.length
      ? preferences.clientSystemFields
      : DEFAULT_CLIENT_SYSTEM_FIELDS
    return syncImplementationPhaseSystemFieldOptions(fields, phases)
  })
  const [clientImplementationPhases, setClientImplementationPhases] = useState<ClientImplementationPhaseRecord[]>(() => {
    const preferences = loadDashboardPreferences()
    return getResolvedClientImplementationPhases(preferences.clientImplementationPhases)
  })
  const [operationSettings, setOperationSettings] = useState<OperationSettingsRecord>(() => {
    const preferences = loadDashboardPreferences()
    return createOperationSettingsRecord(preferences.operationSettings)
  })
  const [clientCustomColumns, setClientCustomColumns] = useState<ClientCustomColumnRecord[]>(() => {
    const preferences = loadDashboardPreferences()
    return Array.isArray(preferences.clientCustomColumns) ? preferences.clientCustomColumns : []
  })
  const [clientCustomTabs, setClientCustomTabs] = useState<ClientCustomTabRecord[]>(() => {
    const preferences = loadDashboardPreferences()
    return Array.isArray(preferences.clientCustomTabs) ? preferences.clientCustomTabs : []
  })
  const [newClientColumnLabel, setNewClientColumnLabel] = useState('')
  const [newClientColumnType, setNewClientColumnType] = useState<ClientCustomColumnRecord['type']>('text')
  const [newClientColumnTab, setNewClientColumnTab] = useState('geral')
  const [newClientColumnOptions, setNewClientColumnOptions] = useState('')
  const [newClientColumnOptionDraft, setNewClientColumnOptionDraft] = useState('')
  const [newClientColumnFormula, setNewClientColumnFormula] = useState('')
  const [newClientTabLabel, setNewClientTabLabel] = useState('')
  const [newClientPhaseLabel, setNewClientPhaseLabel] = useState('')
  const [newClientPhaseDescription, setNewClientPhaseDescription] = useState('')
  const [newClientPhaseObjective, setNewClientPhaseObjective] = useState('')
  const [newClientPhaseChecklist, setNewClientPhaseChecklist] = useState('')
  const [newClientPhaseSlaDays, setNewClientPhaseSlaDays] = useState('')
  const [newOperationLaneLabel, setNewOperationLaneLabel] = useState('')
  const [newOperationStatusLabel, setNewOperationStatusLabel] = useState('')
  const [newOperationTagLabel, setNewOperationTagLabel] = useState('')
  const [newOperationTaskTypeLabel, setNewOperationTaskTypeLabel] = useState('')
  const [newOperationCustomFieldLabel, setNewOperationCustomFieldLabel] = useState('')
  const [newOperationCustomFieldType, setNewOperationCustomFieldType] = useState<OperationCustomFieldRecord['type']>('text')
  const [newOperationCustomFieldOptions, setNewOperationCustomFieldOptions] = useState('')
  const [systemFieldOptionDrafts, setSystemFieldOptionDrafts] = useState<Record<string, string>>({})
  const [customFieldOptionDrafts, setCustomFieldOptionDrafts] = useState<Record<string, string>>({})
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
  const clientFieldTabOptions = useMemo(
    () => [
      ...DEFAULT_CLIENT_FIELD_TABS,
      ...clientCustomTabs.map((tab) => ({ key: tab.key, label: tab.label })),
    ],
    [clientCustomTabs]
  )
  const allClientFieldLibrary = useMemo(
    () => [
      ...clientSystemFields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        source: 'system',
      })),
      ...clientCustomColumns.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        source: 'custom',
      })),
    ],
    [clientCustomColumns, clientSystemFields]
  )
  const settingsSidebarHighlights = useMemo(() => {
    if (activeSettingsTab === 'panel') {
      return {
        title: 'Aparência ativa',
        description: 'Controle a assinatura visual do app e a atmosfera geral da interface.',
        items: [
          'Tema claro/escuro no topo do app',
          `Cor de destaque ${panelDraft.accent.toUpperCase()}`,
          `Fundo base ${panelDraft.backgroundTint.toUpperCase()}`,
        ],
      }
    }

    if (activeSettingsTab === 'general') {
      return {
        title: 'Integrações gerais',
        description: 'Credenciais e base de leitura executiva centralizadas por aqui.',
        items: [
          `${advertisingIntegrationGroups.length} integrações de mídia`,
          `${crmIntegrationGroups.length} integrações de CRM`,
          'Providers e prompt de IA centralizados',
        ],
      }
    }

    if (activeSettingsTab === 'operation') {
      return {
        title: 'Estrutura da operação',
        description: 'Tudo que alimenta o modal e o board operacional fica aqui.',
        items: [
          `${operationSettings.lanes.length} coluna(s) do kanban`,
          `${operationSettings.statuses.length} status de card`,
          `${(operationSettings.tags || []).length} tag(s) disponíveis`,
          `${(operationSettings.taskTypes || []).length} tipo(s) de tarefa`,
          `${(operationSettings.customFields || []).length} campo(s) customizado(s)`,
        ],
      }
    }

    return {
      title: 'Base de clientes',
      description: 'Ajustes estruturais da base que alimenta clientes e operação.',
        items: [
          `${clientImplementationPhases.length} etapa(s) da jornada`,
          `${clientSystemFields.length} campo(s) de sistema`,
          `${clientCustomColumns.length} campo(s) customizado(s)`,
          `${clientCustomTabs.length} aba(s) customizada(s)`,
        ],
      }
  }, [
    activeSettingsTab,
    advertisingIntegrationGroups.length,
    clientImplementationPhases.length,
    clientCustomColumns.length,
    clientCustomTabs.length,
    clientSystemFields.length,
    crmIntegrationGroups.length,
    operationSettings,
    panelDraft,
  ])
  const serverClients = useMemo(
    () => (Array.isArray(serverState?.clients) ? serverState.clients : []),
    [serverState?.clients]
  )
  const clientFieldImpact = useMemo(() => {
    const allFields = [
      ...clientSystemFields.map((field) => ({ ...field, source: 'system' as const })),
      ...clientCustomColumns.map((field) => ({ ...field, source: 'custom' as const })),
    ]

    return Object.fromEntries(
      allFields.map((field) => {
        const filledClientsCount = serverClients.filter((client) =>
          fieldHasFilledValue(client, field.key, field.source)
        ).length
        const linkedTabsCount = [
          field.tabKey,
          ...clientCustomTabs
            .filter((tab) => (tab.columnKeys || []).includes(field.key))
            .map((tab) => tab.key),
        ].filter(Boolean).length
        const dependentFormulaCount = clientCustomColumns.filter((column) =>
          column.type === 'formula' &&
          String(column.formulaExpression || '').includes(`{${field.key}}`)
        ).length

        return [
          field.key,
          {
            filledClientsCount,
            linkedTabsCount,
            dependentFormulaCount,
          },
        ]
      })
    )
  }, [clientCustomColumns, clientCustomTabs, clientSystemFields, serverClients])
  const clientTabImpact = useMemo(() => {
    const allTabs = [...DEFAULT_CLIENT_FIELD_TABS, ...clientCustomTabs]

    return Object.fromEntries(
      allTabs.map((tab) => {
        const tabFieldKeys = allClientFieldLibrary
          .filter((field) => {
            const matchesPrimaryTab =
              (clientSystemFields.find((item) => item.key === field.key)?.tabKey ||
                clientCustomColumns.find((item) => item.key === field.key)?.tabKey) === tab.key
            const matchesCustomMembership = clientCustomTabs.some(
              (customTab) => customTab.key === tab.key && (customTab.columnKeys || []).includes(field.key)
            )
            return matchesPrimaryTab || matchesCustomMembership
          })
          .map((field) => field.key)

        const clientsWithDataCount = serverClients.filter((client) =>
          tabFieldKeys.some((fieldKey) => {
            const source = clientCustomColumns.some((field) => field.key === fieldKey) ? 'custom' : 'system'
            return fieldHasFilledValue(client, fieldKey, source)
          })
        ).length

        return [
          tab.key,
          {
            fieldCount: tabFieldKeys.length,
            clientsWithDataCount,
          },
        ]
      })
    )
  }, [allClientFieldLibrary, clientCustomColumns, clientCustomTabs, clientSystemFields, serverClients])
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
        const resolvedImplementationPhases = getResolvedClientImplementationPhases(state.clientImplementationPhases)
        setClientImplementationPhases(resolvedImplementationPhases)
        setClientSystemFields(
          syncImplementationPhaseSystemFieldOptions(
            Array.isArray(state.clientSystemFields) && state.clientSystemFields.length
              ? state.clientSystemFields
              : DEFAULT_CLIENT_SYSTEM_FIELDS,
            resolvedImplementationPhases
          )
        )
        setOperationSettings(createOperationSettingsRecord(state.operationSettings))
        setClientCustomColumns(Array.isArray(state.clientCustomColumns) ? state.clientCustomColumns : [])
        setClientCustomTabs(Array.isArray(state.clientCustomTabs) ? state.clientCustomTabs : [])
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

    const storedTab = window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)
    const resolvedStoredTab = storedTab === 'panel' || storedTab === 'general' || storedTab === 'operation' || storedTab === 'clients'
      ? storedTab
      : null

    if (tab === 'operation') {
      setActiveSettingsTab('operation')
    } else if (tab === 'clients') {
      setActiveSettingsTab('clients')
    } else if (tab === 'ai') {
      setActiveSettingsTab('general')
    } else if (tab === 'general') {
      setActiveSettingsTab('general')
    } else if (tab === 'panel') {
      setActiveSettingsTab('panel')
    } else if (canManageClients && resolvedStoredTab) {
      setActiveSettingsTab(resolvedStoredTab)
    } else if (canManageClients) {
      setActiveSettingsTab('clients')
    } else if (resolvedStoredTab === 'panel') {
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
  }, [canManageClients, globalIntegrations, globalIntegrations.metaConnectionMode, persistGlobalIntegrations])

  useEffect(() => {
    if (!canManageClients && activeSettingsTab !== 'panel') {
      setActiveSettingsTab('panel')
    }
  }, [activeSettingsTab, canManageClients])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, activeSettingsTab)
  }, [activeSettingsTab])

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

  const persistClientStructure = useCallback(
    async (
      nextImplementationPhases: ClientImplementationPhaseRecord[],
      nextSystemFields: ClientCustomColumnRecord[],
      nextColumns: ClientCustomColumnRecord[],
      nextTabs: ClientCustomTabRecord[],
      nextClients?: ClientRecord[]
    ) => {
      const preferences = loadDashboardPreferences()
      saveDashboardPreferences({
        ...preferences,
        clientImplementationPhases: nextImplementationPhases,
        clientSystemFields: nextSystemFields,
        clientCustomColumns: nextColumns,
        clientCustomTabs: nextTabs,
      })

      if (canManageClients && serverState) {
        const response = await fetch('/api/dashboard/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...serverState,
            clients: nextClients || serverState.clients,
            clientImplementationPhases: nextImplementationPhases,
            clientSystemFields: nextSystemFields,
            clientCustomColumns: nextColumns,
            clientCustomTabs: nextTabs,
          }),
        })

        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível salvar a estrutura de clientes.')
        }

        setServerState(data)
      }
    },
    [canManageClients, serverState]
  )

  const persistOperationSettings = useCallback(
    async (nextOperationSettings: OperationSettingsRecord) => {
      const preferences = loadDashboardPreferences()
      saveDashboardPreferences({
        ...preferences,
        operationSettings: nextOperationSettings,
      })

      if (canManageClients && serverState) {
        const response = await fetch('/api/dashboard/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...serverState,
            operationSettings: nextOperationSettings,
          }),
        })

        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Não foi possível salvar a configuração da operação.')
        }

        setServerState(data)
      }
    },
    [canManageClients, serverState]
  )

  const handleCreateClientCustomColumn = () => {
    if (!canManageClients) return
    const trimmedLabel = newClientColumnLabel.trim()
    if (!trimmedLabel) return

    const nextColumns = [
      ...clientCustomColumns,
      createClientCustomColumnRecord({
        label: trimmedLabel,
        type: newClientColumnType,
        tabKey: newClientColumnTab,
        options: newClientColumnType === 'select' ? normalizeSelectOptionsInput(newClientColumnOptions) : [],
        formulaExpression: newClientColumnType === 'formula' ? newClientColumnFormula : '',
      }),
    ]

    setClientCustomColumns(nextColumns)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, nextColumns, clientCustomTabs)
    setNewClientColumnLabel('')
    setNewClientColumnType('text')
    setNewClientColumnTab('geral')
    setNewClientColumnOptions('')
    setNewClientColumnOptionDraft('')
    setNewClientColumnFormula('')
    setSettingsSaveFeedback('Campo salvo em Configurações e sincronizado com a base.')
  }

  const handleOperationLaneFieldChange = (laneId: string, fieldName: 'label' | 'color' | 'defaultSubtasks', value: string) => {
    const nextSettings = {
      ...operationSettings,
      lanes: operationSettings.lanes.map((lane) =>
        lane.id === laneId
          ? {
              ...lane,
              [fieldName]: fieldName === 'defaultSubtasks'
                ? normalizeSelectOptionsInput(value)
                : value,
            }
          : lane
      ),
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateOperationLane = () => {
    if (!newOperationLaneLabel.trim()) return

    const nextSettings = {
      ...operationSettings,
      lanes: [
        ...operationSettings.lanes,
        createOperationLaneRecord({
          label: newOperationLaneLabel.trim(),
          color: '#3b82f6',
          defaultSubtasks: [],
        }),
      ],
    }

    setOperationSettings(nextSettings)
    setNewOperationLaneLabel('')
    void persistOperationSettings(nextSettings)
  }

  const handleRemoveOperationLane = (laneId: string) => {
    const nextLanes = operationSettings.lanes.filter((lane) => lane.id !== laneId)
    if (!nextLanes.length) return

    const nextSettings = {
      ...operationSettings,
      lanes: nextLanes,
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleOperationStatusFieldChange = (statusId: string, fieldName: 'label' | 'color', value: string) => {
    const nextSettings = {
      ...operationSettings,
      statuses: operationSettings.statuses.map((status) =>
        status.id === statusId
          ? {
              ...status,
              [fieldName]: value,
            }
          : status
      ),
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateOperationStatus = () => {
    if (!newOperationStatusLabel.trim()) return

    const nextSettings = {
      ...operationSettings,
      statuses: [
        ...operationSettings.statuses,
        createOperationStatusRecord({
          label: newOperationStatusLabel.trim(),
          color: '#3b82f6',
        }),
      ],
    }

    setOperationSettings(nextSettings)
    setNewOperationStatusLabel('')
    void persistOperationSettings(nextSettings)
  }

  const handleRemoveOperationStatus = (statusId: string) => {
    const nextStatuses = operationSettings.statuses.filter((status) => status.id !== statusId)
    if (!nextStatuses.length) return

    const nextSettings = {
      ...operationSettings,
      statuses: nextStatuses,
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateOperationTag = () => {
    const trimmedLabel = newOperationTagLabel.trim()
    if (!trimmedLabel) return

    const nextSettings = {
      ...operationSettings,
      tags: Array.from(new Set([...(operationSettings.tags || []), trimmedLabel])),
    }

    setOperationSettings(nextSettings)
    setNewOperationTagLabel('')
    void persistOperationSettings(nextSettings)
  }

  const handleRemoveOperationTag = (tagLabel: string) => {
    const nextSettings = {
      ...operationSettings,
      tags: (operationSettings.tags || []).filter((tag) => tag !== tagLabel),
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateOperationTaskType = () => {
    const trimmedLabel = newOperationTaskTypeLabel.trim()
    if (!trimmedLabel) return

    const nextSettings = {
      ...operationSettings,
      taskTypes: Array.from(new Set([...(operationSettings.taskTypes || []), trimmedLabel])),
    }

    setOperationSettings(nextSettings)
    setNewOperationTaskTypeLabel('')
    void persistOperationSettings(nextSettings)
  }

  const handleRemoveOperationTaskType = (taskTypeLabel: string) => {
    const nextTaskTypes = (operationSettings.taskTypes || []).filter((item) => item !== taskTypeLabel)
    if (!nextTaskTypes.length) return

    const nextSettings = {
      ...operationSettings,
      taskTypes: nextTaskTypes,
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateOperationCustomField = () => {
    const trimmedLabel = newOperationCustomFieldLabel.trim()
    if (!trimmedLabel) return

    const nextSettings = {
      ...operationSettings,
      customFields: [
        ...(operationSettings.customFields || []),
        createOperationCustomFieldRecord({
          label: trimmedLabel,
          type: newOperationCustomFieldType,
          options: newOperationCustomFieldType === 'select' ? normalizeSelectOptionsInput(newOperationCustomFieldOptions) : [],
        }),
      ],
    }

    setOperationSettings(nextSettings)
    setNewOperationCustomFieldLabel('')
    setNewOperationCustomFieldType('text')
    setNewOperationCustomFieldOptions('')
    void persistOperationSettings(nextSettings)
  }

  const handleOperationCustomFieldChange = (
    fieldId: string,
    fieldName: 'label' | 'type' | 'options',
    value: string
  ) => {
    const nextSettings = {
      ...operationSettings,
      customFields: (operationSettings.customFields || []).map((field) =>
        field.id === fieldId
          ? createOperationCustomFieldRecord({
              ...field,
              [fieldName]: fieldName === 'options' ? normalizeSelectOptionsInput(value) : value,
              options:
                fieldName === 'type'
                  ? (value === 'select' ? field.options : [])
                  : fieldName === 'options'
                    ? normalizeSelectOptionsInput(value)
                    : field.options,
            })
          : field
      ),
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleRemoveOperationCustomField = (fieldId: string) => {
    const nextSettings = {
      ...operationSettings,
      customFields: (operationSettings.customFields || []).filter((field) => field.id !== fieldId),
    }

    setOperationSettings(nextSettings)
    void persistOperationSettings(nextSettings)
  }

  const handleCreateClientCustomTab = () => {
    if (!canManageClients) return
    const trimmedLabel = newClientTabLabel.trim()
    if (!trimmedLabel) return

    const nextTabs = [...clientCustomTabs, createClientCustomTabRecord({ label: trimmedLabel })]
    setClientCustomTabs(nextTabs)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, clientCustomColumns, nextTabs)
    setNewClientTabLabel('')
    setSettingsSaveFeedback('Aba salva em Configurações e sincronizada com a base.')
  }

  const handleClientCustomColumnFieldChange = (
    columnId: string,
    fieldName: keyof ClientCustomColumnRecord | 'optionsInput' | 'setting',
    value: string,
    settingKey?: string
  ) => {
    if (!canManageClients) return

    const nextColumns = clientCustomColumns.map((column) =>
      column.id === columnId
        ? createClientCustomColumnRecord({
            ...column,
            [fieldName === 'optionsInput' || fieldName === 'setting' ? 'label' : fieldName]:
              fieldName === 'optionsInput' || fieldName === 'setting'
                ? column.label
                : value,
            options:
              fieldName === 'type' && value !== 'select'
                ? []
                : fieldName === 'optionsInput'
                  ? normalizeSelectOptionsInput(value)
                  : column.options,
            formulaExpression:
              fieldName === 'type' && value !== 'formula'
                ? ''
                : fieldName === 'formulaExpression'
                  ? value
                  : column.formulaExpression,
            settings:
              fieldName === 'setting' && settingKey
                ? {
                    ...(column.settings || {}),
                    [settingKey]: value,
                  }
                : column.settings,
          })
        : column
    )

    setClientCustomColumns(nextColumns)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, nextColumns, clientCustomTabs)
  }

  const handleRemoveClientCustomColumn = (columnKey: string) => {
    if (!canManageClients) return
    const usageCount = serverClients.filter((client) => fieldHasFilledValue(client, columnKey, 'custom')).length
    const linkedTabs = clientCustomTabs.filter((tab) => (tab.columnKeys || []).includes(columnKey))

    if (usageCount > 0) {
      const confirmed = window.confirm(
        `Esse campo já tem preenchimento em ${usageCount} cliente(s) e está ligado a ${linkedTabs.length} aba(s). Deseja excluir mesmo assim?`
      )

      if (!confirmed) return
    }

    const nextColumns = clientCustomColumns.filter((column) => column.key !== columnKey)
    const nextTabs = clientCustomTabs.map((tab) => ({
      ...tab,
      columnKeys: (tab.columnKeys || []).filter((currentKey) => currentKey !== columnKey),
    }))
    setClientCustomColumns(nextColumns)
    setClientCustomTabs(nextTabs)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, nextColumns, nextTabs)
    setSettingsSaveFeedback('Campo removido da estrutura de clientes.')
  }

  const handleClientCustomTabFieldChange = (tabId: string, value: string) => {
    if (!canManageClients) return
    const nextTabs = clientCustomTabs.map((tab) =>
      tab.id === tabId ? createClientCustomTabRecord({ ...tab, label: value }) : tab
    )
    setClientCustomTabs(nextTabs)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, clientCustomColumns, nextTabs)
  }

  const handleClientCustomTabColumnToggle = (tabId: string, columnKey: string) => {
    if (!canManageClients) return
    const nextTabs = clientCustomTabs.map((tab) => {
      if (tab.id !== tabId) return tab
      const currentKeys = Array.isArray(tab.columnKeys) ? tab.columnKeys : []
      return {
        ...tab,
        columnKeys: currentKeys.includes(columnKey)
          ? currentKeys.filter((item) => item !== columnKey)
          : [...currentKeys, columnKey],
      }
    })
    setClientCustomTabs(nextTabs)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, clientCustomColumns, nextTabs)
  }

  const handleRemoveClientCustomTab = (tabId: string) => {
    if (!canManageClients) return
    const currentTab = clientCustomTabs.find((tab) => tab.id === tabId)
    const linkedFieldKeys = currentTab?.columnKeys || []
    const filledFieldsCount = linkedFieldKeys.reduce((count, fieldKey) => {
      const fieldSource = clientCustomColumns.some((field) => field.key === fieldKey) ? 'custom' : 'system'
      const hasFilledValues = serverClients.some((client) => fieldHasFilledValue(client, fieldKey, fieldSource))
      return hasFilledValues ? count + 1 : count
    }, 0)

    if ((linkedFieldKeys.length > 0 || filledFieldsCount > 0) && currentTab) {
      const confirmed = window.confirm(
        `A aba "${currentTab.label}" tem ${linkedFieldKeys.length} campo(s) vinculado(s) e ${filledFieldsCount} com dados preenchidos na base. Deseja excluir mesmo assim?`
      )

      if (!confirmed) return
    }

    const nextTabs = clientCustomTabs.filter((tab) => tab.id !== tabId)
    setClientCustomTabs(nextTabs)
    void persistClientStructure(clientImplementationPhases, clientSystemFields, clientCustomColumns, nextTabs)
    setSettingsSaveFeedback('Aba removida da estrutura de clientes.')
  }

  const handleClientSystemFieldChange = (
    fieldKey: string,
    fieldName: keyof ClientCustomColumnRecord | 'optionsInput' | 'setting',
    value: string,
    settingKey?: string
  ) => {
    if (!canManageClients) return
    if (fieldKey === 'implementationPhase' && fieldName === 'optionsInput') return

    const nextSystemFields = clientSystemFields.map((field) =>
      field.key === fieldKey
        ? createClientCustomColumnRecord({
            ...field,
            [fieldName === 'optionsInput' || fieldName === 'setting' ? 'label' : fieldName]:
              fieldName === 'optionsInput' || fieldName === 'setting'
                ? field.label
                : value,
            options:
              fieldName === 'type' && value !== 'select'
                ? []
                : fieldName === 'optionsInput'
                  ? normalizeSelectOptionsInput(value)
                  : field.options,
            formulaExpression:
              fieldName === 'type' && value !== 'formula'
                ? ''
                : fieldName === 'formulaExpression'
                  ? value
                  : field.formulaExpression,
            settings:
              fieldName === 'setting' && settingKey
                ? {
                    ...(field.settings || {}),
                    [settingKey]: value,
                  }
                : field.settings,
          })
        : field
    )

    setClientSystemFields(nextSystemFields)
    void persistClientStructure(clientImplementationPhases, nextSystemFields, clientCustomColumns, clientCustomTabs)
  }

  const handleAddNewClientColumnOption = () => {
    if (!newClientColumnOptionDraft.trim()) return
    setNewClientColumnOptions((current) => appendDropdownOption(current, newClientColumnOptionDraft))
    setNewClientColumnOptionDraft('')
  }

  const handleRemoveNewClientColumnOption = (optionToRemove: string) => {
    setNewClientColumnOptions((current) =>
      normalizeSelectOptionsInput(current)
        .filter((option) => option !== optionToRemove)
        .join(', ')
    )
  }

  const handleAddSystemFieldOption = (fieldKey: string) => {
    const nextOption = String(systemFieldOptionDrafts[fieldKey] || '').trim()
    if (!nextOption) return
    const currentField = clientSystemFields.find((field) => field.key === fieldKey)
    if (!currentField) return
    handleClientSystemFieldChange(fieldKey, 'optionsInput', appendDropdownOption((currentField.options || []).join(', '), nextOption))
    setSystemFieldOptionDrafts((current) => ({ ...current, [fieldKey]: '' }))
  }

  const handleRemoveSystemFieldOption = (fieldKey: string, optionToRemove: string) => {
    const currentField = clientSystemFields.find((field) => field.key === fieldKey)
    if (!currentField) return
    handleClientSystemFieldChange(
      fieldKey,
      'optionsInput',
      (currentField.options || []).filter((option) => option !== optionToRemove).join(', ')
    )
  }

  const handleAddCustomFieldOption = (fieldId: string) => {
    const nextOption = String(customFieldOptionDrafts[fieldId] || '').trim()
    if (!nextOption) return
    const currentField = clientCustomColumns.find((field) => field.id === fieldId)
    if (!currentField) return
    handleClientCustomColumnFieldChange(fieldId, 'optionsInput', appendDropdownOption((currentField.options || []).join(', '), nextOption))
    setCustomFieldOptionDrafts((current) => ({ ...current, [fieldId]: '' }))
  }

  const handleRemoveCustomFieldOption = (fieldId: string, optionToRemove: string) => {
    const currentField = clientCustomColumns.find((field) => field.id === fieldId)
    if (!currentField) return
    handleClientCustomColumnFieldChange(
      fieldId,
      'optionsInput',
      (currentField.options || []).filter((option) => option !== optionToRemove).join(', ')
    )
  }

  const handleCreateClientImplementationPhase = () => {
    if (!canManageClients) return
    const trimmedLabel = newClientPhaseLabel.trim()
    if (!trimmedLabel) return

    const nextPhases = [
      ...clientImplementationPhases,
      createClientImplementationPhaseRecord({
        label: trimmedLabel,
        description: newClientPhaseDescription.trim(),
        objective: newClientPhaseObjective.trim(),
        checklist: normalizePhaseChecklistInput(newClientPhaseChecklist),
        slaDays: Number.isFinite(Number(newClientPhaseSlaDays)) ? Number(newClientPhaseSlaDays) : 0,
      }),
    ]
    const nextSystemFields = syncImplementationPhaseSystemFieldOptions(clientSystemFields, nextPhases)

    setClientImplementationPhases(nextPhases)
    setClientSystemFields(nextSystemFields)
    void persistClientStructure(nextPhases, nextSystemFields, clientCustomColumns, clientCustomTabs)
    setNewClientPhaseLabel('')
    setNewClientPhaseDescription('')
    setNewClientPhaseObjective('')
    setNewClientPhaseChecklist('')
    setNewClientPhaseSlaDays('')
    setSettingsSaveFeedback('Etapa da jornada salva em Configurações e sincronizada com a base.')
  }

  const handleClientImplementationPhaseChange = (
    phaseId: string,
    fieldName: keyof ClientImplementationPhaseRecord,
    value: string | string[]
  ) => {
    if (!canManageClients) return
    const currentPhase = clientImplementationPhases.find((phase) => phase.id === phaseId)
    if (!currentPhase) return

    const nextPhases = clientImplementationPhases.map((phase) =>
      phase.id === phaseId ? createClientImplementationPhaseRecord({ ...phase, [fieldName]: value }) : phase
    )
    const nextSystemFields = syncImplementationPhaseSystemFieldOptions(clientSystemFields, nextPhases)
    const nextPhase = nextPhases.find((phase) => phase.id === phaseId)
    const nextClients =
      fieldName === 'label' && currentPhase.label !== String(nextPhase?.label || '').trim()
        ? serverClients.map((client) =>
            String(client.implementationPhase || '').trim() === currentPhase.label
              ? {
                  ...client,
                  implementationPhase: String(nextPhase?.label || '').trim(),
                }
              : client
          )
        : serverClients

    setClientImplementationPhases(nextPhases)
    setClientSystemFields(nextSystemFields)
    void persistClientStructure(nextPhases, nextSystemFields, clientCustomColumns, clientCustomTabs, nextClients)
  }

  const handleRemoveClientImplementationPhase = (phaseId: string) => {
    if (!canManageClients) return

    const phase = clientImplementationPhases.find((item) => item.id === phaseId)
    if (!phase) return

    const usageCount = serverClients.filter((client) => String(client.implementationPhase || '').trim() === phase.label).length
    if (usageCount > 0) {
      const confirmed = window.confirm(
        `A fase "${phase.label}" está em uso por ${usageCount} cliente(s). Deseja excluir mesmo assim?`
      )
      if (!confirmed) return
    }

    const nextPhases = clientImplementationPhases.filter((item) => item.id !== phaseId)
    const nextSystemFields = syncImplementationPhaseSystemFieldOptions(clientSystemFields, nextPhases)
    const nextClients = serverClients.map((client) =>
      String(client.implementationPhase || '').trim() === phase.label
        ? {
            ...client,
            implementationPhase: '',
          }
        : client
    )
    setClientImplementationPhases(nextPhases)
    setClientSystemFields(nextSystemFields)
    void persistClientStructure(nextPhases, nextSystemFields, clientCustomColumns, clientCustomTabs, nextClients)
    setSettingsSaveFeedback('Etapa da jornada removida da configuração dos clientes.')
  }

  const handleSaveCurrentSettings = async () => {
    setSettingsSaveFeedback('')
    const feedbackMessages: string[] = []

    if (hasPendingPanelChanges) {
      updateAppearance(panelDraft)
      setPanelFeedback('Preferências visuais salvas e aplicadas neste navegador.')
      feedbackMessages.push('Preferências visuais salvas e aplicadas neste navegador.')
    }

    if (canManageClients) {
      try {
        await persistGlobalIntegrations(globalIntegrations)
        await persistOperationSettings(operationSettings)
        feedbackMessages.push('Configurações da operação sincronizadas com sucesso.')
      } catch (error) {
        setSettingsSaveFeedback(
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar as configurações da operação.'
        )
        return
      }
    }

    if (feedbackMessages.length) {
      setSettingsSaveFeedback(feedbackMessages.join(' '))
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
    <div className="dashboard-container settings-page-shell dashboard-shell-stellar">
      <aside className="sidebar glass-panel">
        <div className="logo">
          <i className="bx bx-bar-chart-alt-2"></i>
          <div className="logo-copy">
            <span>Nype OS</span>
            <small>Control center</small>
          </div>
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
        <div className="settings-workspace">
          <aside className="glass-item settings-section-sidebar">
            <div className="settings-sidebar-title">
              <span>Configuração</span>
              <strong>Ajustes da operação</strong>
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
                  <span>Destaque, fundo e assinatura visual do sistema.</span>
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
                    className={`settings-sidebar-link ${activeSettingsTab === 'clients' ? 'active' : ''}`}
                    onClick={() => handleSettingsTabChange('clients')}
                  >
                    <i className="bx bx-data"></i>
                    <div>
                      <strong>Clientes</strong>
                      <span>Campos e abas da base de clientes.</span>
                    </div>
                  </button>
                </>
              )}
            </div>

            <div className="settings-sidebar-summary glass-item">
              <span className="settings-sidebar-summary-kicker">Nesta aba</span>
              <strong>{settingsSidebarHighlights.title}</strong>
              <p>{settingsSidebarHighlights.description}</p>
              <div className="settings-sidebar-summary-list">
                {settingsSidebarHighlights.items.map((item) => (
                  <span key={`${activeSettingsTab}-${item}`} className="settings-sidebar-summary-item">
                    <i className="bx bx-check-circle"></i>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </aside>

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
          <div className="settings-section-content">
              {activeSettingsTab === 'panel' && (
                <div className="settings-panel-layout settings-panel-layout-obsidian">
                  <div className="glass-item settings-block settings-block-full settings-block-hero">
                    <div className="settings-section-head">
                      <div>
                        <span className="settings-hero-kicker">Configuração visual</span>
                        <h2>Interface do sistema</h2>
                        <p>Personalize o app dentro da linguagem Digital Obsidian, com foco em contraste, profundidade e leitura executiva.</p>
                        <small>A troca entre modo claro e escuro agora fica no topo do app.</small>
                      </div>
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
                      <p>Defina aqui as credenciais, colunas do kanban, status e templates de subtarefas da operação.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Kanban</span>
                        <h3>Colunas, status e automações de criação</h3>
                        <p>Controle quais etapas existem no board, as cores visuais e quais subtarefas padrão entram quando um card nasce em cada coluna.</p>
                      </div>

                      <div className="settings-category-grid">
                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#3b82f6', borderColor: '#3b82f633' }}>
                              <i className="bx bx-columns"></i>
                            </div>
                            <div>
                              <h3>Colunas do kanban</h3>
                              <p>Ao criar um card em uma etapa, as subtarefas abaixo entram automaticamente.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {operationSettings.lanes.map((lane) => (
                              <details key={lane.id} className="glass-item settings-stack-card settings-accordion-card" open>
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{lane.label}</strong>
                                    <span>{(lane.defaultSubtasks || []).length} subtarefa(s) padrão</span>
                                  </div>
                                  <small>{lane.key}</small>
                                </summary>
                                <div className="settings-form-grid">
                                  <div className="input-group">
                                    <label>Nome da coluna</label>
                                    <input type="text" value={lane.label} onChange={(event) => handleOperationLaneFieldChange(lane.id, 'label', event.target.value)} />
                                  </div>
                                  <div className="input-group">
                                    <label>Cor</label>
                                    <input type="color" value={lane.color || '#3b82f6'} onChange={(event) => handleOperationLaneFieldChange(lane.id, 'color', event.target.value)} />
                                  </div>
                                  <div className="input-group settings-field-span-2">
                                    <label>Subtarefas padrão</label>
                                    <input
                                      type="text"
                                      value={(lane.defaultSubtasks || []).join(', ')}
                                      onChange={(event) => handleOperationLaneFieldChange(lane.id, 'defaultSubtasks', event.target.value)}
                                      placeholder="Separe por vírgula"
                                    />
                                    <small>Essas subtarefas entram ao criar um card nessa coluna, inclusive a partir do cadastro de cliente.</small>
                                  </div>
                                </div>
                                <div className="modal-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRemoveOperationLane(lane.id)}>
                                    Remover coluna
                                  </button>
                                </div>
                              </details>
                            ))}
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Nova coluna</label>
                              <input type="text" value={newOperationLaneLabel} onChange={(event) => setNewOperationLaneLabel(event.target.value)} placeholder="Ex.: Produção, Aprovação, QA" />
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateOperationLane}>
                              Adicionar coluna
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#10b981', borderColor: '#10b98133' }}>
                              <i className="bx bx-palette"></i>
                            </div>
                            <div>
                              <h3>Status dos cards</h3>
                              <p>Edite os rótulos e as cores dos status que aparecem nos cards e subtarefas.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {operationSettings.statuses.map((status) => (
                              <details key={status.id} className="glass-item settings-stack-card settings-accordion-card" open>
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{status.label}</strong>
                                    <span>{status.key}</span>
                                  </div>
                                  <small>{status.color}</small>
                                </summary>
                                <div className="settings-form-grid">
                                  <div className="input-group">
                                    <label>Nome do status</label>
                                    <input type="text" value={status.label} onChange={(event) => handleOperationStatusFieldChange(status.id, 'label', event.target.value)} />
                                  </div>
                                  <div className="input-group">
                                    <label>Cor</label>
                                    <input type="color" value={status.color || '#3b82f6'} onChange={(event) => handleOperationStatusFieldChange(status.id, 'color', event.target.value)} />
                                  </div>
                                </div>
                                <div className="modal-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRemoveOperationStatus(status.id)}>
                                    Remover status
                                  </button>
                                </div>
                              </details>
                            ))}
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Novo status</label>
                              <input type="text" value={newOperationStatusLabel} onChange={(event) => setNewOperationStatusLabel(event.target.value)} placeholder="Ex.: Em revisão, Aguardando cliente" />
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateOperationStatus}>
                              Adicionar status
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#f59e0b', borderColor: '#f59e0b33' }}>
                              <i className="bx bx-purchase-tag-alt"></i>
                            </div>
                            <div>
                              <h3>Tags dos cards</h3>
                              <p>Cadastre as tags disponíveis para seleção nos cards operacionais.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {(operationSettings.tags || []).length ? (
                              operationSettings.tags.map((tag) => (
                                <div key={`operation-tag-${tag}`} className="glass-item settings-stack-card">
                                  <div className="settings-accordion-summary">
                                    <div>
                                      <strong>{tag}</strong>
                                      <span>Tag disponível no seletor</span>
                                    </div>
                                  </div>
                                  <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => handleRemoveOperationTag(tag)}>
                                      Remover tag
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="glass-item settings-stack-card">
                                <span>Nenhuma tag cadastrada ainda.</span>
                              </div>
                            )}
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Nova tag</label>
                              <input type="text" value={newOperationTagLabel} onChange={(event) => setNewOperationTagLabel(event.target.value)} placeholder="Ex.: Urgente, Cliente, Aprovação" />
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateOperationTag}>
                              Adicionar tag
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#8b5cf6', borderColor: '#8b5cf633' }}>
                              <i className="bx bx-category-alt"></i>
                            </div>
                            <div>
                              <h3>Tipos de tarefa</h3>
                              <p>Cadastre os tipos que vão aparecer no topo e no seletor dos cards operacionais.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {(operationSettings.taskTypes || []).length ? (
                              operationSettings.taskTypes.map((taskType) => (
                                <div key={`operation-task-type-${taskType}`} className="glass-item settings-stack-card">
                                  <div className="settings-accordion-summary">
                                    <div>
                                      <strong>{taskType}</strong>
                                      <span>Tipo disponível no card</span>
                                    </div>
                                  </div>
                                  <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => handleRemoveOperationTaskType(taskType)}>
                                      Remover tipo
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : null}
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Novo tipo</label>
                              <input type="text" value={newOperationTaskTypeLabel} onChange={(event) => setNewOperationTaskTypeLabel(event.target.value)} placeholder="Ex.: Bug, Ajuste, Entrega, Aprovação" />
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateOperationTaskType}>
                              Adicionar tipo
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#38bdf8', borderColor: '#38bdf833' }}>
                              <i className="bx bx-list-plus"></i>
                            </div>
                            <div>
                              <h3>Campos customizados do card</h3>
                              <p>Crie campos extras para aparecer dentro do card operacional, no estilo ClickUp.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {(operationSettings.customFields || []).length ? (
                              operationSettings.customFields.map((field) => (
                                <details key={field.id} className="glass-item settings-stack-card settings-accordion-card" open>
                                  <summary className="settings-accordion-summary">
                                    <div>
                                      <strong>{field.label}</strong>
                                      <span>{field.type}</span>
                                    </div>
                                    <small>{field.key}</small>
                                  </summary>
                                  <div className="settings-form-grid">
                                    <div className="input-group">
                                      <label>Nome do campo</label>
                                      <input type="text" value={field.label} onChange={(event) => handleOperationCustomFieldChange(field.id, 'label', event.target.value)} />
                                    </div>
                                    <div className="input-group">
                                      <label>Tipo</label>
                                      <select value={field.type} onChange={(event) => handleOperationCustomFieldChange(field.id, 'type', event.target.value)}>
                                        <option value="text">Texto</option>
                                        <option value="select">Dropdown</option>
                                        <option value="date">Data</option>
                                        <option value="number">Número</option>
                                      </select>
                                    </div>
                                    <div className="input-group settings-field-span-2">
                                      <label>Opções</label>
                                      <input
                                        type="text"
                                        value={(field.options || []).join(', ')}
                                        onChange={(event) => handleOperationCustomFieldChange(field.id, 'options', event.target.value)}
                                        placeholder="Separe por vírgula"
                                        disabled={field.type !== 'select'}
                                      />
                                    </div>
                                  </div>
                                  <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => handleRemoveOperationCustomField(field.id)}>
                                      Remover campo
                                    </button>
                                  </div>
                                </details>
                              ))
                            ) : (
                              <div className="glass-item settings-stack-card">
                                <span>Nenhum campo customizado criado ainda.</span>
                              </div>
                            )}
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Novo campo</label>
                              <input type="text" value={newOperationCustomFieldLabel} onChange={(event) => setNewOperationCustomFieldLabel(event.target.value)} placeholder="Ex.: Data da reunião, Canal, Story points" />
                            </div>
                            <div className="input-group">
                              <label>Tipo</label>
                              <select value={newOperationCustomFieldType} onChange={(event) => setNewOperationCustomFieldType(event.target.value as OperationCustomFieldRecord['type'])}>
                                <option value="text">Texto</option>
                                <option value="select">Dropdown</option>
                                <option value="date">Data</option>
                                <option value="number">Número</option>
                              </select>
                            </div>
                            <div className="input-group settings-field-span-2">
                              <label>Opções</label>
                              <input
                                type="text"
                                value={newOperationCustomFieldOptions}
                                onChange={(event) => setNewOperationCustomFieldOptions(event.target.value)}
                                placeholder="Separe por vírgula"
                                disabled={newOperationCustomFieldType !== 'select'}
                              />
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateOperationCustomField}>
                              Adicionar campo
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#f59e0b', borderColor: '#f59e0b33' }}>
                              <i className="bx bx-bolt-circle"></i>
                            </div>
                            <div>
                              <h3>Criação automática</h3>
                              <p>Defina o comportamento padrão ao cadastrar um novo cliente.</p>
                            </div>
                          </div>

                          <label className={`stage-chip ${operationSettings.autoCreateCardForNewClient ? 'active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={operationSettings.autoCreateCardForNewClient}
                              onChange={(event) => {
                                const nextSettings = {
                                  ...operationSettings,
                                  autoCreateCardForNewClient: event.target.checked,
                                }
                                setOperationSettings(nextSettings)
                                void persistOperationSettings(nextSettings)
                              }}
                            />
                            <span>Criar card na operação por padrão ao cadastrar cliente</span>
                          </label>
                        </div>
                      </div>
                    </section>

                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Integrações</span>
                        <h3>Credenciais operacionais globais</h3>
                        <p>Essa área continua centralizando ClickUp e Monday no nível da operação.</p>
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
                    </section>
                  </div>
                </div>
              )}

              {canManageClients && activeSettingsTab === 'clients' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>Estrutura da base de clientes</h2>
                      <p>Edite aqui os campos e as abas que organizam o cadastro dos clientes. Tudo salva direto no Supabase.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Campos</span>
                        <h3>Crie e edite a biblioteca de campos</h3>
                        <p>Defina o tipo, a aba e as opções dos campos customizados da operação.</p>
                      </div>

                      <div className="settings-category-grid">
                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#3b82f6', borderColor: '#3b82f633' }}>
                              <i className="bx bx-list-plus"></i>
                            </div>
                            <div>
                              <h3>Novo campo</h3>
                              <p>Monte campos no estilo ClickUp e escolha em qual aba eles aparecem.</p>
                            </div>
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Nome do campo</label>
                              <input type="text" value={newClientColumnLabel} onChange={(event) => setNewClientColumnLabel(event.target.value)} placeholder="Ex.: SLA, Categoria, Ticket" />
                            </div>
                            <div className="input-group">
                              <label>Tipo</label>
                              <select value={newClientColumnType} onChange={(event) => setNewClientColumnType(event.target.value as ClientCustomColumnRecord['type'])}>
                                {CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="input-group">
                              <label>Aba</label>
                              <select value={newClientColumnTab} onChange={(event) => setNewClientColumnTab(event.target.value)}>
                                {clientFieldTabOptions.map((tab) => (
                                  <option key={tab.key} value={tab.key}>{tab.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="input-group">
                              <label>Opções do dropdown</label>
                              <div className="settings-inline-action">
                                <input
                                  type="text"
                                  value={newClientColumnOptionDraft}
                                  onChange={(event) => setNewClientColumnOptionDraft(event.target.value)}
                                  placeholder="Adicionar opção"
                                  disabled={newClientColumnType !== 'select'}
                                />
                                <button type="button" className="settings-inline-confirm" onClick={handleAddNewClientColumnOption} disabled={newClientColumnType !== 'select'}>
                                  <i className="bx bx-check"></i>
                                </button>
                                <button
                                  type="button"
                                  className="settings-inline-confirm settings-inline-remove"
                                  onClick={() => setNewClientColumnOptionDraft('')}
                                  disabled={newClientColumnType !== 'select' || !newClientColumnOptionDraft}
                                >
                                  <i className="bx bx-x"></i>
                                </button>
                              </div>
                              {Boolean(normalizeSelectOptionsInput(newClientColumnOptions).length) && (
                                <div className="settings-option-chips">
                                  {normalizeSelectOptionsInput(newClientColumnOptions).map((option) => (
                                    <button
                                      key={`new-option-${option}`}
                                      type="button"
                                      className="stage-chip active settings-chip-button"
                                      onClick={() => handleRemoveNewClientColumnOption(option)}
                                    >
                                      <span>{option}</span>
                                      <i className="bx bx-x"></i>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="input-group settings-field-span-2">
                              <label>Fórmula</label>
                              <input
                                type="text"
                                value={newClientColumnFormula}
                                onChange={(event) => setNewClientColumnFormula(event.target.value)}
                                placeholder="Ex.: ({fee} * 12) / {mediaInvestment}"
                                disabled={newClientColumnType !== 'formula'}
                              />
                            </div>
                          </div>

                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateClientCustomColumn}>
                              Criar campo
                            </button>
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#8b5cf6', borderColor: '#8b5cf633' }}>
                              <i className="bx bx-folder-open"></i>
                            </div>
                            <div>
                              <h3>Nova aba</h3>
                              <p>Crie novas abas para organizar a base de clientes da forma que fizer sentido para a operação.</p>
                            </div>
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Nome da aba</label>
                              <input type="text" value={newClientTabLabel} onChange={(event) => setNewClientTabLabel(event.target.value)} placeholder="Ex.: Comercial, CS, Financeiro" />
                            </div>
                          </div>

                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateClientCustomTab}>
                              Criar aba
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="settings-category-shell">
                      <div className="settings-category-head">
                        <span className="settings-category-kicker">Editor</span>
                        <h3>Campos e abas atuais</h3>
                        <p>Renomeie, troque o tipo, mova entre abas e ajuste as relações visuais por aqui.</p>
                      </div>

                      <div className="settings-category-grid">
                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#60a5fa', borderColor: '#60a5fa33' }}>
                              <i className="bx bx-git-branch"></i>
                            </div>
                            <div>
                              <h3>Etapas da jornada do cliente</h3>
                              <p>Cadastre as etapas que podem ser escolhidas no cliente e descreva objetivo, checklist e prazo esperado de cada uma.</p>
                            </div>
                          </div>

                          <div className="settings-form-grid">
                            <div className="input-group">
                              <label>Nome da etapa</label>
                              <input type="text" value={newClientPhaseLabel} onChange={(event) => setNewClientPhaseLabel(event.target.value)} placeholder="Ex.: Kickoff, Implantação, Go Live" />
                            </div>
                            <div className="input-group settings-field-span-2">
                              <label>Descrição</label>
                              <textarea
                                value={newClientPhaseDescription}
                                onChange={(event) => setNewClientPhaseDescription(event.target.value)}
                                placeholder="Explique rapidamente o que essa fase representa e o que precisa acontecer nela."
                                rows={3}
                              />
                            </div>
                            <div className="input-group settings-field-span-2">
                              <label>Objetivo da etapa</label>
                              <textarea
                                value={newClientPhaseObjective}
                                onChange={(event) => setNewClientPhaseObjective(event.target.value)}
                                placeholder="Explique o resultado esperado dessa etapa dentro da jornada do cliente."
                                rows={3}
                              />
                            </div>
                            <div className="input-group settings-field-span-2">
                              <label>Checklist base</label>
                              <textarea
                                value={newClientPhaseChecklist}
                                onChange={(event) => setNewClientPhaseChecklist(event.target.value)}
                                placeholder="Separe os itens por vírgula ou por linha. Ex.: Kickoff alinhado, acessos recebidos, metas definidas"
                                rows={3}
                              />
                            </div>
                            <div className="input-group">
                              <label>SLA esperado (dias)</label>
                              <input
                                type="number"
                                min="0"
                                value={newClientPhaseSlaDays}
                                onChange={(event) => setNewClientPhaseSlaDays(event.target.value)}
                                placeholder="Ex.: 15"
                              />
                            </div>
                          </div>

                          <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={handleCreateClientImplementationPhase}>
                              Criar etapa
                            </button>
                          </div>

                          <div className="settings-stack-list">
                            {clientImplementationPhases.map((phase) => (
                              <details key={phase.id} className="glass-item settings-stack-card settings-accordion-card" open>
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{phase.label}</strong>
                                    <span>{phase.description || phase.objective || 'Sem resumo ainda.'}</span>
                                  </div>
                                  <small>Etapa da jornada</small>
                                </summary>
                                <div className="settings-form-grid">
                                  <div className="input-group">
                                    <label>Nome da etapa</label>
                                    <input
                                      type="text"
                                      value={phase.label}
                                      onChange={(event) => handleClientImplementationPhaseChange(phase.id, 'label', event.target.value)}
                                    />
                                  </div>
                                  <div className="input-group settings-field-span-2">
                                    <label>Descrição</label>
                                    <textarea
                                      value={phase.description || ''}
                                      onChange={(event) => handleClientImplementationPhaseChange(phase.id, 'description', event.target.value)}
                                      rows={3}
                                      placeholder="Explique o contexto e o objetivo dessa fase."
                                    />
                                  </div>
                                  <div className="input-group settings-field-span-2">
                                    <label>Objetivo da etapa</label>
                                    <textarea
                                      value={phase.objective || ''}
                                      onChange={(event) => handleClientImplementationPhaseChange(phase.id, 'objective', event.target.value)}
                                      rows={3}
                                      placeholder="Descreva o que precisa ser alcançado antes de mover o cliente para a próxima etapa."
                                    />
                                  </div>
                                  <div className="input-group settings-field-span-2">
                                    <label>Checklist base</label>
                                    <textarea
                                      value={(phase.checklist || []).join('\n')}
                                      onChange={(event) => handleClientImplementationPhaseChange(phase.id, 'checklist', normalizePhaseChecklistInput(event.target.value))}
                                      rows={4}
                                      placeholder="Um item por linha ou separado por vírgula."
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label>SLA esperado (dias)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={String(phase.slaDays || '')}
                                      onChange={(event) => handleClientImplementationPhaseChange(phase.id, 'slaDays', event.target.value)}
                                      placeholder="Ex.: 15"
                                    />
                                  </div>
                                </div>
                                {!!(phase.checklist || []).length && (
                                  <div className="settings-option-chips">
                                    {(phase.checklist || []).map((item) => (
                                      <span key={`${phase.id}-${item}`} className="stage-chip active">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="modal-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClientImplementationPhase(phase.id)}>
                                    Excluir etapa
                                  </button>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#38bdf8', borderColor: '#38bdf833' }}>
                              <i className="bx bx-layer"></i>
                            </div>
                            <div>
                              <h3>Campos padrão da base</h3>
                              <p>Veja e ajuste os campos que já existem hoje no cadastro dos clientes.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {clientSystemFields.map((field) => (
                              <details key={field.key} className="glass-item settings-stack-card settings-accordion-card">
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{field.label}</strong>
                                    <span>{DEFAULT_CLIENT_FIELD_TABS.find((tab) => tab.key === field.tabKey)?.label || field.tabKey}</span>
                                  </div>
                                  <small>{CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS.find((option) => option.value === field.type)?.label || field.type}</small>
                                </summary>
                                <div className="settings-option-chips settings-impact-row">
                                  <span className="stage-chip active">
                                    <span>{`${clientFieldImpact[field.key]?.filledClientsCount || 0} cliente(s) com dado`}</span>
                                  </span>
                                  <span className="stage-chip">
                                    <span>{`${clientFieldImpact[field.key]?.linkedTabsCount || 0} aba(s)`}</span>
                                  </span>
                                  {!!clientFieldImpact[field.key]?.dependentFormulaCount && (
                                    <span className="stage-chip">
                                      <span>{`${clientFieldImpact[field.key]?.dependentFormulaCount} fórmula(s)`}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="settings-form-grid">
                                  <div className="input-group">
                                    <label>Nome</label>
                                    <input type="text" value={field.label} onChange={(event) => handleClientSystemFieldChange(field.key, 'label', event.target.value)} />
                                  </div>
                                  <div className="input-group">
                                    <label>Tipo</label>
                                    <select value={field.type} onChange={(event) => handleClientSystemFieldChange(field.key, 'type', event.target.value)}>
                                      {CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS.map((option) => (
                                        <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="input-group">
                                    <label>Aba</label>
                                    <select value={field.tabKey || 'geral'} onChange={(event) => handleClientSystemFieldChange(field.key, 'tabKey', event.target.value)}>
                                      {clientFieldTabOptions.map((tab) => (
                                        <option key={`${field.key}-${tab.key}`} value={tab.key}>{tab.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {field.type === 'select' && (
                                    <div className="input-group">
                                      <label>Opções</label>
                                      {field.key === 'implementationPhase' ? (
                                        <p className="settings-helper-copy">
                                          Essas opções são controladas pelo bloco <strong>Etapas da jornada do cliente</strong> acima.
                                        </p>
                                      ) : (
                                        <div className="settings-inline-action">
                                          <input
                                            type="text"
                                            value={systemFieldOptionDrafts[field.key] || ''}
                                            onChange={(event) => setSystemFieldOptionDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                                            placeholder="Adicionar opção"
                                          />
                                          <button type="button" className="settings-inline-confirm" onClick={() => handleAddSystemFieldOption(field.key)}>
                                            <i className="bx bx-check"></i>
                                          </button>
                                          <button
                                            type="button"
                                            className="settings-inline-confirm settings-inline-remove"
                                            onClick={() => setSystemFieldOptionDrafts((current) => ({ ...current, [field.key]: '' }))}
                                            disabled={!systemFieldOptionDrafts[field.key]}
                                          >
                                            <i className="bx bx-x"></i>
                                          </button>
                                        </div>
                                      )}
                                      {Boolean((field.options || []).length) && (
                                        <div className="settings-option-chips">
                                          {(field.options || []).map((option) => (
                                            <button
                                              key={`${field.key}-${option}`}
                                              type="button"
                                              className="stage-chip active settings-chip-button"
                                              onClick={() => handleRemoveSystemFieldOption(field.key, option)}
                                              disabled={field.key === 'implementationPhase'}
                                            >
                                              <span>{option}</span>
                                              {field.key !== 'implementationPhase' && <i className="bx bx-x"></i>}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="input-group settings-field-span-2">
                                    <label>Fórmula</label>
                                    <input
                                      type="text"
                                      value={field.formulaExpression || ''}
                                      onChange={(event) => handleClientSystemFieldChange(field.key, 'formulaExpression', event.target.value)}
                                      placeholder="Ex.: ({fee} + {monthlyRevenue}) / 2"
                                      disabled={field.type !== 'formula'}
                                    />
                                  </div>
                                  {getDynamicFieldSettings(field.type).map((setting) => (
                                    <div key={`${field.key}-${setting.key}`} className="input-group">
                                      <label>{setting.label}</label>
                                      <input
                                        type="text"
                                        value={field.settings?.[setting.key] || ''}
                                        onChange={(event) => handleClientSystemFieldChange(field.key, 'setting', event.target.value, setting.key)}
                                        placeholder={setting.placeholder}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#10b981', borderColor: '#10b98133' }}>
                              <i className="bx bx-table"></i>
                            </div>
                            <div>
                              <h3>Campos customizados</h3>
                              <p>Todos os campos extras da base ficam centralizados aqui.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {clientCustomColumns.map((column) => (
                              <details key={column.id} className="glass-item settings-stack-card settings-accordion-card">
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{column.label}</strong>
                                    <span>{clientFieldTabOptions.find((tab) => tab.key === column.tabKey)?.label || column.tabKey}</span>
                                  </div>
                                  <small>{CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS.find((option) => option.value === column.type)?.label || column.type}</small>
                                </summary>
                                <div className="settings-option-chips settings-impact-row">
                                  <span className="stage-chip active">
                                    <span>{`${clientFieldImpact[column.key]?.filledClientsCount || 0} cliente(s) com dado`}</span>
                                  </span>
                                  <span className="stage-chip">
                                    <span>{`${clientFieldImpact[column.key]?.linkedTabsCount || 0} aba(s)`}</span>
                                  </span>
                                  {!!clientFieldImpact[column.key]?.dependentFormulaCount && (
                                    <span className="stage-chip">
                                      <span>{`${clientFieldImpact[column.key]?.dependentFormulaCount} fórmula(s)`}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="settings-form-grid">
                                  <div className="input-group">
                                    <label>Nome</label>
                                    <input type="text" value={column.label} onChange={(event) => handleClientCustomColumnFieldChange(column.id, 'label', event.target.value)} />
                                  </div>
                                  <div className="input-group">
                                    <label>Tipo</label>
                                    <select value={column.type} onChange={(event) => handleClientCustomColumnFieldChange(column.id, 'type', event.target.value)}>
                                      {CLIENT_CUSTOM_COLUMN_TYPE_OPTIONS.map((option) => (
                                        <option key={`${column.id}-${option.value}`} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="input-group">
                                    <label>Aba</label>
                                    <select value={column.tabKey || 'geral'} onChange={(event) => handleClientCustomColumnFieldChange(column.id, 'tabKey', event.target.value)}>
                                      {clientFieldTabOptions.map((tab) => (
                                        <option key={`${column.id}-${tab.key}`} value={tab.key}>{tab.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="input-group">
                                    <label>Opções</label>
                                    <div className="settings-inline-action">
                                      <input
                                        type="text"
                                        value={customFieldOptionDrafts[column.id] || ''}
                                        onChange={(event) => setCustomFieldOptionDrafts((current) => ({ ...current, [column.id]: event.target.value }))}
                                        placeholder="Adicionar opção"
                                        disabled={column.type !== 'select'}
                                      />
                                      <button type="button" className="settings-inline-confirm" onClick={() => handleAddCustomFieldOption(column.id)} disabled={column.type !== 'select'}>
                                        <i className="bx bx-check"></i>
                                      </button>
                                      <button
                                        type="button"
                                        className="settings-inline-confirm settings-inline-remove"
                                        onClick={() => setCustomFieldOptionDrafts((current) => ({ ...current, [column.id]: '' }))}
                                        disabled={column.type !== 'select' || !customFieldOptionDrafts[column.id]}
                                      >
                                        <i className="bx bx-x"></i>
                                      </button>
                                    </div>
                                    {Boolean((column.options || []).length) && (
                                      <div className="settings-option-chips">
                                        {(column.options || []).map((option) => (
                                          <button
                                            key={`${column.id}-${option}`}
                                            type="button"
                                            className="stage-chip active settings-chip-button"
                                            onClick={() => handleRemoveCustomFieldOption(column.id, option)}
                                          >
                                            <span>{option}</span>
                                            <i className="bx bx-x"></i>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="input-group settings-field-span-2">
                                    <label>Fórmula</label>
                                    <input
                                      type="text"
                                      value={column.formulaExpression || ''}
                                      onChange={(event) => handleClientCustomColumnFieldChange(column.id, 'formulaExpression', event.target.value)}
                                      placeholder="Ex.: ({fee} + {monthlyRevenue}) / 2"
                                      disabled={column.type !== 'formula'}
                                    />
                                  </div>
                                  {getDynamicFieldSettings(column.type).map((setting) => (
                                    <div key={`${column.id}-${setting.key}`} className="input-group">
                                      <label>{setting.label}</label>
                                      <input
                                        type="text"
                                        value={column.settings?.[setting.key] || ''}
                                        onChange={(event) => handleClientCustomColumnFieldChange(column.id, 'setting', event.target.value, setting.key)}
                                        placeholder={setting.placeholder}
                                      />
                                    </div>
                                  ))}
                                </div>

                                <div className="modal-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClientCustomColumn(column.key)}>
                                    Excluir campo
                                  </button>
                                </div>
                              </details>
                            ))}
                            {!clientCustomColumns.length && <p className="settings-empty-note">Nenhum campo customizado criado ainda.</p>}
                          </div>
                        </div>

                        <div className="integration-block">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: '#f59e0b', borderColor: '#f59e0b33' }}>
                              <i className="bx bx-columns"></i>
                            </div>
                            <div>
                              <h3>Abas customizadas</h3>
                              <p>Administre o nome das abas e quais campos entram em cada uma.</p>
                            </div>
                          </div>

                          <div className="settings-stack-list">
                            {clientCustomTabs.map((tab) => (
                              <details key={tab.id} className="glass-item settings-stack-card settings-accordion-card" open>
                                <summary className="settings-accordion-summary">
                                  <div>
                                    <strong>{tab.label}</strong>
                                    <span>{(tab.columnKeys || []).length} campo(s) vinculados</span>
                                  </div>
                                  <small>Aba customizada</small>
                                </summary>
                                <div className="settings-option-chips settings-impact-row">
                                  <span className="stage-chip active">
                                    <span>{`${clientTabImpact[tab.key]?.clientsWithDataCount || 0} cliente(s) com dados`}</span>
                                  </span>
                                  <span className="stage-chip">
                                    <span>{`${clientTabImpact[tab.key]?.fieldCount || 0} campo(s)`}</span>
                                  </span>
                                </div>

                                <div className="input-group">
                                  <label>Nome da aba</label>
                                  <input type="text" value={tab.label} onChange={(event) => handleClientCustomTabFieldChange(tab.id, event.target.value)} />
                                </div>

                                <div className="input-group">
                                  <label>Campos nesta aba</label>
                                  <div className="settings-option-chips">
                                    {(tab.columnKeys || []).length ? (
                                      (tab.columnKeys || []).map((columnKey) => {
                                        const field = allClientFieldLibrary.find((item) => item.key === columnKey)
                                        if (!field) return null

                                        return (
                                          <button
                                            key={`${tab.id}-selected-${columnKey}`}
                                            type="button"
                                            className="stage-chip active settings-chip-button"
                                            onClick={() => handleClientCustomTabColumnToggle(tab.id, columnKey)}
                                          >
                                            <span>{field.label}</span>
                                            <i className="bx bx-x"></i>
                                          </button>
                                        )
                                      })
                                    ) : (
                                      <p className="settings-empty-note">Nenhum campo vinculado ainda.</p>
                                    )}
                                  </div>
                                </div>

                                <div className="input-group">
                                  <label>Adicionar ou remover rapidamente</label>
                                  <div className="settings-option-chips">
                                    {allClientFieldLibrary.map((field) => {
                                      const checked = (tab.columnKeys || []).includes(field.key)
                                      return (
                                        <button
                                          key={`${tab.id}-${field.key}`}
                                          type="button"
                                          className={`stage-chip ${checked ? 'active' : ''} settings-chip-button`}
                                          onClick={() => handleClientCustomTabColumnToggle(tab.id, field.key)}
                                        >
                                          <span>{field.label}</span>
                                          <small>{field.source === 'system' ? 'Base' : 'Custom'}</small>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>

                                <div className="modal-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRemoveClientCustomTab(tab.id)}>
                                    Excluir aba
                                  </button>
                                </div>
                              </details>
                            ))}
                            {!clientCustomTabs.length && <p className="settings-empty-note">Nenhuma aba customizada criada ainda.</p>}
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
          </section>
        </div>
      </main>

      <style jsx>{`
        .settings-main {
          width: 100%;
          padding-left: 0 !important;
          margin-left: calc(var(--sidebar-width) + 28px) !important;
          padding-top: 14px;
        }

        .settings-workspace {
          width: 100%;
          display: grid;
          grid-template-columns: minmax(210px, 236px) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .settings-panel {
          padding: 30px;
          display: grid;
          gap: 28px;
          background:
            radial-gradient(circle at 100% 0%, rgba(78, 137, 255, 0.1), transparent 26%),
            radial-gradient(circle at 0% 100%, rgba(84, 121, 255, 0.08), transparent 24%),
            rgba(8, 15, 30, 0.74);
          border: 1px solid rgba(123, 148, 199, 0.14);
          border-radius: 28px;
        }

        .settings-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 10px 4px 2px;
          border-bottom: 1px solid rgba(123, 148, 199, 0.1);
        }

        .settings-head h1 {
          font-size: 48px;
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

        .settings-section-head small {
          display: inline-flex;
          margin-top: 8px;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.5;
        }

        .settings-section-sidebar {
          padding: 16px;
          display: grid;
          gap: 12px;
          position: sticky;
          top: 24px;
          align-self: start;
          justify-self: start;
          width: 100%;
          max-height: fit-content;
          overflow: visible;
          background:
            radial-gradient(circle at top left, rgba(78, 137, 255, 0.08), transparent 32%),
            rgba(10, 18, 33, 0.72);
          border: 1px solid rgba(123, 148, 199, 0.12);
          border-radius: 24px;
          box-shadow: 0 20px 44px rgba(0, 0, 0, 0.2);
        }

        .settings-sidebar-title {
          display: grid;
          gap: 4px;
        }

        .settings-sidebar-title span {
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .settings-sidebar-title strong {
          max-width: 16ch;
          font-size: 16px;
          line-height: 1.1;
          font-family: var(--font-family-headline);
          letter-spacing: -0.03em;
        }

        .settings-sidebar-nav {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .settings-sidebar-summary {
          margin-top: 18px;
          padding: 18px;
          display: grid;
          gap: 12px;
          border-radius: 20px;
          background: rgba(13, 21, 39, 0.78);
          border: 1px solid rgba(123, 148, 199, 0.12);
        }

        .settings-sidebar-summary-kicker {
          color: var(--accent-blue);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .settings-sidebar-summary strong {
          font-size: 18px;
          font-family: var(--font-family-headline);
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .settings-sidebar-summary p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.55;
        }

        .settings-sidebar-summary-list {
          display: grid;
          gap: 10px;
        }

        .settings-sidebar-summary-item {
          display: grid;
          grid-template-columns: 16px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.4;
        }

        .settings-sidebar-summary-item i {
          color: var(--accent-blue);
          font-size: 15px;
          margin-top: 1px;
        }

        .settings-sidebar-link {
          width: 100%;
          min-height: auto;
          padding: 12px 13px;
          border-radius: 18px;
          border: 1px solid rgba(123, 148, 199, 0.1);
          background: rgba(16, 24, 42, 0.72);
          color: var(--text-primary);
          font: inherit;
          text-align: left;
          cursor: pointer;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .settings-sidebar-link i {
          font-size: 17px;
          color: var(--accent-blue);
          margin-top: 1px;
        }

        .settings-sidebar-link div {
          display: grid;
          gap: 2px;
        }

        .settings-sidebar-link strong {
          font-size: 13px;
          font-family: var(--font-family-headline);
          font-weight: 700;
        }

        .settings-sidebar-link span {
          color: var(--text-secondary);
          font-size: 10px;
          line-height: 1.25;
        }

        .settings-sidebar-link.active {
          border-color: color-mix(in srgb, var(--accent-blue) 30%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 18%, transparent), color-mix(in srgb, var(--accent-blue) 8%, transparent)),
            rgba(13, 21, 39, 0.9);
          transform: translateY(-2px);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 16px 30px rgba(15, 23, 42, 0.16);
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

        :root[data-ui-mode='light'] .settings-main {
          background: transparent;
        }

        :root[data-ui-mode='light'] .settings-panel,
        :root[data-ui-mode='light'] .settings-block,
        :root[data-ui-mode='light'] .settings-category-shell,
        :root[data-ui-mode='light'] .integration-block,
        :root[data-ui-mode='light'] .meta-connection-card,
        :root[data-ui-mode='light'] .meta-connection-guide-card {
          background: rgba(255, 255, 255, 0.9) !important;
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .settings-panel {
          background:
            radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--accent-blue) 10%, transparent) 0%, transparent 24%),
            radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--accent-blue) 6%, transparent) 0%, transparent 22%),
            rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-section-sidebar {
          background: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
        }

        :root[data-ui-mode='light'] .settings-block-obsidian,
        :root[data-ui-mode='light'] .settings-block-hero {
          background: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-head h1,
        :root[data-ui-mode='light'] .settings-block h2,
        :root[data-ui-mode='light'] .settings-sidebar-title strong,
        :root[data-ui-mode='light'] .settings-category-head h3,
        :root[data-ui-mode='light'] .settings-action-copy strong {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-head p,
        :root[data-ui-mode='light'] .settings-sidebar-link span,
        :root[data-ui-mode='light'] .settings-category-head p,
        :root[data-ui-mode='light'] .settings-action-copy span,
        :root[data-ui-mode='light'] .settings-block p {
          color: var(--text-secondary);
        }

        :root[data-ui-mode='light'] .settings-sidebar-link,
        :root[data-ui-mode='light'] .settings-tab,
        :root[data-ui-mode='light'] .settings-choice,
        :root[data-ui-mode='light'] .settings-preset,
        :root[data-ui-mode='light'] .settings-color-picker,
        :root[data-ui-mode='light'] .settings-color-code-row input,
        :root[data-ui-mode='light'] .settings-copy-button,
        :root[data-ui-mode='light'] .settings-rgb-field input,
        :root[data-ui-mode='light'] .input-group input,
        :root[data-ui-mode='light'] .input-group select,
        :root[data-ui-mode='light'] .input-group textarea {
          background: rgba(248, 250, 252, 0.96);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-sidebar-link:hover,
        :root[data-ui-mode='light'] .settings-choice:hover,
        :root[data-ui-mode='light'] .settings-preset:hover,
        :root[data-ui-mode='light'] .settings-tab:hover {
          background: color-mix(in srgb, var(--accent-blue) 7%, white);
        }

        :root[data-ui-mode='light'] .settings-sidebar-link.active,
        :root[data-ui-mode='light'] .settings-choice.active,
        :root[data-ui-mode='light'] .settings-preset.active,
        :root[data-ui-mode='light'] .settings-tab.active {
          background: color-mix(in srgb, var(--accent-blue) 10%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-sidebar-link strong,
        :root[data-ui-mode='light'] .settings-sidebar-link.active strong,
        :root[data-ui-mode='light'] .settings-sidebar-link.active span,
        :root[data-ui-mode='light'] .settings-choice,
        :root[data-ui-mode='light'] .settings-preset,
        :root[data-ui-mode='light'] .settings-tab {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-mode-card {
          background: rgba(255, 255, 255, 0.92);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .settings-mode-card.active {
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--accent-blue) 9%, white), rgba(255, 255, 255, 0.96)),
            rgba(255, 255, 255, 0.96);
          border-color: color-mix(in srgb, var(--accent-blue) 24%, rgba(15, 23, 42, 0.08));
          box-shadow: 0 18px 32px color-mix(in srgb, var(--accent-blue) 10%, transparent);
        }

        :root[data-ui-mode='light'] .settings-mode-copy strong,
        :root[data-ui-mode='light'] .settings-mode-copy p {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-mode-preview-light {
          background: #f8fafc;
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-mode-preview-light span {
          background: rgba(71, 85, 105, 0.18);
        }

        :root[data-ui-mode='light'] .settings-mode-preview-dark {
          background: #0f172a;
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-mode-preview-dark span {
          background: rgba(226, 232, 240, 0.22);
        }

        :root[data-ui-mode='light'] .settings-mode-check,
        :root[data-ui-mode='light'] .settings-mode-check i {
          color: #f8fbff;
        }

        :root[data-ui-mode='light'] .settings-background-preview {
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--panel-bg-tint) 18%, transparent) 0%, transparent 26%),
            radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--panel-bg-tint) 12%, transparent) 0%, transparent 22%),
            radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--panel-bg-tint) 10%, transparent) 0%, transparent 24%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(241, 245, 249, 0.94)),
            #f8fafc;
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-background-preview-card {
          background: rgba(255, 255, 255, 0.82);
          border-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-background-preview-card span,
        :root[data-ui-mode='light'] .settings-background-preview-card strong,
        :root[data-ui-mode='light'] .settings-background-preview-card small {
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-action-bar {
          background: rgba(255, 255, 255, 0.9);
          border-color: rgba(15, 23, 42, 0.08);
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.06);
        }

        :root[data-ui-mode='light'] .settings-save-button {
          box-shadow: 0 14px 28px color-mix(in srgb, var(--accent-blue) 16%, transparent);
        }

        :root[data-ui-mode='light'] .settings-ghost-button {
          background: rgba(248, 250, 252, 0.95);
          border-color: rgba(15, 23, 42, 0.08);
          color: var(--text-primary);
        }

        :root[data-ui-mode='light'] .settings-color-picker,
        :root[data-ui-mode='light'] .settings-color-code-row input,
        :root[data-ui-mode='light'] .settings-copy-button,
        :root[data-ui-mode='light'] .settings-rgb-field input {
          background: rgba(248, 250, 252, 0.96);
          border-color: rgba(15, 23, 42, 0.08);
          color: #0f172a;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .settings-copy-button:hover {
          color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 5%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .settings-mode-card:not(.active) {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98));
        }

        :root[data-ui-mode='light'] .settings-mode-copy p {
          color: #475569;
        }

        :root[data-ui-mode='light'] .settings-block-obsidian,
        :root[data-ui-mode='light'] .settings-block-hero,
        :root[data-ui-mode='light'] .settings-category-shell,
        :root[data-ui-mode='light'] .integration-block,
        :root[data-ui-mode='light'] .meta-connection-card,
        :root[data-ui-mode='light'] .meta-connection-guide-card,
        :root[data-ui-mode='light'] .settings-action-bar {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.98)) !important;
          border-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.06) !important;
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
          display: grid;
          gap: 22px;
          align-items: start;
        }

        .settings-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .settings-field-span-2 {
          grid-column: 1 / -1;
        }

        .settings-stack-list {
          display: grid;
          gap: 14px;
        }

        .settings-stack-card {
          padding: 18px;
          border-radius: 18px;
          display: grid;
          gap: 14px;
        }

        .settings-accordion-card summary {
          list-style: none;
          cursor: pointer;
        }

        .settings-accordion-card summary::-webkit-details-marker {
          display: none;
        }

        .settings-accordion-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .settings-accordion-summary div {
          display: grid;
          gap: 4px;
        }

        .settings-accordion-summary strong {
          color: var(--text-primary);
        }

        .settings-accordion-summary span,
        .settings-accordion-summary small {
          color: var(--text-secondary);
        }

        .settings-inline-action {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 40px 40px;
          gap: 8px;
          align-items: center;
        }

        .settings-inline-confirm {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(59, 130, 246, 0.2);
          background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
          color: #93c5fd;
        }

        .settings-inline-remove {
          border-color: rgba(244, 63, 94, 0.22);
          background: color-mix(in srgb, #f43f5e 10%, transparent);
          color: #fda4af;
        }

        .settings-option-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .settings-impact-row {
          margin-top: 2px;
        }

        .settings-chip-button {
          border: 0;
          cursor: pointer;
        }

        .settings-helper-copy {
          margin: 0;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .settings-chip-button:disabled {
          cursor: default;
          opacity: 0.86;
        }

        .settings-chip-button small {
          opacity: 0.7;
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .settings-empty-note {
          margin: 0;
          color: var(--text-secondary);
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
          display: grid;
          gap: 18px;
        }

        .integration-heading {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 6px;
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

        :root[data-ui-mode='light'] .settings-page-shell {
          background: linear-gradient(180deg, #f8fbff, #eef4ff) !important;
        }

        :root[data-ui-mode='light'] .settings-page-shell .sidebar.glass-panel {
          background: rgba(255, 255, 255, 0.92) !important;
          border-right-color: rgba(15, 23, 42, 0.08) !important;
          box-shadow: 12px 0 30px rgba(15, 23, 42, 0.04) !important;
        }

        :root[data-ui-mode='light'] .settings-page-shell .main-content.settings-main,
        :root[data-ui-mode='light'] .settings-page-shell .settings-main {
          background: transparent !important;
        }

        :root[data-ui-mode='light'] .settings-page-shell .settings-panel {
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--panel-bg-tint) 14%, transparent) 0%, transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98)) !important;
        }

        @media (max-width: 980px) {
          .settings-workspace {
            grid-template-columns: 1fr;
          }

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
