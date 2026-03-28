import { normalizeAiSettings, resolveAiDashboardPromptText } from '@/lib/ai-config'
import { fetchMetaJson } from '@/lib/server/meta-fetch'
import { buildMetaInsightsFilterExpression } from '@/lib/server/meta-date-range'
import { getWorkspaceMetaConnection } from '@/lib/server/meta-connection'
import { readClickUpSummary } from '@/lib/server/clickup'
import { readMondaySummary } from '@/lib/server/monday'
import { extractMetaCampaignMetrics } from '@/lib/meta-metrics'
import type {
  AiSettings,
  AssistantContextSnapshot,
  AssistantMessage,
  AssistantReplyResult,
} from '@/lib/types/ai'

type LooseRecord = Record<string, any>

interface ConversationMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

interface AccessContextLike {
  workspaceId?: string | null
  role?: string | null
}

interface ClientLike {
  id?: string
  name?: string
  metaAdAccountId?: string
  googleSheetsUrl?: string
  rdPipelineId?: string
  rdQualifiedStages?: string[]
  funnelSteps?: string[]
}

interface ClientGroupLike {
  id?: string
  name?: string
  clientIds?: string[]
}

interface DashboardStateLike {
  clients?: ClientLike[]
  activeClientId?: string
  clientGroups?: ClientGroupLike[]
  globalIntegrations?: LooseRecord
}

interface CampaignSnapshotCampaign {
  id: string
  name: string
  status: string
  objective: string
  health: 'positive' | 'attention' | 'urgent'
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  purchases: number
  leads: number
  messages: number
  totalConversions: number
  costPerPurchase: number
  costPerLead: number
  costPerMessage: number
  roas: number
  primaryConversionType: string
}

interface CampaignSnapshot {
  period: string
  campaignCount: number
  totals: {
    spend: number
    purchases: number
    leads: number
    messages: number
    conversions: number
  }
  campaigns: CampaignSnapshotCampaign[]
}

interface ClickUpOperationSnapshot {
  listsConfigured: number
  totalTasks: number
  openTasks: number
  completedTasks: number
  blockedTasks: number
  overdueTasks: number
  dueSoonTasks: number
  unassignedTasks: number
  topStatuses: Array<{
    label: string
    count: number
  }>
  topAssignees: Array<{
    name: string
    totalTasks: number
    openTasks: number
    overdueTasks: number
  }>
  topLists: Array<{
    label: string
    totalTasks: number
    blockedCount: number
    overdueCount: number
  }>
}

interface MondayOperationSnapshot {
  boardsConfigured: number
  totalItems: number
  activeItems: number
  doneItems: number
  blockedItems: number
  overdueItems: number
  dueSoonItems: number
  unassignedItems: number
  trackedSecondsTotal: number
  activeOwnersCount: number
  topStatus: null | {
    label: string
    count: number
  }
  topOverdueOwner: null | {
    name: string
    overdueItems: number
    totalItems: number
  }
  topLongestTask: null | {
    name: string
    trackedSeconds: number
  }
  topBoards: Array<{
    label: string
    totalItems: number
    blockedCount: number
    overdueCount: number
  }>
  topGroups: Array<{
    label: string
    totalItems: number
    blockedCount: number
    overdueCount: number
  }>
}

interface OperationSnapshot {
  clickup: ClickUpOperationSnapshot | null
  monday: MondayOperationSnapshot | null
}

interface BusinessContext {
  workspaceId: string
  role: string
  focus: {
    mode: 'operation' | 'clients' | 'general'
    label: string
  }
  activeClientId: string
  selectedClient: null | {
    id?: string
    name?: string
    metaAdAccountId: string
    googleSheetsUrl: string
    rdPipelineId: string
    rdQualifiedStages: string[]
    funnelSteps: string[]
    integrations: {
      hasMetaAdAccount: boolean
      hasSheets: boolean
      hasRdPipeline: boolean
    }
  }
  clients: Array<{
    id?: string
    name?: string
    metaAdAccountId: string
    hasSheets: boolean
    hasRdPipeline: boolean
  }>
  clientGroups: Array<{
    id?: string
    name?: string
    clientCount: number
  }>
  globalIntegrations: {
    aiProvider: string
    metaConnectionMode: string
    hasMetaToken: boolean
    hasRdToken: boolean
    hasClickUpToken: boolean
    hasMondayToken: boolean
  }
  campaignSnapshot: CampaignSnapshot | null
  operationSnapshot: OperationSnapshot | null
  contextSnapshot: AssistantContextSnapshot | null
}

interface ChatRequestConfig {
  config: Partial<AiSettings> | LooseRecord | null | undefined
  adminSupabase: unknown
  dashboardState: DashboardStateLike
  accessContext: AccessContextLike
  clientId: string
  contextSnapshot: AssistantContextSnapshot | null
  messages: AssistantMessage[]
}

interface ProviderRequestResult {
  content: string
  usage: unknown
}

function trimTrailingSlash(value: unknown): string {
  return String(value || '').replace(/\/+$/, '')
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text' && typeof item.text === 'string') return item.text
        if (item?.type === 'output_text' && typeof item.text === 'string') return item.text
        if (item?.text && typeof item.text?.value === 'string') return item.text.value
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        if (typeof item?.value === 'string') return item.value
        if (typeof item?.output_text === 'string') return item.output_text
        return ''
      })
      .join('\n')
      .trim()
  }

  if (content && typeof content === 'object') {
    const contentRecord = content as LooseRecord
    if (Array.isArray(contentRecord.content)) return normalizeMessageContent(contentRecord.content)
    if (typeof contentRecord.text === 'string') return contentRecord.text.trim()
    if (contentRecord.text && typeof contentRecord.text?.value === 'string') return contentRecord.text.value.trim()
    if (typeof contentRecord.content === 'string') return contentRecord.content.trim()
    if (typeof contentRecord.value === 'string') return contentRecord.value.trim()
    if (typeof contentRecord.output_text === 'string') return contentRecord.output_text.trim()
  }

  return ''
}

function collectTextSnippets(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return []
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? [normalized] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextSnippets(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['role', 'type', 'finish_reason', 'index', 'id', 'object'].includes(key))
      .flatMap(([, item]) => collectTextSnippets(item, depth + 1))
  }

  return []
}

function formatProviderErrorMessage(errorBody: LooseRecord | null | undefined, fallbackMessage: string): string {
  const nestedError = errorBody?.error
  const providerMessage =
    (typeof nestedError === 'string' ? nestedError : nestedError?.message) ||
    nestedError?.code ||
    errorBody?.message ||
    errorBody?.detail ||
    (errorBody?.status === 'failed' ? 'A resposta da IA falhou antes de gerar conteúdo.' : '') ||
    fallbackMessage

  return String(providerMessage || fallbackMessage).trim()
}

function shouldRetryWithCompatiblePayload(errorBody: LooseRecord | null | undefined): boolean {
  const message = formatProviderErrorMessage(errorBody, '').toLowerCase()

  return (
    message.includes('unsupported parameter') ||
    message.includes('not supported with this model') ||
    message.includes('max_completion_tokens') ||
    message.includes('max_tokens') ||
    message.includes('temperature')
  )
}

async function postChatCompletion(baseUrl: string, apiKey: string, body: LooseRecord) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function postOpenAiResponse(baseUrl: string, apiKey: string, body: LooseRecord) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function getOpenAiResponse(baseUrl: string, apiKey: string, responseId: string) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/responses/${responseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

async function postAnthropicMessage(baseUrl: string, apiKey: string, body: LooseRecord) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const responseBody = await response.json().catch(() => null)

  return { response, responseBody }
}

function extractOpenAiCompatibleContent(responseBody: LooseRecord | null | undefined): string {
  const choices = Array.isArray(responseBody?.choices) ? responseBody.choices : []
  const choicesContent = choices
    .map((choice) =>
      normalizeMessageContent(choice?.message?.content) ||
      normalizeMessageContent(choice?.message) ||
      normalizeMessageContent(choice?.delta?.content) ||
      normalizeMessageContent(choice?.delta) ||
      normalizeMessageContent(choice?.text) ||
      normalizeMessageContent(choice?.content)
    )
    .filter(Boolean)
    .join('\n')
    .trim()

  return (
    choicesContent ||
    normalizeMessageContent(responseBody?.output_text) ||
    normalizeMessageContent(responseBody?.content) ||
    collectTextSnippets(responseBody?.choices || responseBody).join('\n').trim() ||
    ''
  )
}

function extractOpenAiResponsesContent(responseBody: LooseRecord | null | undefined): string {
  return (
    normalizeMessageContent(responseBody?.output_text) ||
    normalizeMessageContent(responseBody?.output?.[0]?.content) ||
    normalizeMessageContent(responseBody?.output?.[0]?.content?.[0]?.text) ||
    normalizeMessageContent(responseBody?.content) ||
    collectTextSnippets(responseBody?.output || responseBody).join('\n').trim() ||
    ''
  )
}

function extractAnthropicContent(responseBody: LooseRecord | null | undefined): string {
  if (!Array.isArray(responseBody?.content)) return ''

  return responseBody.content
    .map((item) => (item?.type === 'text' && typeof item.text === 'string' ? item.text : ''))
    .join('\n')
    .trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeConversationMessages(messages: AssistantMessage[]): ConversationMessage[] {
  if (!Array.isArray(messages)) return []

  return messages
    .map((message) => ({
      role: (message?.role === 'assistant' ? 'assistant' : 'user') as ConversationMessage['role'],
      content: String(message?.content || '').trim(),
    }))
    .filter((message) => message.content)
    .slice(-12)
}

function normalizeFocusMode(value: unknown): BusinessContext['focus']['mode'] {
  return ['operation', 'clients', 'general'].includes(String(value || ''))
    ? (String(value) as BusinessContext['focus']['mode'])
    : 'operation'
}

function resolveClientMentionFromMessages(
  clients: ClientLike[],
  messages: AssistantMessage[]
): ClientLike | null {
  if (!Array.isArray(clients) || !clients.length || !Array.isArray(messages) || !messages.length) return null

  const recentConversation = messages
    .slice(-6)
    .map((message) => String(message?.content || '').toLowerCase())
    .join('\n')

  if (!recentConversation.trim()) return null

  const candidates = clients
    .map((client) => ({
      client,
      normalizedName: String(client?.name || '').trim().toLowerCase(),
    }))
    .filter((item) => item.normalizedName.length >= 3 && recentConversation.includes(item.normalizedName))
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length)

  return candidates[0]?.client || null
}

function normalizeCampaignHealth(metrics: LooseRecord): CampaignSnapshotCampaign['health'] {
  if ((metrics.purchases || 0) > 0 || (metrics.roas || 0) >= 2) return 'positive'
  if ((metrics.spend || 0) > 0 && (metrics.totalConversions || 0) === 0) return 'urgent'
  return 'attention'
}

function toPositiveNumber(value: unknown): number {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function toTrackedHoursLabel(seconds: unknown): string {
  const totalSeconds = toPositiveNumber(seconds)
  if (totalSeconds <= 0) return '0h'
  const hours = totalSeconds / 3600
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`
}

function normalizeClickUpOperationSnapshot(summary: LooseRecord | null | undefined): ClickUpOperationSnapshot | null {
  if (!summary || typeof summary !== 'object') return null

  const statusCounts = Array.isArray(summary.statusSummary?.counts) ? summary.statusSummary.counts : []
  const assigneeRanking = Array.isArray(summary.assigneeRanking) ? summary.assigneeRanking : []
  const listSummary = Array.isArray(summary.listSummary) ? summary.listSummary : []

  return {
    listsConfigured: toPositiveNumber(summary.listsConfigured),
    totalTasks: toPositiveNumber(summary.totalTasks),
    openTasks: toPositiveNumber(summary.openTasks),
    completedTasks: toPositiveNumber(summary.completedTasks),
    blockedTasks: toPositiveNumber(summary.blockedTasks),
    overdueTasks: toPositiveNumber(summary.overdueTasks),
    dueSoonTasks: toPositiveNumber(summary.dueSoonTasks),
    unassignedTasks: toPositiveNumber(summary.unassignedTasks),
    topStatuses: statusCounts.slice(0, 4).map((item) => ({
      label: String(item?.label || 'Sem status'),
      count: toPositiveNumber(item?.count),
    })),
    topAssignees: assigneeRanking.slice(0, 4).map((item) => ({
      name: String(item?.name || 'Sem nome'),
      totalTasks: toPositiveNumber(item?.totalTasks),
      openTasks: toPositiveNumber(item?.openTasks),
      overdueTasks: toPositiveNumber(item?.overdueTasks),
    })),
    topLists: listSummary.slice(0, 4).map((item) => ({
      label: String(item?.label || 'Lista'),
      totalTasks: toPositiveNumber(item?.totalTasks),
      blockedCount: toPositiveNumber(item?.blockedCount),
      overdueCount: toPositiveNumber(item?.overdueCount),
    })),
  }
}

function normalizeMondayOperationSnapshot(summary: LooseRecord | null | undefined): MondayOperationSnapshot | null {
  if (!summary || typeof summary !== 'object') return null

  const boardSummary = Array.isArray(summary.boardSummary) ? summary.boardSummary : []
  const groupSummary = Array.isArray(summary.groupSummary) ? summary.groupSummary : []

  return {
    boardsConfigured: toPositiveNumber(summary.boardsConfigured),
    totalItems: toPositiveNumber(summary.totalItems),
    activeItems: toPositiveNumber(summary.activeItems),
    doneItems: toPositiveNumber(summary.doneItems),
    blockedItems: toPositiveNumber(summary.blockedItems),
    overdueItems: toPositiveNumber(summary.overdueItems),
    dueSoonItems: toPositiveNumber(summary.dueSoonItems),
    unassignedItems: toPositiveNumber(summary.unassignedItems),
    trackedSecondsTotal: toPositiveNumber(summary.trackedSecondsTotal),
    activeOwnersCount: toPositiveNumber(summary.activeOwnersCount),
    topStatus: summary.topStatus
      ? {
          label: String(summary.topStatus.label || 'Sem status'),
          count: toPositiveNumber(summary.topStatus.count),
        }
      : null,
    topOverdueOwner: summary.topOverdueOwner
      ? {
          name: String(summary.topOverdueOwner.name || 'Sem nome'),
          overdueItems: toPositiveNumber(summary.topOverdueOwner.overdueItems),
          totalItems: toPositiveNumber(summary.topOverdueOwner.totalItems),
        }
      : null,
    topLongestTask: summary.topLongestTask
      ? {
          name: String(summary.topLongestTask.name || 'Sem nome'),
          trackedSeconds: toPositiveNumber(summary.topLongestTask.trackedSeconds),
        }
      : null,
    topBoards: boardSummary.slice(0, 4).map((item) => ({
      label: String(item?.label || 'Board'),
      totalItems: toPositiveNumber(item?.totalItems),
      blockedCount: toPositiveNumber(item?.blockedCount),
      overdueCount: toPositiveNumber(item?.overdueCount),
    })),
    topGroups: groupSummary.slice(0, 4).map((item) => ({
      label: String(item?.label || 'Grupo'),
      totalItems: toPositiveNumber(item?.totalItems),
      blockedCount: toPositiveNumber(item?.blockedCount),
      overdueCount: toPositiveNumber(item?.overdueCount),
    })),
  }
}

async function fetchOperationSnapshot(globalIntegrations: LooseRecord | null | undefined): Promise<OperationSnapshot | null> {
  const clickUpToken = String(globalIntegrations?.clickUpToken || '').trim()
  const clickUpListIds = String(globalIntegrations?.clickUpListIds || '').trim()
  const mondayToken = String(globalIntegrations?.mondayToken || '').trim()
  const mondayBoardIds = String(globalIntegrations?.mondayBoardIds || '').trim()

  const [clickupResult, mondayResult] = await Promise.all([
    clickUpToken && clickUpListIds
      ? readClickUpSummary({ token: clickUpToken, listIds: clickUpListIds }).catch(() => null)
      : Promise.resolve(null),
    mondayToken && mondayBoardIds
      ? readMondaySummary({ token: mondayToken, boardIds: mondayBoardIds, since: '', until: '', owner: '' }).catch(() => null)
      : Promise.resolve(null),
  ])

  const snapshot = {
    clickup: normalizeClickUpOperationSnapshot(clickupResult),
    monday: normalizeMondayOperationSnapshot(mondayResult),
  }

  return snapshot.clickup || snapshot.monday ? snapshot : null
}

async function fetchClientCampaignSnapshot({
  adminSupabase,
  dashboardState,
  accessContext,
  selectedClient,
}: {
  adminSupabase: unknown
  dashboardState: DashboardStateLike
  accessContext: AccessContextLike
  selectedClient: ClientLike | null
}): Promise<CampaignSnapshot | null> {
  if (!selectedClient?.metaAdAccountId) return null

  const manualToken = String(dashboardState?.globalIntegrations?.metaAccessToken || '').trim()
  const connection = await getWorkspaceMetaConnection(adminSupabase, accessContext.workspaceId).catch(() => null)
  const accessToken = manualToken || connection?.access_token || ''

  if (!accessToken) return null

  const adAccountId = String(selectedClient.metaAdAccountId || '').trim()
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const timeFilter = buildMetaInsightsFilterExpression('last_7d')
  const campaignsUrl = `https://graph.facebook.com/v19.0/${id}/campaigns?fields=id,name,status,objective,${timeFilter}{spend,reach,impressions,cpc,actions,action_values,cost_per_action_type,video_play_actions,video_p25_watched_actions,video_thruplay_watched_actions}&limit=12&access_token=${accessToken}`

  const data = await fetchMetaJson(
    campaignsUrl,
    'A Meta demorou para responder ao carregar as campanhas do assistente.'
  ).catch(() => null)

  const campaigns = Array.isArray(data?.data) ? data.data : []
  if (!campaigns.length) return null

  const normalizedCampaigns = campaigns
    .map((campaign) => {
      const metrics = extractMetaCampaignMetrics(campaign)
      return {
        id: campaign?.id || '',
        name: campaign?.name || 'Campanha sem nome',
        status: campaign?.status || '',
        objective: campaign?.objective || '',
        health: normalizeCampaignHealth(metrics),
        spend: metrics.spend || 0,
        impressions: metrics.impressions || 0,
        clicks: metrics.clicks || 0,
        ctr: metrics.ctr || 0,
        cpc: metrics.cpc || 0,
        purchases: metrics.purchases || 0,
        leads: metrics.leads || 0,
        messages: metrics.messages || 0,
        totalConversions: metrics.totalConversions || 0,
        costPerPurchase: metrics.cost_per_purchase || 0,
        costPerLead: metrics.cost_per_lead || 0,
        costPerMessage: metrics.cost_per_message || 0,
        roas: metrics.roas || 0,
        primaryConversionType: metrics.primaryConversionType || 'Nenhuma',
      }
    })
    .filter((campaign) => campaign.spend > 0)
    .sort((left, right) => right.spend - left.spend)

  if (!normalizedCampaigns.length) return null

  const totals = normalizedCampaigns.reduce(
    (accumulator, campaign) => ({
      spend: accumulator.spend + campaign.spend,
      purchases: accumulator.purchases + campaign.purchases,
      leads: accumulator.leads + campaign.leads,
      messages: accumulator.messages + campaign.messages,
      conversions: accumulator.conversions + campaign.totalConversions,
    }),
    { spend: 0, purchases: 0, leads: 0, messages: 0, conversions: 0 }
  )

  return {
    period: 'last_7d',
    campaignCount: normalizedCampaigns.length,
    totals,
    campaigns: normalizedCampaigns,
  }
}

async function buildBusinessContext({
  adminSupabase,
  dashboardState,
  accessContext,
  clientId,
  contextSnapshot,
  messages,
}: {
  adminSupabase: unknown
  dashboardState: DashboardStateLike
  accessContext: AccessContextLike
  clientId: string
  contextSnapshot: AssistantContextSnapshot | null
  messages: AssistantMessage[]
}): Promise<BusinessContext> {
  const clients = Array.isArray(dashboardState?.clients) ? dashboardState.clients : []
  const focusMode = normalizeFocusMode(contextSnapshot?.focusMode)
  const mentionedClient = resolveClientMentionFromMessages(clients, messages)
  const selectedClient =
    clients.find((client) => client.id === clientId) ||
    mentionedClient ||
    (focusMode === 'operation'
      ? clients.find((client) => client.id === dashboardState?.activeClientId) || clients[0] || null
      : null)
  const clientCampaignSnapshot = await fetchClientCampaignSnapshot({
    adminSupabase,
    dashboardState,
    accessContext,
    selectedClient,
  })
  const operationSnapshot = await fetchOperationSnapshot(dashboardState?.globalIntegrations)

  return {
    workspaceId: accessContext.workspaceId || '',
    role: accessContext.role || '',
    focus: {
      mode: focusMode,
      label:
        focusMode === 'clients'
          ? 'Clientes'
          : focusMode === 'general'
            ? 'Geral'
            : 'Operação',
    },
    activeClientId: dashboardState?.activeClientId || '',
    selectedClient: selectedClient
      ? {
          id: selectedClient.id,
          name: selectedClient.name,
          metaAdAccountId: selectedClient.metaAdAccountId || '',
          googleSheetsUrl: selectedClient.googleSheetsUrl || '',
          rdPipelineId: selectedClient.rdPipelineId || '',
          rdQualifiedStages: Array.isArray(selectedClient.rdQualifiedStages) ? selectedClient.rdQualifiedStages : [],
          funnelSteps: Array.isArray(selectedClient.funnelSteps) ? selectedClient.funnelSteps : [],
          integrations: {
            hasMetaAdAccount: Boolean(selectedClient.metaAdAccountId),
            hasSheets: Boolean(String(selectedClient.googleSheetsUrl || '').trim()),
            hasRdPipeline: Boolean(selectedClient.rdPipelineId),
          },
        }
      : null,
    clients: clients.slice(0, 25).map((client) => ({
      id: client.id,
      name: client.name,
      metaAdAccountId: client.metaAdAccountId || '',
      hasSheets: Boolean(String(client.googleSheetsUrl || '').trim()),
      hasRdPipeline: Boolean(client.rdPipelineId),
    })),
    clientGroups: Array.isArray(dashboardState?.clientGroups)
      ? dashboardState.clientGroups.slice(0, 20).map((group) => ({
          id: group.id,
          name: group.name,
          clientCount: Array.isArray(group.clientIds) ? group.clientIds.length : 0,
        }))
      : [],
    globalIntegrations: {
      aiProvider: dashboardState?.globalIntegrations?.aiProvider || '',
      metaConnectionMode: dashboardState?.globalIntegrations?.metaConnectionMode || 'manual',
      hasMetaToken: Boolean(String(dashboardState?.globalIntegrations?.metaAccessToken || '').trim()),
      hasRdToken: Boolean(String(dashboardState?.globalIntegrations?.rdStationToken || '').trim()),
      hasClickUpToken: Boolean(String(dashboardState?.globalIntegrations?.clickUpToken || '').trim()),
      hasMondayToken: Boolean(String(dashboardState?.globalIntegrations?.mondayToken || '').trim()),
    },
    campaignSnapshot: clientCampaignSnapshot,
    operationSnapshot,
    contextSnapshot: contextSnapshot && typeof contextSnapshot === 'object' ? contextSnapshot : null,
  }
}

function buildAssistantMessages({
  systemPrompt,
  businessContext,
  messages,
}: {
  systemPrompt: string
  businessContext: BusinessContext
  messages: AssistantMessage[]
}): ConversationMessage[] {
  const conversationMessages = sanitizeConversationMessages(messages)

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'system',
      content: [
        'Contexto interno do negocio abaixo. Use este contexto como fonte principal.',
        'Se alguma informacao nao estiver presente, diga claramente que o dado nao esta disponivel no contexto atual.',
        'Nao invente metricas nem fatos.',
        '',
        JSON.stringify(businessContext, null, 2),
      ].join('\n'),
    },
    ...conversationMessages,
  ]
}

function buildAssistantSystemPrompt(aiDashboardPrompt: string): string {
  const dashboardPrompt = resolveAiDashboardPromptText(aiDashboardPrompt)

  return [
    'Voce e o Assistente do Negocio dentro do app Nype.',
    'Sua funcao e conversar com o usuario sobre clientes, operacao, marketing, campanhas, funil, CRM e dados internos do workspace.',
    'Priorize respostas objetivas, claras e acionaveis em portugues do Brasil.',
    'Quando fizer sentido, estruture em blocos curtos: diagnostico, causa provavel, impacto e proximo passo.',
    'Se o usuario pedir comparacoes, organize por cliente, campanha, area ou prioridade.',
    'Quando o usuario pedir um resumo executivo, destaque: pontos positivos, pontos de atencao e urgencias.',
    'Respeite o foco selecionado no contexto: operacao, clientes ou geral.',
    'Quando houver campaignSnapshot no contexto e o usuario perguntar sobre campanhas, responda campanha por campanha antes do resumo final.',
    'Quando houver operationSnapshot no contexto e o usuario perguntar sobre operacao, rotina, gargalos, Monday ou ClickUp, use esses dados explicitamente na resposta.',
    'Ao falar de operacao, prefira o formato: area, leitura, impacto e direcionamento.',
    'Ao falar de campanhas, prefira o formato: campanha, leitura, impacto e direcionamento.',
    'Se houver dados de Monday e ClickUp ao mesmo tempo, cruze prioridades, bloqueios, atrasos e carga operacional para apontar onde agir primeiro.',
    'Quando houver gargalos operacionais claros, feche com uma priorizacao curta: positivo, atencao e urgencia.',
    'Voce ainda nao possui navegacao web ativa neste fluxo, entao nao afirme dados externos em tempo real como se tivesse pesquisado.',
    '',
    'Playbook de analise ja configurado no app:',
    dashboardPrompt,
  ].join('\n')
}

async function requestOpenAiChat(
  normalizedConfig: AiSettings,
  messages: ConversationMessage[]
): Promise<ProviderRequestResult> {
  const attemptBodies = [
    {
      model: normalizedConfig.aiModel,
      temperature: 0.4,
      max_completion_tokens: 1600,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      max_completion_tokens: 1600,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      max_tokens: 1600,
      messages,
    },
    {
      model: normalizedConfig.aiModel,
      messages,
    },
  ]

  let response = null
  let responseBody = null

  for (let index = 0; index < attemptBodies.length; index += 1) {
    const attempt = await postChatCompletion(
      normalizedConfig.aiBaseUrl,
      normalizedConfig.aiApiKey,
      attemptBodies[index]
    )

    response = attempt.response
    responseBody = attempt.responseBody

    if (response.ok) break

    const canRetry =
      index < attemptBodies.length - 1 &&
      response.status >= 400 &&
      response.status < 500 &&
      shouldRetryWithCompatiblePayload(responseBody)

    if (!canRetry) break
  }

  if (!response?.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar a resposta do assistente com a IA configurada.'
      )
    )
  }

  const content = extractOpenAiCompatibleContent(responseBody)

  if (content) {
    return {
      content,
      usage: responseBody?.usage || null,
    }
  }

  const nativeAttempt = await postOpenAiResponse(normalizedConfig.aiBaseUrl, normalizedConfig.aiApiKey, {
    model: normalizedConfig.aiModel,
    reasoning: { effort: 'low' },
    input: messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n'),
    background: false,
  })

  if (!nativeAttempt.response.ok) {
    throw new Error(
      formatProviderErrorMessage(
        nativeAttempt.responseBody,
        'Nao foi possivel gerar a resposta do assistente com a IA configurada.'
      )
    )
  }

  let nativeBody = nativeAttempt.responseBody
  let nativeContent = extractOpenAiResponsesContent(nativeBody)

  if (!nativeContent && nativeBody?.id) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(700)
      const followUp = await getOpenAiResponse(
        normalizedConfig.aiBaseUrl,
        normalizedConfig.aiApiKey,
        nativeBody.id
      )

      if (!followUp.response.ok) break

      nativeBody = followUp.responseBody
      nativeContent = extractOpenAiResponsesContent(nativeBody)
      if (nativeContent) break
    }
  }

  if (!nativeContent) {
    throw new Error('A IA respondeu sem conteúdo textual para o assistente.')
  }

  return {
    content: nativeContent,
    usage: nativeBody?.usage || null,
  }
}

async function requestAnthropicChat(
  normalizedConfig: AiSettings,
  systemPrompt: string,
  messages: ConversationMessage[]
): Promise<ProviderRequestResult> {
  const userMessage = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistente' : 'Usuario'}:\n${message.content}`)
    .join('\n\n')

  let { response, responseBody } = await postAnthropicMessage(
    normalizedConfig.aiBaseUrl,
    normalizedConfig.aiApiKey,
    {
      model: normalizedConfig.aiModel,
      max_tokens: 1600,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }
  )

  if (!response.ok && shouldRetryWithCompatiblePayload(responseBody)) {
    const retry = await postAnthropicMessage(normalizedConfig.aiBaseUrl, normalizedConfig.aiApiKey, {
      model: normalizedConfig.aiModel,
      max_tokens: 1600,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })
    response = retry.response
    responseBody = retry.responseBody
  }

  if (!response.ok) {
    throw new Error(
      formatProviderErrorMessage(
        responseBody,
        'Nao foi possivel gerar a resposta do assistente com a IA configurada.'
      )
    )
  }

  const content = extractAnthropicContent(responseBody)
  if (!content) {
    throw new Error('A IA respondeu sem conteúdo textual para o assistente.')
  }

  return {
    content,
    usage: responseBody?.usage || null,
  }
}

export function resolveAssistantAiConfig(
  globalIntegrations: Partial<AiSettings> | LooseRecord | null | undefined
): AiSettings {
  return normalizeAiSettings(globalIntegrations)
}

export async function requestAssistantReply({
  config,
  adminSupabase,
  dashboardState,
  accessContext,
  clientId,
  contextSnapshot,
  messages,
}: ChatRequestConfig): Promise<AssistantReplyResult> {
  const normalizedConfig = normalizeAiSettings(config)

  if (!normalizedConfig.aiAnalysisEnabled) {
    throw new Error('A análise com IA está desativada nas configurações globais.')
  }

  if (!normalizedConfig.aiApiKey || !normalizedConfig.aiModel || !normalizedConfig.aiBaseUrl) {
    throw new Error('Preencha provider, endpoint, chave e modelo da IA antes de usar o assistente.')
  }

  const businessContext = await buildBusinessContext({
    adminSupabase,
    dashboardState,
    accessContext,
    clientId,
    contextSnapshot,
    messages,
  })
  const systemPrompt = buildAssistantSystemPrompt(normalizedConfig.aiDashboardPrompt)
  const builtMessages = buildAssistantMessages({
    systemPrompt,
    businessContext,
    messages,
  })

  const result = normalizedConfig.aiProvider === 'anthropic'
    ? await requestAnthropicChat(normalizedConfig, systemPrompt, builtMessages)
    : await requestOpenAiChat(normalizedConfig, builtMessages)

  return {
    reply: String(result.content || '').trim(),
    provider: normalizedConfig.aiProvider,
    model: normalizedConfig.aiModel,
    usage: result.usage || null,
    context: {
      selectedClientName: businessContext.selectedClient?.name || '',
      clientCount: Array.isArray(businessContext.clients) ? businessContext.clients.length : 0,
    },
  }
}
