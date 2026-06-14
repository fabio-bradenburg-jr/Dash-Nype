import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from '@/lib/ai-config'
import type {
  ClientChecklistItemRecord,
  ClientNoteRecord,
  ClientOkrRecord,
  ClientCustomColumnRecord,
  ClientCustomTabRecord,
  ClientImplementationPhaseRecord,
  ClientTabOverrideRecord,
  ClientGroupRecord,
  ClientRecord,
  DashboardIntegrations,
  DashboardMetricLayout,
  DashboardPreferences,
  DashboardTemplate,
  OperationCardRecord,
  OperationCommentRecord,
  OperationCustomFieldRecord,
  OperationLaneRecord,
  OperationSettingsRecord,
  OperationStatusRecord,
  OperationSubtaskRecord,
  ProductRecord,
  TeamMemberAllocationRecord,
  TeamMemberOkrRecord,
  TeamMemberPdiItemRecord,
  TeamMemberProfileRecord,
} from '@/lib/types/dashboard'

export const DASHBOARD_STORAGE_KEY = 'nype-dashboard-preferences'

type DashboardTemplateOverrides = Partial<DashboardTemplate>
type ClientRecordOverrides = Partial<ClientRecord> & { integrations?: Partial<DashboardIntegrations> }
type ProductRecordOverrides = Partial<ProductRecord>
type ClientCustomColumnOverrides = Partial<ClientCustomColumnRecord>
type ClientCustomTabOverrides = Partial<ClientCustomTabRecord>
type ClientImplementationPhaseOverrides = Partial<ClientImplementationPhaseRecord>
type ClientTabOverrideOverrides = Partial<ClientTabOverrideRecord>
type OperationCommentOverrides = Partial<OperationCommentRecord>
type OperationSubtaskOverrides = Partial<OperationSubtaskRecord>
type OperationLaneOverrides = Partial<OperationLaneRecord>
type OperationStatusOverrides = Partial<OperationStatusRecord>
type OperationCustomFieldOverrides = Partial<OperationCustomFieldRecord>
type OperationSettingsOverrides = Partial<OperationSettingsRecord>
type TeamMemberOkrOverrides = Partial<TeamMemberOkrRecord>
type TeamMemberPdiOverrides = Partial<TeamMemberPdiItemRecord>
type TeamMemberAllocationOverrides = Partial<TeamMemberAllocationRecord>
type TeamMemberProfileOverrides = Partial<TeamMemberProfileRecord>

export const DEFAULT_OPERATION_LANES: Array<Pick<OperationLaneRecord, 'key' | 'label' | 'color' | 'defaultSubtasks'>> = [
  {
    key: 'setup',
    label: 'Setup de implementação',
    color: '#3b82f6',
    defaultSubtasks: ['Kickoff com o cliente', 'Confirmar acessos e credenciais', 'Definir escopo inicial'],
  },
  {
    key: 'inside_sales',
    label: 'Implementação (Inside Sales)',
    color: '#8b5cf6',
    defaultSubtasks: ['Configurar CRM', 'Treinar time comercial', 'Validar fluxo de comunicação'],
  },
  {
    key: 'ecom',
    label: 'Implementação (Ecom)',
    color: '#10b981',
    defaultSubtasks: ['Validar tracking', 'Revisar checkout', 'Conferir integrações da loja'],
  },
  {
    key: 'pdv',
    label: 'Implementação (PDV)',
    color: '#f59e0b',
    defaultSubtasks: ['Mapear processo de loja', 'Confirmar integrações', 'Planejar captação offline'],
  },
  {
    key: 'ongoing',
    label: 'Ongoing',
    color: '#64748b',
    defaultSubtasks: ['Revisar próximos passos', 'Atualizar responsável', 'Checar pendências da semana'],
  },
]

export const DEFAULT_OPERATION_STATUSES: Array<Pick<OperationStatusRecord, 'key' | 'label' | 'color'>> = [
  { key: 'aberto', label: 'Aberto', color: '#3b82f6' },
  { key: 'em_andamento', label: 'Em andamento', color: '#f59e0b' },
  { key: 'bloqueado', label: 'Bloqueado', color: '#ef4444' },
  { key: 'concluido', label: 'Concluído', color: '#10b981' },
]

export const DEFAULT_OPERATION_TASK_TYPES = ['Tarefa']
export const DEFAULT_OPERATION_CUSTOM_FIELDS: OperationCustomFieldRecord[] = []
export const DEFAULT_CLIENT_DASHBOARD_INTEGRATION_KEYS = [
  'meta_ads',
  'google_ads',
  'tiktok_ads',
  'linkedin_ads',
  'google_sheets',
  'rd_station',
  'salesforce',
  'agendor',
]

export const DEFAULT_CLIENT_IMPLEMENTATION_PHASES: Array<Pick<ClientImplementationPhaseRecord, 'label' | 'description' | 'objective' | 'checklist' | 'slaDays'>> = [
  {
    label: 'Implementação (Inside Sales)',
    description: 'Fase de onboarding comercial com CRM, processo, treinamento e alinhamento da rotina de operação.',
    objective: 'Deixar o time comercial pronto para operar com processo, cadência e indicadores claros.',
    checklist: ['Configurar CRM', 'Treinar time comercial', 'Validar fluxo de comunicação'],
    slaDays: 15,
  },
  {
    label: 'Implementação (Ecom)',
    description: 'Fase de estruturação do e-commerce com tracking, integrações, checkout e validação da operação digital.',
    objective: 'Garantir que a operação de e-commerce entre no ar com tracking, checkout e integrações validados.',
    checklist: ['Validar tracking', 'Revisar checkout', 'Conferir integrações da loja'],
    slaDays: 20,
  },
  {
    label: 'Implementação (PDV)',
    description: 'Fase de implantação focada em loja física, integrações offline, atendimento e captura operacional do PDV.',
    objective: 'Organizar a rotina operacional do PDV para capturar demanda offline e conectar o time interno.',
    checklist: ['Mapear processo de loja', 'Confirmar integrações', 'Planejar captação offline'],
    slaDays: 20,
  },
]

function createOperationTaskCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `OP-${timestamp}-${randomPart}`
}

function normalizeClientCustomColumnOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  return Array.from(new Set(options.map((option) => String(option || '').trim()).filter(Boolean)))
}

function normalizeClientOkrs(okrs: unknown): ClientOkrRecord[] {
  if (!Array.isArray(okrs)) return []

  return okrs.map((okr, index) => ({
    id:
      typeof okr?.id === 'string' && okr.id.trim()
        ? okr.id
        : createRecordId(`okr-${index + 1}`),
    title: String(okr?.title || '').trim(),
    cadence:
      okr?.cadence === 'semanal' ||
      okr?.cadence === 'quinzenal' ||
      okr?.cadence === 'mensal' ||
      okr?.cadence === 'trimestral' ||
      okr?.cadence === 'quadrimestral' ||
      okr?.cadence === 'anual' ||
      okr?.cadence === 'ciclo'
        ? okr.cadence
        : 'mensal',
    cycleDays: String(okr?.cycleDays || '').trim(),
    completed: Boolean(okr?.completed),
  }))
}

function normalizeClientNotes(notes: unknown): ClientNoteRecord[] {
  if (!Array.isArray(notes)) return []

  return notes
    .map((note, index) => ({
      id:
        typeof note?.id === 'string' && note.id.trim()
          ? note.id
          : createRecordId(`note-${index + 1}`),
      body: String(note?.body || '').trim(),
      authorName: String(note?.authorName || '').trim(),
      authorId: String(note?.authorId || '').trim(),
      createdAt: String(note?.createdAt || '').trim(),
    }))
    .filter((note) => note.body)
}

function normalizeImplementationChecklist(items: unknown): ClientChecklistItemRecord[] {
  if (!Array.isArray(items)) return []

  return items.map((item, index) => ({
    id:
      typeof item?.id === 'string' && item.id.trim()
        ? item.id
        : createRecordId(`implementation-item-${index + 1}`),
    label: String(item?.label || '').trim(),
    completed: Boolean(item?.completed),
  })).filter((item) => item.label)
}

function getDefaultImplementationChecklist(salesModel: string): ClientChecklistItemRecord[] {
  const templates: Record<string, string[]> = {
    INSIDE_SALES: [
      'Configuração do CRM',
      'Treinamento da equipe de Inside Sales',
      'Fluxo de comunicação e processos',
      'Acompanhamento de métricas',
    ],
    ECOM: [
      'Integração com a plataforma de e-commerce',
      'Configuração de tracking',
      'Teste de checkout e simulações de compra',
      'Desempenho do site',
    ],
    PDV: [
      'Integração do PDV com ERP/CRM',
      'Tracking no PDV',
      'Simulações de atendimento ao cliente',
      'Sistema de gift card (se aplicável)',
      'Acesso restrito a relatórios de faturamento',
      'Conversões offline implementadas',
    ],
  }

  return (templates[salesModel] || []).map((label, index) => ({
    id: createRecordId(`implementation-item-${salesModel}-${index + 1}`),
    label,
    completed: false,
  }))
}

function normalizeOperationCardTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return Array.from(new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean)))
}

function normalizeOperationUserIds(userIds: unknown): string[] {
  if (!Array.isArray(userIds)) return []
  return Array.from(new Set(userIds.map((userId) => String(userId || '').trim()).filter(Boolean)))
}

function normalizeSubtaskTemplateList(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)))
}

function normalizeOperationSettingTags(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)))
}

function normalizeOperationCustomFieldOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  return Array.from(new Set(options.map((option) => String(option || '').trim()).filter(Boolean)))
}

function normalizeOperationCustomFieldValues(values: unknown): Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [String(key || '').trim(), String(value || '').trim()])
      .filter(([key]) => Boolean(key))
  )
}

function normalizeClientDashboardIntegrationKeys(items: unknown): string[] {
  if (!Array.isArray(items)) return [...DEFAULT_CLIENT_DASHBOARD_INTEGRATION_KEYS]
  const allowedKeys = new Set(DEFAULT_CLIENT_DASHBOARD_INTEGRATION_KEYS)
  const normalized = Array.from(
    new Set(items.map((item) => String(item || '').trim()).filter((item) => allowedKeys.has(item)))
  )
  return normalized.length ? normalized : [...DEFAULT_CLIENT_DASHBOARD_INTEGRATION_KEYS]
}

export function createClientImplementationPhaseRecord(
  overrides: ClientImplementationPhaseOverrides = {}
): ClientImplementationPhaseRecord {
  const label = String(overrides.label || 'Nova fase').trim() || 'Nova fase'
  return {
    id: String(overrides.id || '').trim() || createRecordId('client-implementation-phase'),
    label,
    description: String(overrides.description || '').trim(),
    objective: String(overrides.objective || '').trim(),
    checklist: Array.isArray(overrides.checklist)
      ? Array.from(new Set(overrides.checklist.map((item) => String(item || '').trim()).filter(Boolean)))
      : [],
    slaDays: Number.isFinite(Number(overrides.slaDays)) ? Math.max(0, Number(overrides.slaDays)) : 0,
  }
}

export function createOperationCommentRecord(
  overrides: OperationCommentOverrides = {}
): OperationCommentRecord {
  const now = new Date().toISOString()
  return {
    id: overrides.id || createRecordId('operation-comment'),
    body: String(overrides.body || '').trim(),
    authorName: String(overrides.authorName || '').trim(),
    authorId: String(overrides.authorId || '').trim(),
    kind: overrides.kind === 'activity' ? 'activity' : 'comment',
    activityType: String(overrides.activityType || '').trim(),
    mentionUserIds: normalizeOperationUserIds(overrides.mentionUserIds),
    createdAt: String(overrides.createdAt || now).trim() || now,
  }
}

function normalizeTeamMemberProgressStatus(value: unknown): TeamMemberOkrRecord['status'] {
  return value === 'em_andamento' || value === 'concluido' || value === 'atrasado'
    ? value
    : 'nao_iniciado'
}

function normalizeTeamMemberPdiStatus(value: unknown): TeamMemberPdiItemRecord['status'] {
  return value === 'em_andamento' || value === 'concluido'
    ? value
    : 'planejado'
}

export function createTeamMemberOkrRecord(
  overrides: TeamMemberOkrOverrides = {}
): TeamMemberOkrRecord {
  return {
    id: overrides.id || createRecordId('team-okr'),
    title: String(overrides.title || '').trim(),
    metric: String(overrides.metric || '').trim(),
    targetValue: String(overrides.targetValue || '').trim(),
    currentValue: String(overrides.currentValue || '').trim(),
    unit: String(overrides.unit || '').trim(),
    dueDate: String(overrides.dueDate || '').trim(),
    status: normalizeTeamMemberProgressStatus(overrides.status),
  }
}

export function createTeamMemberPdiItemRecord(
  overrides: TeamMemberPdiOverrides = {}
): TeamMemberPdiItemRecord {
  return {
    id: overrides.id || createRecordId('team-pdi'),
    title: String(overrides.title || '').trim(),
    competency: String(overrides.competency || '').trim(),
    actionPlan: String(overrides.actionPlan || '').trim(),
    dueDate: String(overrides.dueDate || '').trim(),
    status: normalizeTeamMemberPdiStatus(overrides.status),
    notes: String(overrides.notes || '').trim(),
  }
}

export function createTeamMemberAllocationRecord(
  overrides: TeamMemberAllocationOverrides = {}
): TeamMemberAllocationRecord {
  return {
    id: overrides.id || createRecordId('team-allocation'),
    clientId: String(overrides.clientId || '').trim(),
    roleLabel: String(overrides.roleLabel || '').trim(),
    weeklyHours: Number.isFinite(Number(overrides.weeklyHours)) ? Number(overrides.weeklyHours) : 0,
    focusLabel: String(overrides.focusLabel || '').trim(),
  }
}

export function createTeamMemberProfileRecord(
  overrides: TeamMemberProfileOverrides = {}
): TeamMemberProfileRecord {
  return {
    userId: String(overrides.userId || '').trim(),
    positionTitle: String(overrides.positionTitle || '').trim(),
    department: String(overrides.department || '').trim(),
    seniority:
      overrides.seniority === 'junior' ||
      overrides.seniority === 'pleno' ||
      overrides.seniority === 'senior' ||
      overrides.seniority === 'expert'
        ? overrides.seniority
        : 'junior',
    employmentType: String(overrides.employmentType || '').trim(),
    directManagerName: String(overrides.directManagerName || '').trim(),
    employmentStartDate: String(overrides.employmentStartDate || '').trim(),
    monthlyCompensation: String(overrides.monthlyCompensation || '').trim(),
    weeklyCapacityHours: Number.isFinite(Number(overrides.weeklyCapacityHours)) ? Number(overrides.weeklyCapacityHours) : 44,
    careerTrack: String(overrides.careerTrack || '').trim(),
    performanceSummary: String(overrides.performanceSummary || '').trim(),
    nextCareerStep: String(overrides.nextCareerStep || '').trim(),
    okrs: Array.isArray(overrides.okrs) ? overrides.okrs.map((item) => createTeamMemberOkrRecord(item)) : [],
    pdiItems: Array.isArray(overrides.pdiItems) ? overrides.pdiItems.map((item) => createTeamMemberPdiItemRecord(item)) : [],
    allocations: Array.isArray(overrides.allocations) ? overrides.allocations.map((item) => createTeamMemberAllocationRecord(item)) : [],
  }
}

export function createOperationSubtaskRecord(
  overrides: OperationSubtaskOverrides = {}
): OperationSubtaskRecord {
  const now = new Date().toISOString()
  return {
    id: overrides.id || createRecordId('operation-subtask'),
    title: String(overrides.title || 'Nova subtarefa').trim() || 'Nova subtarefa',
    description: String(overrides.description || '').trim(),
    status: String(overrides.status || 'aberto').trim() || 'aberto',
    completed: Boolean(overrides.completed),
    assigneeIds: normalizeOperationUserIds(overrides.assigneeIds),
    createdAt: String(overrides.createdAt || now).trim() || now,
    updatedAt: String(overrides.updatedAt || now).trim() || now,
  }
}

export function createOperationLaneRecord(
  overrides: OperationLaneOverrides = {}
): OperationLaneRecord {
  const label = String(overrides.label || 'Nova coluna').trim() || 'Nova coluna'
  const keySource = String(overrides.key || label || 'nova_coluna')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('operation-lane'),
    key: keySource || createRecordId('operation_lane'),
    label,
    color: String(overrides.color || '#3b82f6').trim() || '#3b82f6',
    defaultSubtasks: normalizeSubtaskTemplateList(overrides.defaultSubtasks),
  }
}

export function createOperationStatusRecord(
  overrides: OperationStatusOverrides = {}
): OperationStatusRecord {
  const label = String(overrides.label || 'Novo status').trim() || 'Novo status'
  const keySource = String(overrides.key || label || 'novo_status')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('operation-status'),
    key: keySource || createRecordId('operation_status'),
    label,
    color: String(overrides.color || '#3b82f6').trim() || '#3b82f6',
  }
}

export function createOperationCustomFieldRecord(
  overrides: OperationCustomFieldOverrides = {}
): OperationCustomFieldRecord {
  const label = String(overrides.label || 'Novo campo').trim() || 'Novo campo'
  const keySource = String(overrides.key || label || 'novo_campo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const type = overrides.type === 'select' || overrides.type === 'date' || overrides.type === 'number'
    ? overrides.type
    : 'text'

  return {
    id: overrides.id || createRecordId('operation-custom-field'),
    key: keySource || createRecordId('operation_custom_field'),
    label,
    type,
    options: type === 'select' ? normalizeOperationCustomFieldOptions(overrides.options) : [],
  }
}

export function createOperationSettingsRecord(
  overrides: OperationSettingsOverrides = {}
): OperationSettingsRecord {
  const lanes = Array.isArray(overrides.lanes) && overrides.lanes.length
    ? overrides.lanes.map((lane) => createOperationLaneRecord(lane))
    : DEFAULT_OPERATION_LANES.map((lane) => createOperationLaneRecord(lane))
  const statuses = Array.isArray(overrides.statuses) && overrides.statuses.length
    ? overrides.statuses.map((status) => createOperationStatusRecord(status))
    : DEFAULT_OPERATION_STATUSES.map((status) => createOperationStatusRecord(status))

  return {
    lanes,
    statuses,
    tags: normalizeOperationSettingTags(overrides.tags),
    taskTypes: normalizeOperationSettingTags(overrides.taskTypes).length
      ? normalizeOperationSettingTags(overrides.taskTypes)
      : [...DEFAULT_OPERATION_TASK_TYPES],
    customFields: Array.isArray(overrides.customFields) && overrides.customFields.length
      ? overrides.customFields.map((field) => createOperationCustomFieldRecord(field))
      : [...DEFAULT_OPERATION_CUSTOM_FIELDS],
    autoCreateCardForNewClient: overrides.autoCreateCardForNewClient !== false,
    healthRiskTargetPercent: Number.isFinite(Number(overrides.healthRiskTargetPercent)) ? Math.min(100, Math.max(0, Number(overrides.healthRiskTargetPercent))) : 20,
  }
}

export function createOperationCardRecord(overrides: Partial<OperationCardRecord> = {}): OperationCardRecord {
  const now = new Date().toISOString()
  return {
    id: overrides.id || createRecordId('operation-card'),
    taskCode: String(overrides.taskCode || createOperationTaskCode()).trim() || createOperationTaskCode(),
    taskType: String(overrides.taskType || DEFAULT_OPERATION_TASK_TYPES[0] || 'Tarefa').trim() || DEFAULT_OPERATION_TASK_TYPES[0] || 'Tarefa',
    clientId: String(overrides.clientId || '').trim(),
    title: String(overrides.title || 'Novo card').trim() || 'Novo card',
    content: String(overrides.content || '').trim(),
    lane: String(overrides.lane || 'setup').trim() || 'setup',
    status: String(overrides.status || 'aberto').trim() || 'aberto',
    priority: overrides.priority === 'baixa' || overrides.priority === 'media' || overrides.priority === 'alta' || overrides.priority === 'urgente'
      ? overrides.priority
      : 'sem_prioridade',
    startDate: String(overrides.startDate || '').trim(),
    dueDate: String(overrides.dueDate || '').trim(),
    timeEstimateMinutes: Number.isFinite(Number(overrides.timeEstimateMinutes)) ? Math.max(0, Number(overrides.timeEstimateMinutes)) : 0,
    timeTrackedMinutes: Number.isFinite(Number(overrides.timeTrackedMinutes)) ? Math.max(0, Number(overrides.timeTrackedMinutes)) : 0,
    timeTrackerStartedAt: String(overrides.timeTrackerStartedAt || '').trim(),
    responsible: String(overrides.responsible || '').trim(),
    assigneeIds: normalizeOperationUserIds(overrides.assigneeIds),
    segment: String(overrides.segment || '').trim(),
    tier: String(overrides.tier || '').trim(),
    squad: String(overrides.squad || '').trim(),
    tags: normalizeOperationCardTags(overrides.tags),
    customFieldValues: normalizeOperationCustomFieldValues(overrides.customFieldValues),
    comments: Array.isArray(overrides.comments)
      ? overrides.comments.map((comment) => createOperationCommentRecord(comment)).filter((comment) => comment.body)
      : [],
    subtasks: Array.isArray(overrides.subtasks)
      ? overrides.subtasks.map((subtask) => createOperationSubtaskRecord(subtask))
      : [],
    createdAt: String(overrides.createdAt || now).trim() || now,
    updatedAt: String(overrides.updatedAt || now).trim() || now,
  }
}

export const DEFAULT_INTEGRATIONS: DashboardIntegrations = {
  metaAccessToken: '',
  metaConnectionMode: 'manual',
  metaAdAccountId: '',
  googleAdsToken: '',
  tiktokAdsToken: '',
  linkedinAdsToken: '',
  clickUpToken: '',
  mondayToken: '',
  rdStationToken: '',
  salesforceToken: '',
  agendorToken: '',
  ...DEFAULT_AI_SETTINGS,
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  themeColor: 'blue',
  metric1: 'spend',
  metric2: 'roas',
  activeClientId: '',
  globalIntegrations: {
    metaAccessToken: '',
    metaConnectionMode: 'manual',
    googleAdsToken: '',
    tiktokAdsToken: '',
    linkedinAdsToken: '',
    clickUpToken: '',
    clickUpListIds: '',
    mondayToken: '',
    mondayBoardIds: '',
    rdStationToken: '',
    salesforceToken: '',
    agendorToken: '',
    ...DEFAULT_AI_SETTINGS,
  },
  clients: [],
  clientGroups: [],
  products: [],
  operationCards: [],
  operationSettings: createOperationSettingsRecord(),
  clientImplementationPhases: DEFAULT_CLIENT_IMPLEMENTATION_PHASES.map((phase) => ({
    id: createRecordId('client-implementation-phase'),
    label: phase.label,
    description: phase.description,
    objective: phase.objective,
    checklist: phase.checklist,
    slaDays: phase.slaDays,
  })),
  clientSystemFields: [],
  clientCustomColumns: [],
  clientCustomTabs: [],
  clientTabOverrides: [],
  teamProfiles: [],
}

export const DEFAULT_DASHBOARD_TEMPLATE_NAME = 'Principal'
const DEFAULT_META_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_META_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
export const DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS = ['spend', 'reach', 'clicks', 'leads', 'cost_per_lead', 'conversionRate']
const LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS = ['spend', 'totalConversions', 'cost_per_lead', 'cpa', 'roas']
const LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_SET = new Set(LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS)
const DEFAULT_RD_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []

function createRecordId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function createClientUidSeed(value: string): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

  return normalized || 'cliente'
}

function createClientUid(name: string, clientId: string): string {
  const suffix = String(clientId || createRecordId('client')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase()
  return `cl_${createClientUidSeed(name)}_${suffix || Date.now().toString(36)}`
}

function resolveClientUid(overrides: ClientRecordOverrides, clientId: string): string {
  const businessData = overrides.customFieldValues && typeof overrides.customFieldValues === 'object' ? overrides.customFieldValues : {}
  return String(
    overrides.customClientId ||
      (overrides as Record<string, unknown>).clientUid ||
      (overrides as Record<string, unknown>).client_uid ||
      (businessData as Record<string, unknown>).customClientId ||
      (businessData as Record<string, unknown>).clientUid ||
      ''
  ).trim() || createClientUid(String(overrides.name || 'Novo cliente'), clientId)
}

function normalizeTemplateMetricKeys(metricKeys: unknown): string[] {
  if (!Array.isArray(metricKeys)) return []
  return Array.from(new Set(metricKeys.filter((metricKey) => typeof metricKey === 'string' && metricKey.trim())))
}

function shouldUseDefaultMetaCampaignTableColumns(normalized: string[]): boolean {
  if (!normalized.length) return true

  const isLegacyDefault =
    normalized.length === LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS.length &&
    normalized.every((columnKey, index) => columnKey === LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS[index])

  if (isLegacyDefault) return true

  const legacyMatchCount = normalized.filter((columnKey) => LEGACY_DEFAULT_META_CAMPAIGN_TABLE_COLUMN_SET.has(columnKey)).length
  const missingCurrentDefaultCount = DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS.filter((columnKey) => !normalized.includes(columnKey)).length
  const hasLegacyFingerprint =
    normalized.includes('totalConversions') ||
    normalized.includes('cpa') ||
    normalized.includes('roas') ||
    legacyMatchCount >= 3

  return hasLegacyFingerprint && (missingCurrentDefaultCount >= 2 || normalized.length > DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS.length + 2)
}

function normalizeMetaCampaignTableColumnKeys(columnKeys: unknown): string[] {
  const normalized = normalizeTemplateMetricKeys(columnKeys)

  if (shouldUseDefaultMetaCampaignTableColumns(normalized)) return [...DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS]
  return normalized
}

function createDashboardMetricLayout(
  metricKey: string,
  overrides: Partial<DashboardMetricLayout> = {}
): DashboardMetricLayout {
  return {
    id: overrides.id || createRecordId('dashboard-card'),
    metricKey,
    size: overrides.size === 'lg' ? 'lg' : 'sm',
  }
}

function normalizeDashboardMetricLayouts(
  layouts: unknown,
  fallbackMetricKeys: string[] = []
): DashboardMetricLayout[] {
  const normalizedLayouts = Array.isArray(layouts)
    ? layouts
        .filter((item) => typeof item?.metricKey === 'string' && item.metricKey.trim())
        .map((item) => createDashboardMetricLayout(item.metricKey, item))
    : []

  if (normalizedLayouts.length > 0) return normalizedLayouts

  if (fallbackMetricKeys === DEFAULT_META_DASHBOARD_METRIC_KEYS) {
    return DEFAULT_META_DASHBOARD_METRIC_LAYOUTS.map((item) =>
      createDashboardMetricLayout(item.metricKey, item)
    )
  }

  if (fallbackMetricKeys === DEFAULT_RD_DASHBOARD_METRIC_KEYS) {
    return DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS.map((item) =>
      createDashboardMetricLayout(item.metricKey, item)
    )
  }

  return normalizeTemplateMetricKeys(fallbackMetricKeys).map((metricKey) => createDashboardMetricLayout(metricKey))
}

export function createDashboardTemplate(overrides: DashboardTemplateOverrides = {}): DashboardTemplate {
  const metaMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.metaMetricLayouts,
    overrides.metaMetricKeys || DEFAULT_META_DASHBOARD_METRIC_KEYS
  )
  const rdMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.rdMetricLayouts,
    overrides.rdMetricKeys || DEFAULT_RD_DASHBOARD_METRIC_KEYS
  )
  const sheetsMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.sheetsMetricLayouts,
    overrides.sheetsMetricKeys || DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS
  )

  return {
    id: createRecordId('dashboard-template'),
    name: DEFAULT_DASHBOARD_TEMPLATE_NAME,
    ...overrides,
    metaMetricKeys: metaMetricLayouts.map((item) => item.metricKey),
    metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(overrides.metaCampaignTableColumnKeys),
    rdMetricKeys: rdMetricLayouts.map((item) => item.metricKey),
    sheetsMetricKeys: sheetsMetricLayouts.map((item) => item.metricKey),
    metaMetricLayouts,
    rdMetricLayouts,
    sheetsMetricLayouts,
  }
}

function normalizeClientGroupClientIds(clientIds: unknown): string[] {
  if (!Array.isArray(clientIds)) return []
  return Array.from(new Set(clientIds.filter((clientId) => typeof clientId === 'string' && clientId.trim())))
}

export function createClientGroupRecord(overrides: Partial<ClientGroupRecord> = {}): ClientGroupRecord {
  return {
    id: overrides.id || createRecordId('client-group'),
    name: String(overrides.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(overrides.clientIds),
  }
}

export function createProductRecord(overrides: ProductRecordOverrides = {}): ProductRecord {
  return {
    id: overrides.id || createRecordId('product'),
    name: String(overrides.name || 'Novo produto').trim() || 'Novo produto',
    description: String(overrides.description || '').trim(),
    status: String(overrides.status || 'Ativo').trim() || 'Ativo',
  }
}

export function createClientCustomColumnRecord(
  overrides: ClientCustomColumnOverrides = {}
): ClientCustomColumnRecord {
  const label = String(overrides.label || 'Nova coluna').trim() || 'Nova coluna'
  const keySource = String(overrides.key || label || 'nova_coluna')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('client-column'),
    key: keySource || createRecordId('client_column'),
    label,
    type: ['text', 'long_text', 'number', 'currency', 'percent', 'date', 'link', 'email', 'phone', 'person', 'progress', 'checkbox', 'flag', 'select', 'formula'].includes(String(overrides.type || 'text'))
      ? overrides.type
      : 'text',
    options: normalizeClientCustomColumnOptions(overrides.options),
    tabKey: String(overrides.tabKey || 'geral').trim() || 'geral',
    formulaExpression: String(overrides.formulaExpression || '').trim(),
    settings:
      overrides.settings && typeof overrides.settings === 'object'
        ? Object.fromEntries(Object.entries(overrides.settings).map(([key, value]) => [key, String(value ?? '')]))
        : {},
  }
}

export function createClientCustomTabRecord(overrides: ClientCustomTabOverrides = {}): ClientCustomTabRecord {
  const label = String(overrides.label || 'Nova aba').trim() || 'Nova aba'
  const keySource = String(overrides.key || label || 'nova_aba')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('client-tab'),
    key: keySource || createRecordId('client_tab'),
    label,
    columnKeys: Array.isArray(overrides.columnKeys) ? overrides.columnKeys.filter(Boolean) : [],
  }
}

export function createClientTabOverrideRecord(overrides: ClientTabOverrideOverrides = {}): ClientTabOverrideRecord {
  return {
    key: String(overrides.key || '').trim(),
    label: String(overrides.label || '').trim(),
  }
}

export function normalizeClientGroupRecord(group: Partial<ClientGroupRecord> | null | undefined): ClientGroupRecord {
  return {
    id: group?.id || createRecordId('client-group'),
    name: String(group?.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(group?.clientIds),
  }
}

export function normalizeDashboardTemplate(
  template: Partial<DashboardTemplate> | null | undefined,
  fallbackName = DEFAULT_DASHBOARD_TEMPLATE_NAME
): DashboardTemplate {
  const metaMetricLayouts = normalizeDashboardMetricLayouts(
    template?.metaMetricLayouts,
    template?.metaMetricKeys || DEFAULT_META_DASHBOARD_METRIC_KEYS
  )
  const rdMetricLayouts = normalizeDashboardMetricLayouts(
    template?.rdMetricLayouts,
    template?.rdMetricKeys || DEFAULT_RD_DASHBOARD_METRIC_KEYS
  )
  const sheetsMetricLayouts = normalizeDashboardMetricLayouts(
    template?.sheetsMetricLayouts,
    template?.sheetsMetricKeys || DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS
  )

  return {
    id: template?.id || createRecordId('dashboard-template'),
    name: String(template?.name || fallbackName).trim() || fallbackName,
    metaMetricKeys: metaMetricLayouts.map((item) => item.metricKey),
    metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(template?.metaCampaignTableColumnKeys),
    rdMetricKeys: rdMetricLayouts.map((item) => item.metricKey),
    sheetsMetricKeys: sheetsMetricLayouts.map((item) => item.metricKey),
    metaMetricLayouts,
    rdMetricLayouts,
    sheetsMetricLayouts,
  }
}

function normalizeClientDashboardTemplates(client: ClientRecordOverrides) {
  const rawTemplates = Array.isArray(client?.dashboardTemplates) ? client.dashboardTemplates : []
  const dashboardTemplates = rawTemplates.length
    ? rawTemplates.map((template, index) =>
        normalizeDashboardTemplate(template, index === 0 ? DEFAULT_DASHBOARD_TEMPLATE_NAME : `Modelo ${index + 1}`)
      )
    : [createDashboardTemplate({ name: DEFAULT_DASHBOARD_TEMPLATE_NAME })]

  const activeDashboardTemplateId = dashboardTemplates.some((template) => template.id === client?.activeDashboardTemplateId)
    ? client.activeDashboardTemplateId
    : dashboardTemplates[0].id

  return {
    dashboardTemplates,
    activeDashboardTemplateId,
  }
}

export function createClientRecord(overrides: ClientRecordOverrides = {}): ClientRecord {
  const { dashboardTemplates, activeDashboardTemplateId } = normalizeClientDashboardTemplates(overrides)
  const normalizedAiSettings = normalizeAiSettings(overrides.integrations || {})
  const clientId = overrides.id || createRecordId('client')
  const customClientId = resolveClientUid(overrides, clientId)
  const rawCrmProvider = String(overrides.crmProvider || (overrides as Record<string, unknown>).crmMode || '').trim()
  const crmProvider = rawCrmProvider.toLowerCase() === 'manual' ? 'manual' : rawCrmProvider

  return {
    id: clientId,
    customClientId,
    name: 'Novo cliente',
    operationEnabled: overrides.operationEnabled !== false,
    dashboardEnabled: overrides.dashboardEnabled !== false,
    dashboardVisibleIntegrationKeys: normalizeClientDashboardIntegrationKeys(overrides.dashboardVisibleIntegrationKeys),
    status: overrides.status || 'Ativo',
    isArchived: Boolean(overrides.isArchived),
    productId: '',
    product: '',
    customFieldValues: {},
    contractSignedAt: '',
    churnDate: '',
    contractUrl: '',
    startDate: '',
    fee: '',
    mediaInvestment: '',
    monthlyRevenue: '',
    step: '',
    ltv: '',
    contributionMarginAmount: '',
    contributionMarginPercent: '',
    profitMarginAmount: '',
    profitMarginPercent: '',
    mmf: '',
    roiMarketing: '',
    dashboardUrl: '',
    driveUrl: '',
    eapUrl: '',
    brandManualUrl: '',
    moodboardUrl: '',
    salesNarrativeUrl: '',
    drawflowUrl: '',
    projectManager: '',
    trafficManager: '',
    resultManagerUserId: '',
    designer: '',
    csOwner: '',
    copyOwner: '',
    trafficQuality: '',
    designQuality: '',
    copyQuality: '',
    csQuality: '',
    roiAboveOne: '',
    csatAboveFour: '',
    npsAboveSeven: '',
    stakeholderAware: '',
    adAccountsHealthy: '',
    crmUsageProperly: '',
    clientParticipationAbove90: '',
    organicDemands: '',
    trafficDemands: '',
    totalDemands: '',
    financialFlag: 'na',
    roiFlag: 'na',
    healthScoreFlag: 'na',
    deliverablesFlag: 'na',
    crmUsageFlag: 'na',
    csAttendanceFlag: 'na',
    csatFlag: 'na',
    clientParticipationFlag: 'na',
    adAccountsFlag: 'na',
    npsFlag: 'na',
    stakeholderFlag: 'na',
    dashboardColor: 'blue',
    logoUrl: '',
    balanceAlertsEnabled: true,
    metaAdAccountId: '',
    googleAdsAccountId: '',
    tiktokAdsAccountId: '',
    linkedInAdsAccountId: '',
    googleSheetsUrl: '',
    rdStationAccountId: '',
    rdPipelineId: '',
    salesforceAccountId: '',
    agendorAccountId: '',
    rdQualifiedStages: [],
    funnelSteps: ['impressions', 'clicks', 'leads', 'purchases'],
    ...overrides,
    cnpj: String(overrides.cnpj || '').trim(),
    segment: String(overrides.segment || '').trim(),
    subsegment: String(overrides.subsegment || '').trim(),
    tier: String(overrides.tier || '').trim(),
    squad: String(overrides.squad || '').trim(),
    salesModel: String(overrides.salesModel || '').trim(),
    implementationPhase: String(overrides.implementationPhase || '').trim(),
    implementationObservation: String(overrides.implementationObservation || '').trim(),
    implementationChecklist: (() => {
      const normalizedChecklist = normalizeImplementationChecklist(overrides.implementationChecklist)
      if (normalizedChecklist.length > 0) return normalizedChecklist
      const salesModel = String(overrides.salesModel || '').trim()
      return salesModel ? getDefaultImplementationChecklist(salesModel) : []
    })(),
    okrs: normalizeClientOkrs(overrides.okrs),
    notes: normalizeClientNotes(overrides.notes),
    googleSheetsHeaderRow: Number.isFinite(Number(overrides.googleSheetsHeaderRow)) && Number(overrides.googleSheetsHeaderRow) > 0
      ? Number(overrides.googleSheetsHeaderRow)
      : 1,
    googleSheetsStatusColumn: String(overrides.googleSheetsStatusColumn || '').trim(),
    crmProvider,
    manualCrmSummary: overrides.manualCrmSummary || {},
    ecommerceEnabled: Boolean(overrides.ecommerceEnabled),
    integrations: {
      ...DEFAULT_INTEGRATIONS,
      ...overrides.integrations,
      ...normalizedAiSettings,
    },
    dashboardTemplates,
    activeDashboardTemplateId,
  }
}

export function loadDashboardPreferences(): DashboardPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PREFERENCES
    }

    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>
    const normalizedAiSettings = normalizeAiSettings(parsed.globalIntegrations || {})

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      globalIntegrations: {
        ...DEFAULT_PREFERENCES.globalIntegrations,
        ...parsed.globalIntegrations,
        ...normalizedAiSettings,
      },
      clients: Array.isArray(parsed.clients)
        ? parsed.clients.map((client) => createClientRecord(client))
        : [],
      clientGroups: Array.isArray(parsed.clientGroups)
        ? parsed.clientGroups.map((group) => normalizeClientGroupRecord(group))
        : [],
      products: Array.isArray(parsed.products)
        ? parsed.products.map((product) => createProductRecord(product))
        : [],
      operationCards: Array.isArray(parsed.operationCards)
        ? parsed.operationCards.map((card) => createOperationCardRecord(card))
        : [],
      operationSettings: createOperationSettingsRecord(parsed.operationSettings),
      clientImplementationPhases: Array.isArray(parsed.clientImplementationPhases) && parsed.clientImplementationPhases.length
        ? parsed.clientImplementationPhases
            .map((phase) => createClientImplementationPhaseRecord(phase))
            .filter((phase) => phase.label)
        : DEFAULT_PREFERENCES.clientImplementationPhases,
      clientSystemFields: Array.isArray(parsed.clientSystemFields)
        ? parsed.clientSystemFields.map((column) => createClientCustomColumnRecord(column))
        : [],
      clientCustomColumns: Array.isArray(parsed.clientCustomColumns)
        ? parsed.clientCustomColumns.map((column) => createClientCustomColumnRecord(column))
        : [],
      clientCustomTabs: Array.isArray(parsed.clientCustomTabs)
        ? parsed.clientCustomTabs.map((tab) => createClientCustomTabRecord(tab))
        : [],
      clientTabOverrides: Array.isArray(parsed.clientTabOverrides)
        ? parsed.clientTabOverrides.map((tab) => createClientTabOverrideRecord(tab)).filter((tab) => tab.key && tab.label)
        : [],
      teamProfiles: Array.isArray(parsed.teamProfiles)
        ? parsed.teamProfiles.map((profile) => createTeamMemberProfileRecord(profile))
        : [],
    }
  } catch (error) {
    console.error('Erro ao carregar preferências do dashboard:', error)
    return DEFAULT_PREFERENCES
  }
}

export function saveDashboardPreferences(preferences: DashboardPreferences): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(preferences))
  } catch (error) {
    console.error('Erro ao salvar preferências do dashboard:', error)
  }
}
