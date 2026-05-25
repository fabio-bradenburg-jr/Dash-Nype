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
    description: 'Espaço reservado para a credencial central do Google Ads.',
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
    description: 'Espaço reservado para a credencial central do TikTok Ads.',
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
    description: 'Espaço reservado para a credencial central do LinkedIn Ads.',
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
  createClientCustomColumnRecord({ key: 'trafficQuality', label: 'Gestão de Tráfego', type: 'select', tabKey: 'flags', options: ['Bom', 'Médio', 'Ruim'] }),
  createClientCustomColumnRecord({ key: 'designQuality', label: 'Design', type: 'select', tabKey: 'flags', options: ['Bom', 'Médio', 'Ruim'] }),
  createClientCustomColumnRecord({ key: 'copyQuality', label: 'Copy', type: 'select', tabKey: 'flags', options: ['Bom', 'Médio', 'Ruim'] }),
  createClientCustomColumnRecord({ key: 'csQuality', label: 'CS Atendimento', type: 'select', tabKey: 'flags', options: ['Bom', 'Médio', 'Ruim'] }),
  createClientCustomColumnRecord({ key: 'roiAboveOne', label: 'ROI Acima de 1?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'csatAboveFour', label: 'CSAT Igual ou superior a 4?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'npsAboveSeven', label: 'NPS Igual ou superior a 7?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'stakeholderAware', label: 'Stakeholder Pagador Consciente Dos Avanços?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'adAccountsHealthy', label: 'Contas de Anúncio Ativa? Saldo Ok?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'crmUsageProperly', label: 'CRM Em Uso Corretamente?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
  createClientCustomColumnRecord({ key: 'clientParticipationAbove90', label: 'Cliente Participou de >90% dos Check-ins?', type: 'select', tabKey: 'flags', options: ['Sim', 'Não'] }),
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

export default function SettingsPage({ embeddedOverride = false }: { embeddedOverride?: boolean } = {}) {
  const { appearance, updateAppearance, access } = useUser()
  const canManageClients = Boolean(access?.canManageClients)
  const canEditIntegrations = Boolean(access?.canEditIntegrations)
  const canLoadServerSettings = canManageClients || canEditIntegrations
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
  const generalIntegrationGroups = GLOBAL_INTEGRATION_GROUPS
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

      if (canEditIntegrations && serverState) {
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
    [canEditIntegrations, serverState]
  )

  useEffect(() => {
    if (!canLoadServerSettings) return

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
  }, [canLoadServerSettings])

  useEffect(() => {
    if (!canEditIntegrations) return

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
  }, [canEditIntegrations])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const tab = embeddedOverride ? params.get('settings_tab') : params.get('tab')
    const connected = params.get('meta_connected')
    const error = params.get('meta_error')

    const storedTab = window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)
    const resolvedStoredTab = storedTab === 'panel' || storedTab === 'general' || storedTab === 'operation'
      ? storedTab
      : null

    if (connected === '1' && canEditIntegrations) {
      setActiveSettingsTab('general')
    } else if (tab === 'ai' && canEditIntegrations) {
      setActiveSettingsTab('general')
    } else if (tab === 'general' && canEditIntegrations) {
      setActiveSettingsTab('general')
    } else if (tab === 'operation' && canManageClients) {
      setActiveSettingsTab('operation')
    } else if (tab === 'panel') {
      setActiveSettingsTab('panel')
    } else if (canEditIntegrations && resolvedStoredTab) {
      setActiveSettingsTab(resolvedStoredTab)
    } else if (canEditIntegrations) {
      setActiveSettingsTab('general')
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
  }, [canEditIntegrations, embeddedOverride, globalIntegrations, globalIntegrations.metaConnectionMode, persistGlobalIntegrations])

  useEffect(() => {
    if (activeSettingsTab === 'operation' && !canManageClients) {
      setActiveSettingsTab(canEditIntegrations ? 'general' : 'panel')
      return
    }

    if (activeSettingsTab === 'general' && !canEditIntegrations) {
      setActiveSettingsTab('panel')
    }
  }, [activeSettingsTab, canEditIntegrations, canManageClients])

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
    if (!canEditIntegrations) {
      setSettingsSaveFeedback('Sem permissão para alterar integrações. Peça liberação ao administrador.')
      return
    }

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
    if (!canEditIntegrations) {
      setSettingsSaveFeedback('Sem permissão para alterar integrações. Peça liberação ao administrador.')
      return
    }

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
    if (!canEditIntegrations) {
      setSettingsSaveFeedback('Sem permissão para alterar integrações. Peça liberação ao administrador.')
      return
    }

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
    if (!canEditIntegrations) {
      setMetaConnectionError('Sem permissão para desconectar a Meta.')
      return
    }

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

  const handlePanelHexChange = (fieldName: 'accent' | 'backgroundTint', value: string) => {
    const normalized = String(value || '').trim()
    const candidate = normalized.startsWith('#') ? normalized : `#${normalized}`
    if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) return
    updatePanelDraft((current) => ({ ...current, [fieldName]: candidate.toLowerCase() }))
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
          throw new Error(data?.error || 'Não foi possível salvar a configuração.')
        }

        setServerState(data)
      }
    },
    [canManageClients, serverState]
  )

  const handleOperationRiskTargetChange = (value: string) => {
    const parsed = Number(value)
    const nextSettings = {
      ...operationSettings,
      healthRiskTargetPercent: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 20,
    }
    setOperationSettings(nextSettings)
  }

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
          color: 'var(--accent-blue)',
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
          color: 'var(--accent-blue)',
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

    if (activeSettingsTab === 'operation') {
      try {
        await persistOperationSettings(operationSettings)
        feedbackMessages.push('Meta operacional sincronizada com sucesso.')
      } catch (error) {
        setSettingsSaveFeedback(
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar a configuração operacional.'
        )
        return
      }
    } else if (canEditIntegrations) {
      try {
        await persistGlobalIntegrations(globalIntegrations)
        feedbackMessages.push('Integrações do app sincronizadas com sucesso.')
      } catch (error) {
        setSettingsSaveFeedback(
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar as integrações do app.'
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
    if (embeddedOverride) {
      params.set('tab', 'settings')
      params.set('settings_tab', nextTab)
    } else {
      params.set('tab', nextTab)
    }
    const nextQuery = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`)
  }

  return (
    <div className={embeddedOverride ? "settings-embedded-shell" : "dashboard-container settings-page-shell dashboard-shell-stellar"}>
      {!embeddedOverride && (
      <aside className="sidebar glass-panel">
        <div className="logo">
          <span className="brand-logo-mark logo-image" aria-hidden="true"></span>
          <div className="logo-copy">
            <span>Assessoria LP</span>
            <small>Performance Hub</small>
          </div>
        </div>

        <nav className="nav-menu">
          <Link href="/home" className="nav-item">
            <i className="bx bxs-home-heart"></i>
            Home
          </Link>
          <span className="nav-item active">
            <i className="bx bx-cog"></i>
            Configurações
          </span>
        </nav>
      </aside>
      )}

      <main className={embeddedOverride ? "main-content settings-main settings-main-embedded" : "main-content settings-main"}>
        <div className="settings-workspace">
          <aside className="glass-item settings-section-sidebar">
            <div className="settings-sidebar-title">
              <span>Configuração</span>
              <strong>Ajustes do app</strong>
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

              {canEditIntegrations && (
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
                </>
              )}

              {canManageClients && (
                <button
                  type="button"
                  className={`settings-sidebar-link ${activeSettingsTab === 'operation' ? 'active' : ''}`}
                  onClick={() => handleSettingsTabChange('operation')}
                >
                  <i className="bx bx-pulse"></i>
                  <div>
                    <strong>Operação</strong>
                    <span>Meta de risco e saúde semanal dos clientes.</span>
                  </div>
                </button>
              )}
            </div>
          </aside>

          <section className="glass-panel settings-panel">
          <div className="settings-head">
            <div>
              <h1>Configurações</h1>
              <p>Centralize aqui a aparência da sua conta e as credenciais globais do app.</p>
            </div>
            {!embeddedOverride && (
              <Link href="/home" className="btn btn-secondary">
                Voltar
              </Link>
            )}
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
                      <div className="glass-item settings-block settings-block-obsidian settings-detail-accent-block" style={{ '--settings-accent': panelDraft.accent } as CSSProperties}>
                        <div className="settings-obsidian-head">
                          <div>
                            <span>Cor dos detalhes do app</span>
                            <h2>Botões, ícones e destaques</h2>
                          </div>
                          <p>Define a cor dos botões principais, ícones ativos, links, bordas de foco, indicadores e frases destacadas do sistema.</p>
                        </div>

                        <div className="settings-color-showcase">
                          <div className="settings-color-display">
                            <i className="bx bx-palette"></i>
                          </div>
                          <div className="settings-color-code">
                            <label>Hex selecionado</label>
                            <div className="settings-color-code-row">
                              <input
                                type="text"
                                value={panelDraft.accent.toUpperCase()}
                                onChange={(event) => handlePanelHexChange('accent', event.target.value)}
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
                            <span>Salve para aplicar essa cor nos detalhes visuais do app inteiro.</span>
                          </div>
                        </div>

                        <div className="settings-detail-preview" aria-label="Prévia da cor dos detalhes do app">
                          <button type="button" className="settings-detail-preview-button">
                            <i className="bx bx-check-circle"></i>
                            Botão principal
                          </button>
                          <div className="settings-detail-preview-icon">
                            <i className="bx bx-sparkles"></i>
                          </div>
                          <p>
                            <strong>Frase destacada:</strong> essa cor aparece nos pontos que guiam a atenção dentro do app.
                          </p>
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

                            <div className="settings-color-code-row">
                              <input
                                type="text"
                                value={panelDraft.backgroundTint.toUpperCase()}
                                onChange={(event) => handlePanelHexChange('backgroundTint', event.target.value)}
                                aria-label="Código hexadecimal da cor do fundo do app"
                              />
                              <button
                                type="button"
                                className="settings-copy-button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(panelDraft.backgroundTint.toUpperCase())
                                  setPanelFeedback('Código da cor de fundo copiado para a área de transferência.')
                                }}
                              >
                                <i className="bx bx-copy"></i>
                              </button>
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

              {canEditIntegrations && activeSettingsTab === 'general' && (
                <div className="glass-item settings-block settings-block-full">
                  <div className="settings-section-head">
                    <div>
                      <h2>Integrações gerais</h2>
                      <p>Essas credenciais abastecem o app inteiro. Separe ferramentas operacionais da camada de IA para configurar cada frente sem mistura.</p>
                    </div>
                  </div>

                  <div className="settings-general-layout">
                    <section className="settings-integration-family settings-integration-family-tools">
                      <div className="settings-category-head settings-integration-family-head">
                        <span className="settings-category-kicker">Integrações de Ferramentas</span>
                        <h3>Fontes operacionais conectadas</h3>
                        <p>Conecte mídia, CRM e plataformas usadas no dia a dia da operação para alimentar clientes, campanhas, funis e relatórios.</p>
                      </div>

                      <div className="settings-integration-family-grid">
                        <section className="settings-category-shell">
                          <div className="settings-category-head">
                            <span className="settings-category-kicker">Contas de anúncio</span>
                            <h3>Mídia e plataformas de aquisição</h3>
                            <p>Concentre aqui as credenciais que alimentam leitura de mídia, campanhas e resultado por conta.</p>
                          </div>

                      <div className="settings-integrations-grid settings-category-grid">
                        <div className="integration-block integration-block-meta">
                          <div className="integration-heading">
                            <div className="integration-icon" style={{ color: 'var(--accent-blue)', borderColor: 'color-mix(in srgb, var(--accent-blue) 30%, transparent)' }}>
                              <i className="bx bxl-meta"></i>
                            </div>
                            <div>
                              <h3>Meta Ads</h3>
                              <p>Escolha entre token manual ou conta conectada via Meta Login.</p>
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
                                      : 'Conecte sua conta da Meta para listar e vincular contas de anúncio.'}
                                  </span>
                                </div>
                                <div className="meta-connection-actions">
                                  <a href="/api/meta/auth/start?return_to=%2F%3Ftab%3Dsettings%26settings_tab%3Dgeneral" className="btn btn-primary">
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
                                      ? 'A conta da Meta já está vinculada e pode ser usada para listar contas de anúncio.'
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
                      </div>
                    </section>

                    <section className="settings-integration-family settings-integration-family-ai">
                      <div className="settings-category-head settings-integration-family-head">
                        <span className="settings-category-kicker">Integração de IA</span>
                        <h3>Provider, prompts e agentes</h3>
                        <p>Defina a IA ativa, o prompt global do dashboard e os agentes usados no chat, isolados das integrações de ferramentas.</p>
                      </div>

                      <section className="settings-category-shell">
                        <div className="settings-category-head">
                          <span className="settings-category-kicker">IA</span>
                          <h3>Configuração da IA</h3>
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
                            <div className="integration-icon" style={{ color: 'var(--accent-blue)', borderColor: 'color-mix(in srgb, var(--accent-blue) 30%, transparent)' }}>
                              <i className="bx bx-cog"></i>
                            </div>
                            <div>
                              <h3>Agentes do chat</h3>
                              <p>Crie agentes com prompts próprios para copy, mídia, análise ou qualquer outro papel que você queira usar no chat.</p>
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
                    </section>
                  </div>
                </div>
              )}





              {canManageClients && activeSettingsTab === 'operation' && (
                <div className="settings-panel-layout settings-panel-layout-obsidian">
                  <div className="glass-item settings-block settings-block-full settings-block-hero">
                    <div className="settings-section-head">
                      <div>
                        <span className="settings-hero-kicker">controle operacional</span>
                        <h2>Meta de saúde da carteira</h2>
                        <p>Defina o limite máximo de clientes em Crítico + Atenção. O painel compara a semana selecionada contra essa meta.</p>
                      </div>
                    </div>

                    <div className="settings-operation-grid">
                      <div className="glass-item settings-operation-card">
                        <span>Alvo permitido</span>
                        <strong>{operationSettings.healthRiskTargetPercent}%</strong>
                        <p>Percentual máximo de clientes em Crítico e Atenção juntos.</p>
                      </div>
                      <label className="settings-operation-field">
                        <span>Meta Crítico + Atenção</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={operationSettings.healthRiskTargetPercent}
                          onChange={(event) => handleOperationRiskTargetChange(event.target.value)}
                        />
                        <small>Hoje o objetivo padrão do time é 20%.</small>
                      </label>
                    </div>
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
                        : activeSettingsTab === 'operation'
                          ? 'Salve a meta operacional para aplicar no Controle da Operação.'
                          : 'As integrações do app já sincronizam em tempo real, mas você pode usar este botão para confirmar e reaplicar a configuração atual.')}
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

        .settings-main-embedded {
          margin-left: 0 !important;
          padding: 0 !important;
        }

        .settings-embedded-shell {
          width: 100%;
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
          grid-template-columns: minmax(0, 1fr);
        }

        .settings-grid-obsidian > .settings-block {
          width: 100%;
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

        .settings-detail-accent-block {
          --settings-accent: var(--accent-blue);
        }

        .settings-detail-preview {
          display: grid;
          grid-template-columns: minmax(180px, max-content) 48px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--settings-accent) 24%, rgba(255, 255, 255, 0.08));
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--settings-accent) 12%, transparent), rgba(255, 255, 255, 0.025));
        }

        .settings-detail-preview-button {
          min-height: 46px;
          padding: 0 16px;
          border: 1px solid color-mix(in srgb, var(--settings-accent) 70%, #ffffff 8%);
          border-radius: 12px;
          background:
            linear-gradient(135deg, var(--settings-accent), color-mix(in srgb, var(--settings-accent) 78%, #ffffff 12%));
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          font: inherit;
          font-weight: 800;
          box-shadow: 0 14px 28px color-mix(in srgb, var(--settings-accent) 24%, transparent);
        }

        .settings-detail-preview-button i {
          font-size: 18px;
        }

        .settings-detail-preview-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--settings-accent) 34%, transparent);
          background: color-mix(in srgb, var(--settings-accent) 13%, transparent);
          color: color-mix(in srgb, var(--settings-accent) 76%, #ffffff);
          font-size: 22px;
        }

        .settings-detail-preview p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .settings-detail-preview strong {
          color: color-mix(in srgb, var(--settings-accent) 72%, #ffffff);
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
          min-width: 0;
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

        .settings-operation-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.55fr) minmax(0, 1fr);
          gap: 24px;
          margin-top: 28px;
          align-items: stretch;
        }

        .settings-operation-card,
        .settings-operation-field {
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.04);
          padding: 26px;
        }

        .settings-operation-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 12px;
        }

        .settings-operation-card span,
        .settings-operation-field span {
          color: var(--text-muted);
          font-size: 0.76rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .settings-operation-card strong {
          color: var(--text-primary);
          font-size: clamp(2.4rem, 5vw, 4.4rem);
          line-height: 1;
        }

        .settings-operation-card p,
        .settings-operation-field small {
          color: var(--text-muted);
          line-height: 1.5;
        }

        .settings-operation-field {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .settings-operation-field input {
          min-height: 68px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 22px;
          background: rgba(6, 10, 18, 0.72);
          color: var(--text-primary);
          padding: 0 20px;
          font-size: 1.7rem;
          font-weight: 900;
          outline: none;
        }

        :root[data-ui-mode='light'] .settings-operation-card,
        :root[data-ui-mode='light'] .settings-operation-field,
        :root[data-ui-mode='light'] .settings-operation-field input {
          background: #ffffff;
          border-color: rgba(15, 23, 42, 0.08);
          color: #0f172a;
        }

        :root[data-ui-mode='light'] .settings-operation-card strong {
          color: #0f172a;
        }

        @media (max-width: 900px) {
          .settings-operation-grid {
            grid-template-columns: 1fr;
          }
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
          position: static;
          bottom: auto;
          z-index: 10;
          margin-top: 0;
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
        :root[data-ui-mode='light'] .settings-detail-preview,
        :root[data-ui-mode='light'] .settings-color-code-row input,
        :root[data-ui-mode='light'] .settings-copy-button,
        :root[data-ui-mode='light'] .settings-rgb-field input {
          background: rgba(248, 250, 252, 0.96);
          border-color: rgba(15, 23, 42, 0.08);
          color: #0f172a;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        :root[data-ui-mode='light'] .settings-color-code-row input {
          background: #ffffff;
          color: var(--accent-blue);
          border-color: rgba(15, 23, 42, 0.1);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.035);
        }

        :root[data-ui-mode='light'] .settings-copy-button {
          background: #ffffff;
          color: #475569;
          border-color: rgba(15, 23, 42, 0.1);
        }

        :root[data-ui-mode='light'] .settings-copy-button:hover {
          color: var(--accent-blue);
          background: color-mix(in srgb, var(--accent-blue) 5%, white);
          border-color: color-mix(in srgb, var(--accent-blue) 22%, rgba(15, 23, 42, 0.08));
        }

        :root[data-ui-mode='light'] .settings-detail-preview strong {
          color: color-mix(in srgb, var(--settings-accent) 74%, #0f172a);
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

        .settings-integration-family {
          display: grid;
          gap: 18px;
        }

        .settings-integration-family-head {
          padding: 2px 2px 0;
        }

        .settings-integration-family-head h3 {
          font-size: 26px;
        }

        .settings-integration-family-grid {
          display: grid;
          gap: 18px;
        }

        .settings-integration-family-tools {
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .settings-integration-family-ai .settings-category-shell {
          border-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(255, 255, 255, 0.06));
          background:
            linear-gradient(145deg, rgba(16, 185, 129, 0.07), rgba(255, 255, 255, 0.02) 34%),
            rgba(255, 255, 255, 0.02);
        }

        :root[data-ui-mode='light'] .settings-integration-family-tools {
          border-bottom-color: rgba(15, 23, 42, 0.08);
        }

        :root[data-ui-mode='light'] .settings-integration-family-ai .settings-category-shell {
          border-color: color-mix(in srgb, var(--accent-blue) 16%, rgba(15, 23, 42, 0.08)) !important;
          background:
            linear-gradient(145deg, color-mix(in srgb, var(--accent-blue) 7%, white), rgba(255, 255, 255, 0.96) 38%),
            #ffffff !important;
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
          color: var(--accent-blue);
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
          color: var(--accent-blue);
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
          color: var(--accent-blue);
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
          color: color-mix(in srgb, var(--accent-blue) 72%, white 28%);
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


        /* Final light-mode contrast pass for settings controls. */
        :root[data-ui-mode='light'] .settings-sidebar-link,
        :root[data-ui-mode='light'] .settings-choice,
        :root[data-ui-mode='light'] .settings-preset,
        :root[data-ui-mode='light'] .settings-tab {
          background: rgba(255, 255, 255, 0.96) !important;
          border-color: rgba(15, 23, 42, 0.1) !important;
          color: #0f172a !important;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04) !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link strong,
        :root[data-ui-mode='light'] .settings-sidebar-link span,
        :root[data-ui-mode='light'] .settings-choice,
        :root[data-ui-mode='light'] .settings-choice span,
        :root[data-ui-mode='light'] .settings-choice strong,
        :root[data-ui-mode='light'] .settings-preset,
        :root[data-ui-mode='light'] .settings-tab {
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link.active,
        :root[data-ui-mode='light'] .settings-choice.active,
        :root[data-ui-mode='light'] .settings-preset.active,
        :root[data-ui-mode='light'] .settings-tab.active {
          background: color-mix(in srgb, var(--accent-blue) 12%, white) !important;
          border-color: color-mix(in srgb, var(--accent-blue) 34%, rgba(15, 23, 42, 0.1)) !important;
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link,
        :root[data-ui-mode='light'] .settings-sidebar-link:hover,
        :root[data-ui-mode='light'] .settings-sidebar-link.active {
          background: #D3D3D3 !important;
          border-color: rgba(15, 23, 42, 0.12) !important;
          color: #000000 !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link strong,
        :root[data-ui-mode='light'] .settings-sidebar-link span,
        :root[data-ui-mode='light'] .settings-sidebar-link.active strong,
        :root[data-ui-mode='light'] .settings-sidebar-link.active span {
          color: #000000 !important;
          opacity: 1;
        }

        :root[data-ui-mode='light'] .settings-action-bar,
        :root[data-ui-mode='light'] .settings-action-bar-global {
          background: rgba(255, 255, 255, 0.96) !important;
          border-color: rgba(15, 23, 42, 0.1) !important;
          color: #0f172a !important;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12) !important;
        }

        :root[data-ui-mode='light'] .settings-action-copy strong {
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .settings-action-copy span {
          color: #475569 !important;
        }

        :root[data-ui-mode='light'] .settings-ghost-button {
          background: rgba(248, 250, 252, 0.98) !important;
          border-color: rgba(15, 23, 42, 0.1) !important;
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .settings-ghost-button:disabled {
          color: #64748b !important;
        }

        :root[data-ui-mode='light'] .settings-action-buttons .btn-secondary {
          background: rgba(255, 255, 255, 0.94) !important;
          border-color: rgba(15, 23, 42, 0.1) !important;
          color: #0f172a !important;
        }

        :root[data-ui-mode='light'] .settings-action-bar-global {
          background: rgba(25, 28, 34, 0.88) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          color: #ffffff !important;
        }

        :root[data-ui-mode='light'] .settings-action-bar-global .settings-action-copy strong,
        :root[data-ui-mode='light'] .settings-action-bar-global .settings-action-copy span {
          color: #ffffff !important;
        }

        :root[data-ui-mode='light'] .settings-action-bar-global .settings-ghost-button,
        :root[data-ui-mode='light'] .settings-action-bar-global .settings-action-buttons .btn-secondary {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
          color: #ffffff !important;
        }

        :root[data-ui-mode='light'] .settings-action-bar-global .settings-ghost-button:disabled {
          color: #ffffff !important;
          opacity: 0.5;
        }

        /* Lumina control-room pass for Settings. */
        .settings-page-shell {
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--button-primary, #26c281) 10%, transparent), transparent 34%),
            linear-gradient(180deg, #070908 0%, #0d1110 58%, #070908 100%) !important;
        }

        .settings-main {
          padding-right: 28px;
        }

        .settings-workspace {
          gap: 24px;
          grid-template-columns: minmax(0, 1fr);
        }

        .settings-section-sidebar {
          padding: 14px;
          border-radius: 18px;
          position: static;
          justify-self: stretch;
          display: grid;
          grid-template-columns: minmax(180px, 0.28fr) minmax(0, 1fr);
          gap: 16px;
          align-items: center;
          background:
            linear-gradient(180deg, rgba(18, 24, 23, 0.9), rgba(13, 17, 16, 0.88)),
            rgba(18, 24, 23, 0.78);
          border-color: rgba(190, 201, 191, 0.16);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(12px);
        }

        .settings-sidebar-title {
          padding: 8px 14px 8px 8px;
          border-right: 1px solid rgba(190, 201, 191, 0.12);
          border-bottom: 0;
        }

        .settings-sidebar-title span,
        .settings-hero-kicker,
        .settings-obsidian-head span,
        .settings-category-kicker {
          color: color-mix(in srgb, var(--button-primary, #26c281) 72%, #f1f1f1);
          letter-spacing: 0.14em;
        }

        .settings-sidebar-title strong {
          max-width: none;
          font-size: 18px;
          letter-spacing: -0.01em;
        }

        .settings-sidebar-nav {
          display: flex;
          flex-wrap: nowrap;
          gap: 10px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .settings-sidebar-nav::-webkit-scrollbar {
          display: none;
        }

        .settings-sidebar-link {
          flex: 1 1 0;
          min-width: 210px;
          border-radius: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.025);
          border-color: rgba(190, 201, 191, 0.12);
          grid-template-columns: 22px minmax(0, 1fr);
          align-items: center;
        }

        .settings-sidebar-link i {
          color: color-mix(in srgb, var(--button-primary, #26c281) 68%, #f1f1f1);
          font-size: 19px;
        }

        .settings-sidebar-link strong {
          font-size: 13px;
          letter-spacing: 0;
        }

        .settings-sidebar-link span {
          color: rgba(241, 241, 241, 0.58);
          font-size: 11px;
        }

        .settings-sidebar-link:hover,
        .settings-sidebar-link.active {
          border-color: color-mix(in srgb, var(--button-primary, #26c281) 30%, rgba(190, 201, 191, 0.16));
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--button-primary, #26c281) 14%, transparent), rgba(255, 255, 255, 0.035));
          transform: translateY(-1px);
          box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--button-primary, #26c281) 74%, #f1f1f1);
        }

        .settings-panel {
          padding: 28px;
          gap: 26px;
          border-radius: 20px;
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--button-primary, #26c281) 10%, transparent), transparent 28%),
            linear-gradient(180deg, rgba(18, 24, 23, 0.86), rgba(13, 17, 16, 0.92));
          border-color: rgba(190, 201, 191, 0.16);
          box-shadow: 0 22px 52px rgba(0, 0, 0, 0.24);
        }

        .settings-head {
          padding: 4px 0 22px;
          border-bottom-color: rgba(190, 201, 191, 0.14);
        }

        .settings-head h1 {
          font-size: clamp(2rem, 3vw, 3rem);
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .settings-head p {
          max-width: 760px;
          color: rgba(241, 241, 241, 0.68);
        }

        .settings-block,
        .settings-category-shell,
        .integration-block,
        .meta-connection-card,
        .meta-connection-guide-card,
        .settings-mode-card,
        .settings-operation-card,
        .settings-operation-field,
        .settings-stack-card {
          border-radius: 16px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.034), rgba(255, 255, 255, 0.018)),
            rgba(18, 24, 23, 0.76);
          border: 1px solid rgba(190, 201, 191, 0.14);
          box-shadow: none;
        }

        .settings-block-hero {
          padding: 26px;
          border-radius: 18px;
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--button-primary, #26c281) 12%, rgba(18, 24, 23, 0.88)), rgba(18, 24, 23, 0.86)),
            rgba(18, 24, 23, 0.8);
        }

        .settings-block h2,
        .settings-category-head h3 {
          letter-spacing: -0.015em;
        }

        .settings-grid,
        .settings-form-grid,
        .settings-integrations-grid,
        .settings-mode-grid {
          gap: 16px;
        }

        .settings-choice,
        .settings-preset,
        .settings-tab,
        .settings-copy-button,
        .settings-inline-confirm,
        .settings-inline-remove {
          border-radius: 10px;
        }

        .settings-choice,
        .settings-preset,
        .settings-tab {
          border-color: rgba(190, 201, 191, 0.14);
          background: rgba(255, 255, 255, 0.035);
        }

        .settings-choice.active,
        .settings-preset.active,
        .settings-tab.active {
          border-color: color-mix(in srgb, var(--button-primary, #26c281) 38%, rgba(190, 201, 191, 0.18));
          background: color-mix(in srgb, var(--button-primary, #26c281) 14%, rgba(255, 255, 255, 0.035));
        }

        .input-group input,
        .input-group select,
        .input-group textarea,
        .settings-rgb-field input,
        .settings-color-code-row input,
        .settings-operation-field input {
          border-radius: 10px;
          background: rgba(7, 9, 8, 0.64);
          border-color: rgba(190, 201, 191, 0.16);
        }

        .input-group input:focus,
        .input-group select:focus,
        .input-group textarea:focus,
        .settings-rgb-field input:focus,
        .settings-operation-field input:focus {
          border-color: color-mix(in srgb, var(--button-primary, #26c281) 60%, white);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--button-primary, #26c281) 16%, transparent);
        }

        .settings-action-bar-global {
          border-radius: 18px;
          background:
            linear-gradient(90deg, rgba(13, 17, 16, 0.94), rgba(18, 24, 23, 0.9)),
            rgba(18, 24, 23, 0.86);
          border-color: rgba(190, 201, 191, 0.18);
        }

        .settings-save-button {
          border-radius: 10px;
          background:
            linear-gradient(135deg, var(--button-primary, var(--accent-blue)) 0%, color-mix(in srgb, var(--button-primary, var(--accent-blue)) 78%, #2ecc71 22%) 100%) !important;
          color: #ffffff !important;
          box-shadow: 0 14px 30px color-mix(in srgb, var(--button-primary, var(--accent-blue)) 18%, transparent);
        }

        :root[data-ui-mode='light'] .settings-page-shell {
          background: linear-gradient(180deg, #f9f9f9 0%, #f1f4f2 100%) !important;
        }

        :root[data-ui-mode='light'] .settings-panel,
        :root[data-ui-mode='light'] .settings-section-sidebar {
          background: rgba(255, 255, 255, 0.9) !important;
          border-color: #bbcabe !important;
          box-shadow: 0 16px 34px rgba(20, 90, 50, 0.06) !important;
        }

        :root[data-ui-mode='light'] .settings-head {
          border-bottom-color: rgba(108, 122, 112, 0.22);
        }

        :root[data-ui-mode='light'] .settings-head h1,
        :root[data-ui-mode='light'] .settings-block h2,
        :root[data-ui-mode='light'] .settings-category-head h3,
        :root[data-ui-mode='light'] .settings-sidebar-title strong {
          color: #1a1c1c !important;
        }

        :root[data-ui-mode='light'] .settings-head p,
        :root[data-ui-mode='light'] .settings-sidebar-link span,
        :root[data-ui-mode='light'] .settings-block p,
        :root[data-ui-mode='light'] .settings-category-head p,
        :root[data-ui-mode='light'] .input-group label,
        :root[data-ui-mode='light'] .input-group small,
        :root[data-ui-mode='light'] .settings-help-text {
          color: #3d4a41 !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link,
        :root[data-ui-mode='light'] .settings-sidebar-link:hover {
          background: #ffffff !important;
          border-color: rgba(187, 202, 190, 0.92) !important;
          color: #1a1c1c !important;
          box-shadow: none !important;
        }

        :root[data-ui-mode='light'] .settings-sidebar-link.active {
          background: color-mix(in srgb, #26c281 12%, #ffffff) !important;
          border-color: color-mix(in srgb, #006c44 34%, #bbcabe) !important;
          box-shadow: inset 0 -3px 0 #006c44 !important;
        }

        :root[data-ui-mode='light'] .settings-block,
        :root[data-ui-mode='light'] .settings-category-shell,
        :root[data-ui-mode='light'] .integration-block,
        :root[data-ui-mode='light'] .meta-connection-card,
        :root[data-ui-mode='light'] .meta-connection-guide-card,
        :root[data-ui-mode='light'] .settings-mode-card,
        :root[data-ui-mode='light'] .settings-operation-card,
        :root[data-ui-mode='light'] .settings-operation-field,
        :root[data-ui-mode='light'] .settings-stack-card {
          background: #ffffff !important;
          border-color: rgba(187, 202, 190, 0.86) !important;
          box-shadow: 0 10px 24px rgba(20, 90, 50, 0.045) !important;
        }

        :root[data-ui-mode='light'] .settings-choice,
        :root[data-ui-mode='light'] .settings-preset,
        :root[data-ui-mode='light'] .settings-tab {
          background: #ffffff !important;
          border-color: rgba(187, 202, 190, 0.92) !important;
          color: #1a1c1c !important;
        }

        :root[data-ui-mode='light'] .settings-choice.active,
        :root[data-ui-mode='light'] .settings-preset.active,
        :root[data-ui-mode='light'] .settings-tab.active {
          background: color-mix(in srgb, #26c281 12%, #ffffff) !important;
          border-color: color-mix(in srgb, #006c44 34%, #bbcabe) !important;
        }

        :root[data-ui-mode='light'] .settings-action-bar-global {
          background: #1a1c1c !important;
          border-color: rgba(26, 28, 28, 0.16) !important;
          box-shadow: 0 18px 36px rgba(13, 13, 13, 0.16) !important;
        }

        :global(.dashboard-light-mode) .settings-page-shell {
          background: linear-gradient(180deg, #f9f9f9 0%, #f1f4f2 100%) !important;
        }

        :global(.dashboard-light-mode) .settings-panel,
        :global(.dashboard-light-mode) .settings-section-sidebar {
          background: rgba(255, 255, 255, 0.94) !important;
          border-color: #bbcabe !important;
          box-shadow: 0 16px 34px rgba(20, 90, 50, 0.06) !important;
        }

        :global(.dashboard-light-mode) .settings-head p,
        :global(.dashboard-light-mode) .settings-block p,
        :global(.dashboard-light-mode) .settings-category-head p,
        :global(.dashboard-light-mode) .settings-sidebar-link span,
        :global(.dashboard-light-mode) .input-group label,
        :global(.dashboard-light-mode) .input-group small,
        :global(.dashboard-light-mode) .settings-help-text {
          color: #3d4a41 !important;
          opacity: 1 !important;
        }

        :global(.dashboard-light-mode) .settings-sidebar-link,
        :global(.dashboard-light-mode) .settings-sidebar-link:hover {
          background: #ffffff !important;
          border-color: rgba(187, 202, 190, 0.92) !important;
          color: #1a1c1c !important;
          box-shadow: none !important;
        }

        :global(.dashboard-light-mode) .settings-sidebar-link.active {
          background: color-mix(in srgb, #26c281 12%, #ffffff) !important;
          border-color: color-mix(in srgb, #006c44 34%, #bbcabe) !important;
          box-shadow: inset 0 -3px 0 #006c44 !important;
        }

        :global(.dashboard-light-mode) .settings-block,
        :global(.dashboard-light-mode) .settings-category-shell,
        :global(.dashboard-light-mode) .integration-block,
        :global(.dashboard-light-mode) .meta-connection-card,
        :global(.dashboard-light-mode) .meta-connection-guide-card,
        :global(.dashboard-light-mode) .settings-mode-card,
        :global(.dashboard-light-mode) .settings-operation-card,
        :global(.dashboard-light-mode) .settings-operation-field,
        :global(.dashboard-light-mode) .settings-stack-card {
          background: #ffffff !important;
          border-color: rgba(187, 202, 190, 0.86) !important;
          box-shadow: 0 10px 24px rgba(20, 90, 50, 0.045) !important;
        }

        :global(.dashboard-light-mode) .settings-action-bar-global {
          background: #1a1c1c !important;
          border-color: rgba(26, 28, 28, 0.16) !important;
          box-shadow: 0 18px 36px rgba(13, 13, 13, 0.16) !important;
        }

        :global(.dashboard-light-mode) .settings-detail-preview {
          background: color-mix(in srgb, var(--settings-accent) 8%, #ffffff) !important;
          border-color: color-mix(in srgb, var(--settings-accent) 24%, rgba(15, 23, 42, 0.08)) !important;
        }

        :global(.dashboard-light-mode) .settings-detail-preview strong {
          color: color-mix(in srgb, var(--settings-accent) 74%, #0f172a);
        }

        @media (max-width: 980px) {
          .settings-workspace {
            grid-template-columns: 1fr;
          }

          .settings-section-sidebar {
            position: static;
            max-height: none;
            overflow: visible;
            grid-template-columns: 1fr;
          }

          .settings-sidebar-nav {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            overflow: visible;
          }

          .settings-sidebar-title {
            border-right: 0;
            border-bottom: 1px solid rgba(190, 201, 191, 0.12);
            padding: 8px 8px 12px;
          }

          .settings-sidebar-link {
            min-width: 0;
          }

          .settings-main {
            padding-right: 0;
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

          .settings-detail-preview {
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
            padding: 18px;
            border-radius: 16px;
          }

          .settings-head h1 {
            font-size: 34px;
          }

          .settings-form-grid,
          .settings-operation-grid {
            grid-template-columns: 1fr;
          }

          .settings-preset-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .settings-rgb-grid {
            grid-template-columns: 1fr;
          }
        }

        :root[data-ui-mode='light'] .settings-page-shell :where(
          h1, h2, h3, h4, h5, h6,
          p, span, strong, small, label, b,
          li, dt, dd,
          .settings-head, .settings-block,
          .settings-category-head, .settings-sidebar-title,
          .settings-mode-copy, .settings-action-copy
        ):not(.settings-save-button):not(.settings-save-button *):not(.btn-primary):not(.btn-primary *) {
          color: #1a1c1c !important;
        }

        :root[data-ui-mode='light'] .settings-page-shell :where(
          input, select, textarea,
          .settings-color-code-row input,
          .settings-rgb-field input
        ) {
          color: #1a1c1c !important;
        }

        :root[data-ui-mode='light'] .settings-page-shell :where(
          .settings-head p,
          .settings-block p,
          .settings-category-head p,
          .settings-sidebar-link span,
          .input-group small,
          .settings-help-text
        ):not(.settings-save-button):not(.settings-save-button *) {
          color: #3d4a41 !important;
        }
      `}</style>
    </div>
  )
}
