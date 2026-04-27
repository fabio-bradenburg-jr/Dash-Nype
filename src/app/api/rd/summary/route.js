import { NextResponse } from 'next/server'

function getRdToken(request) {
  return request.headers.get('x-rd-station-token') || ''
}

function getCrmProvider(request) {
  const provider = String(request.headers.get('x-crm-provider') || '').trim().toLowerCase()
  return provider === 'agendor' ? 'agendor' : 'rd_station'
}

function extractNextPageToken(payload) {
  if (!payload || typeof payload !== 'object') return ''

  return (
    payload.next_page ||
    payload.pagination?.next_page ||
    payload.meta?.next_page ||
    ''
  )
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('A API do Agendor demorou demais para responder.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchPagedRdCollection(baseUrl, preferredKey, errorMessage) {
  const collectedItems = []
  let requestUrl = baseUrl
  let pageCount = 0

  while (requestUrl && pageCount < 100) {
    const response = await fetchWithTimeout(requestUrl)
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || errorMessage)
    }

    collectedItems.push(...normalizeCollection(payload, preferredKey))
    pageCount += 1

    const nextPageToken = extractNextPageToken(payload)
    if (!nextPageToken) break

    const nextUrl = new URL(baseUrl)
    nextUrl.searchParams.set('next_page', nextPageToken)
    requestUrl = nextUrl.toString()
  }

  return collectedItems
}

function readAgendorCollection(payload, preferredKey) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[preferredKey])) return payload[preferredKey]
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.dealStages)) return payload.dealStages
  return []
}

async function fetchPagedAgendorCollection(path, preferredKey, token, errorMessage) {
  const collectedItems = []
  let page = 1

  while (page <= 40) {
    const requestUrl = new URL(`https://api.agendor.com.br/v3${path}`)
    if (!requestUrl.searchParams.has('limit')) requestUrl.searchParams.set('limit', '100')
    requestUrl.searchParams.set('page', String(page))

    const response = await fetchWithTimeout(requestUrl.toString(), {
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || errorMessage)
    }

    const currentItems = readAgendorCollection(payload, preferredKey)
    if (!currentItems.length) break

    collectedItems.push(...currentItems)
    if (currentItems.length < 100) break
    page += 1
  }

  return collectedItems
}

function normalizeCollection(payload, preferredKey) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[preferredKey])) return payload[preferredKey]
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function parsePossibleCurrency(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')

  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function looksLikeRevenueLabel(value) {
  const label = normalizeLabel(value)

  return (
    label.includes('valor total') ||
    label.includes('valor da venda') ||
    label.includes('valor vendido') ||
    label.includes('total da venda') ||
    label.includes('receita') ||
    label.includes('faturamento') ||
    label === 'valor' ||
    label === 'total'
  )
}

function getCustomFieldNumericValue(field) {
  if (!field || typeof field !== 'object') return null

  const label = field.label || field.name || field.title || field.key || field.custom_field?.label || field.custom_field?.name || ''
  const looksLikeTotalValue = looksLikeRevenueLabel(label)

  if (!looksLikeTotalValue) return null

  const fieldCandidates = [
    field.value,
    field.amount,
    field.amount_decimal,
    field.decimal_value,
    field.currency_value,
    field.formatted_value,
    field.content,
    field.raw_value,
    field.number_value,
    field.money_value,
    field.custom_field_value,
  ]

  for (const candidate of fieldCandidates) {
    const parsed = parsePossibleCurrency(candidate)
    if (parsed !== null) return parsed
  }

  return null
}

function findNestedRevenueValue(input, depth = 0, visited = new WeakSet()) {
  if (!input || depth > 5) return null

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findNestedRevenueValue(item, depth + 1, visited)
      if (found !== null) return found
    }
    return null
  }

  if (typeof input !== 'object') return null

  if (visited.has(input)) return null
  visited.add(input)

  const directFieldValue = getCustomFieldNumericValue(input)
  if (directFieldValue !== null) return directFieldValue

  for (const [key, value] of Object.entries(input)) {
    if (looksLikeRevenueLabel(key)) {
      const parsed = parsePossibleCurrency(value)
      if (parsed !== null) return parsed

      if (typeof value === 'object') {
        const nested = findNestedRevenueValue(value, depth + 1, visited)
        if (nested !== null) return nested
      }
    }
  }

  for (const value of Object.values(input)) {
    const nested = findNestedRevenueValue(value, depth + 1, visited)
    if (nested !== null) return nested
  }

  return null
}

function getNumericValue(record) {
  const candidates = [
    record?.amount,
    record?.amount_decimal,
    record?.value,
    record?.deal_amount,
    record?.deal_value,
    record?.total,
    record?.total_value,
    record?.amount_total,
    record?.valor_total,
  ]

  for (const candidate of candidates) {
    const parsed = parsePossibleCurrency(candidate)
    if (parsed !== null) return parsed
  }

  const customFieldCollections = [
    record?.custom_fields,
    record?.deal_custom_fields,
    record?.fields,
    record?.field_values,
    record?.deal_fields,
    record?.customFieldValues,
  ].filter(Array.isArray)

  for (const collection of customFieldCollections) {
    for (const field of collection) {
      const parsed = getCustomFieldNumericValue(field)
      if (parsed !== null) return parsed
    }
  }

  const nestedValue = findNestedRevenueValue(record)
  if (nestedValue !== null) return nestedValue

  return 0
}

function collectTextFragments(input, depth = 0, visited = new WeakSet()) {
  if (input === null || input === undefined || depth > 4) return []

  if (typeof input === 'string' || typeof input === 'number') {
    return [String(input)]
  }

  if (typeof input !== 'object') return []
  if (visited.has(input)) return []
  visited.add(input)

  if (Array.isArray(input)) {
    return input.flatMap((item) => collectTextFragments(item, depth + 1, visited))
  }

  return Object.values(input).flatMap((value) => collectTextFragments(value, depth + 1, visited))
}

function classifyDealStatus(deal) {
  const explicitStatus = normalizeLabel(
    getTextFromMatchingFields(deal, [
      'estado da negociacao',
      'status da negociacao',
      'estado do negocio',
      'status do negocio',
      'situacao da negociacao',
      'situacao do negocio',
    ])
  )

  const fragments = collectTextFragments([
    deal?.status,
    deal?.deal_status,
    deal?.deal_stage_name,
    deal?.deal_stage,
    deal?.stage,
    deal?.pipeline,
    deal?.funnel,
    deal?.tags,
    deal?.tag_list,
    deal?.status_label,
    deal?.status_name,
    explicitStatus,
  ]).map((value) => normalizeLabel(value))

  const combinedStatus = fragments.join(' ')

  if (
    deal?.won === true ||
    deal?.win === true ||
    explicitStatus.includes('vendid') ||
    explicitStatus.includes('ganh') ||
    combinedStatus.includes('won') ||
    combinedStatus.includes('ganh') ||
    combinedStatus.includes('vendid') ||
    combinedStatus.includes('vendida') ||
    combinedStatus.includes('fechado ganho') ||
    combinedStatus.includes('closed won')
  ) {
    return 'won'
  }

  if (
    deal?.lost === true ||
    explicitStatus.includes('perd') ||
    explicitStatus.includes('cancelad') ||
    combinedStatus.includes('lost') ||
    combinedStatus.includes('perd') ||
    combinedStatus.includes('cancelad') ||
    combinedStatus.includes('closed lost')
  ) {
    return 'lost'
  }

  return 'open'
}

function parseDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffInDays(startDate, endDate) {
  if (!startDate || !endDate) return null
  const diff = endDate.getTime() - startDate.getTime()
  if (diff < 0) return null
  return diff / (1000 * 60 * 60 * 24)
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getDateRangeBounds(datePreset, since, until) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  if (datePreset === 'custom' && since && until) {
    return {
      start: new Date(`${since}T00:00:00`),
      end: new Date(`${until}T23:59:59.999`),
    }
  }

  switch (datePreset) {
    case 'today':
      return { start: today, end: new Date(today.getTime() + 86400000 - 1) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: yesterday, end: new Date(yesterday.getTime() + 86400000 - 1) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { start, end: new Date(today.getTime() + 86400000 - 1) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { start, end: new Date(today.getTime() + 86400000 - 1) }
    }
    case 'this_month':
      return { start: startOfMonth, end: new Date(today.getTime() + 86400000 - 1) }
    case 'maximum':
    default:
      return null
  }
}

function isWithinRange(date, range) {
  if (!range) return true
  if (!date) return false
  return date >= range.start && date <= range.end
}

function summarizeDealDiagnostics(deals, selectedRange) {
  return deals.reduce(
    (accumulator, deal) => {
      const type = classifyDealStatus(deal)
      const closedAt = getDealClosedAt(deal)
      const closedInRange = isWithinRange(closedAt, selectedRange)

      accumulator.totalDeals += 1

      if (type === 'won') {
        accumulator.wonClassified += 1

        if (!closedAt) {
          accumulator.wonWithoutCloseDate += 1
        } else if (closedInRange) {
          accumulator.wonClosedInRange += 1
        } else {
          accumulator.wonClosedOutOfRange += 1
        }
      } else if (type === 'lost') {
        accumulator.lostClassified += 1
      } else {
        accumulator.openClassified += 1
      }

      return accumulator
    },
    {
      totalDeals: 0,
      wonClassified: 0,
      lostClassified: 0,
      openClassified: 0,
      wonClosedInRange: 0,
      wonClosedOutOfRange: 0,
      wonWithoutCloseDate: 0,
    }
  )
}

function getOwnerInfo(deal) {
  const ownerCandidates = [
    deal?.user,
    deal?.owner,
    deal?.responsible,
    deal?.deal_owner,
  ].filter(Boolean)

  const owner = ownerCandidates[0] || {}
  const id = `${owner?.id || owner?.uuid || owner?.email || deal?.user_id || deal?.owner_id || deal?.responsible_id || ''}`.trim()
  const name = `${owner?.name || owner?.fullname || owner?.full_name || owner?.email || deal?.user_name || deal?.owner_name || deal?.responsible_name || ''}`.trim()

  if (!id && !name) return null

  return {
    id: id || name.toLowerCase().replace(/\s+/g, '-'),
    name: name || 'Sem vendedor definido',
  }
}

function getContactCreatedAt(contact) {
  return parseDateValue(
    contact?.created_at ||
      contact?.createdAt ||
      contact?.created ||
      contact?.created_on
  )
}

function getContactUpdatedAt(contact) {
  return parseDateValue(
    contact?.updated_at ||
      contact?.updatedAt ||
      contact?.last_update ||
      contact?.last_updated_at
  )
}

function getDealCreatedAt(deal) {
  return parseDateValue(
    deal?.created_at ||
      deal?.createdAt ||
      deal?.created ||
      deal?.created_on
  )
}

function getDealClosedAt(deal) {
  return parseDateValue(
    deal?.won_at ||
      deal?.wonAt ||
      deal?.closed_at ||
      deal?.closedAt ||
      deal?.status_changed_at ||
      deal?.statusChangedAt ||
      deal?.updated_at ||
      deal?.updatedAt
  )
}

function getDealMovedAt(deal) {
  return parseDateValue(
    deal?.stage_changed_at ||
      deal?.stageChangedAt ||
      deal?.status_changed_at ||
      deal?.statusChangedAt ||
      deal?.updated_at ||
      deal?.updatedAt ||
      deal?.last_activity_at ||
      deal?.lastActivityAt
  )
}

function getDealPipelineInfo(deal) {
  const pipelineObjects = [
    deal?.pipeline,
    deal?.deal_pipeline,
    deal?.funnel,
    deal?.sales_pipeline,
  ].filter((value) => value && typeof value === 'object')

  for (const pipelineObject of pipelineObjects) {
    const idCandidate = [
      pipelineObject.id,
      pipelineObject.uuid,
      pipelineObject.pipeline_id,
      pipelineObject.funnel_id,
    ].find((candidate) => candidate !== undefined && candidate !== null && `${candidate}`.trim())

    const nameCandidate = [
      pipelineObject.name,
      pipelineObject.label,
      pipelineObject.title,
      pipelineObject.pipeline_name,
      pipelineObject.display_name,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim())

    if (idCandidate || nameCandidate) {
      const normalizedName = nameCandidate?.trim() || 'Funil sem nome'
      return {
        id: `${idCandidate || `name:${normalizeLabel(normalizedName)}`}`.trim(),
        name: normalizedName,
      }
    }
  }

  const directName = [
    deal?.pipeline_name,
    deal?.deal_pipeline_name,
    deal?.funnel_name,
    typeof deal?.pipeline === 'string' ? deal.pipeline : '',
    typeof deal?.funnel === 'string' ? deal.funnel : '',
  ].find((candidate) => typeof candidate === 'string' && candidate.trim())

  const directId = [
    deal?.pipeline_id,
    deal?.deal_pipeline_id,
    deal?.funnel_id,
  ].find((candidate) => candidate !== undefined && candidate !== null && `${candidate}`.trim())

  if (!directId && !directName) {
    return {
      id: 'unknown',
      name: 'Funil não identificado',
    }
  }

  const normalizedName = directName?.trim() || 'Funil sem nome'
  return {
    id: `${directId || `name:${normalizeLabel(normalizedName)}`}`.trim(),
    name: normalizedName,
  }
}

function getDealStageLabel(deal) {
  const candidates = [
    deal?.deal_stage_name,
    deal?.deal_stage,
    deal?.stage,
    deal?.stage_name,
    deal?.pipeline_stage,
    deal?.deal_stage_label,
    deal?.stage_label,
    deal?.stage_title,
    deal?.funnel_stage,
    deal?.pipeline_name,
    deal?.current_stage,
  ]

  const directValue = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())
  if (directValue) return directValue.trim()

  const nestedStageObjects = [
    deal?.stage,
    deal?.deal_stage,
    deal?.pipeline_stage,
    deal?.current_stage,
    deal?.funnel_stage,
  ].filter((value) => value && typeof value === 'object')

  for (const stageObject of nestedStageObjects) {
    const nested = [
      stageObject.name,
      stageObject.label,
      stageObject.title,
      stageObject.stage_name,
      stageObject.display_name,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim())

    if (nested) return nested.trim()
  }

  const customFieldValue = getTextFromMatchingFields(deal, [
    'etapa',
    'estagio',
    'pipeline',
    'funil',
    'stage',
  ])

  if (customFieldValue) return customFieldValue.trim()

  return ''
}

function getDealStageOrder(deal) {
  const stageObjects = [
    deal?.stage,
    deal?.deal_stage,
    deal?.pipeline_stage,
    deal?.current_stage,
    deal?.funnel_stage,
  ].filter((value) => value && typeof value === 'object')

  for (const stageObject of stageObjects) {
    const candidates = [
      stageObject.position,
      stageObject.order,
      stageObject.index,
      stageObject.sequence,
      stageObject.sort_order,
      stageObject.stage_order,
      stageObject.step_order,
    ]

    for (const candidate of candidates) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return null
}

function getDealStageId(deal) {
  const stageObjects = [
    deal?.stage,
    deal?.deal_stage,
    deal?.pipeline_stage,
    deal?.current_stage,
    deal?.funnel_stage,
  ].filter((value) => value && typeof value === 'object')

  for (const stageObject of stageObjects) {
    const candidates = [
      stageObject.id,
      stageObject.uuid,
      stageObject.stage_id,
      stageObject.pipeline_stage_id,
    ]

    const found = candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '')
    if (found !== undefined) return String(found).trim()
  }

  const directCandidates = [
    deal?.stage_id,
    deal?.deal_stage_id,
    deal?.pipeline_stage_id,
    deal?.current_stage_id,
  ]

  const found = directCandidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '')
  return found !== undefined ? String(found).trim() : ''
}

function getCustomFieldTextValue(field) {
  if (!field || typeof field !== 'object') return ''

  const candidates = [
    field.value,
    field.formatted_value,
    field.content,
    field.raw_value,
    field.text_value,
    field.custom_field_value,
  ]

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '')
  return found ? String(found).trim() : ''
}

function getTextFromMatchingFields(record, matchers = []) {
  if (!record || typeof record !== 'object') return ''

  const directCandidates = Object.entries(record)
    .filter(([key]) => matchers.some((matcher) => normalizeLabel(key).includes(matcher)))
    .map(([, value]) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''))
    .filter(Boolean)

  if (directCandidates[0]) return directCandidates[0]

  const customFieldCollections = [
    record?.custom_fields,
    record?.deal_custom_fields,
    record?.fields,
    record?.field_values,
    record?.deal_fields,
    record?.customFieldValues,
  ].filter(Array.isArray)

  for (const collection of customFieldCollections) {
    for (const field of collection) {
      const label = normalizeLabel(field?.label || field?.name || field?.title || field?.key || field?.custom_field?.label || field?.custom_field?.name)
      if (matchers.some((matcher) => label.includes(matcher))) {
        const text = getCustomFieldTextValue(field)
        if (text) return text
      }
    }
  }

  return ''
}

function buildSourceLabel(deal, contact) {
  const utmSourceMatchers = ['utm_source', 'utm source', 'source', 'origem', 'fonte', 'trafego', 'traffic source']
  const utmMediumMatchers = ['utm_medium', 'utm medium', 'medium', 'midia', 'media']
  const utmCampaignMatchers = ['utm_campaign', 'utm campaign', 'campaign', 'campanha', 'nome da campanha']

  const utmSource = getTextFromMatchingFields(deal, utmSourceMatchers).trim() || getTextFromMatchingFields(contact, utmSourceMatchers).trim()
  const utmMedium = getTextFromMatchingFields(deal, utmMediumMatchers).trim() || getTextFromMatchingFields(contact, utmMediumMatchers).trim()
  const utmCampaign = getTextFromMatchingFields(deal, utmCampaignMatchers).trim() || getTextFromMatchingFields(contact, utmCampaignMatchers).trim()
  const source = getTextFromMatchingFields(deal, ['origem', 'fonte', 'source', 'origem do lead', 'canal']).trim() || getTextFromMatchingFields(contact, ['origem', 'fonte', 'source', 'origem do lead', 'canal']).trim()

  const utmLabel = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ')
  if (utmLabel) return utmLabel
  if (source) return source

  return 'Origem não identificada'
}

function getStageKey(deal) {
  return getDealStageLabel(deal) || 'Sem etapa definida'
}

function getContactIdentifiers(contact) {
  return [
    contact?.id,
    contact?.uuid,
    contact?.contact_id,
    contact?.external_id,
  ]
    .map((value) => `${value || ''}`.trim())
    .filter(Boolean)
}

function getDealRelatedContactId(deal) {
  return [
    deal?.contact_id,
    deal?.contact?.id,
    deal?.contact?.uuid,
    deal?.deal_contact_id,
    deal?.contact_uuid,
    deal?.contact_external_id,
  ]
    .map((value) => `${value || ''}`.trim())
    .find(Boolean) || ''
}

function getContactKey(contact) {
  const identifier = getContactIdentifiers(contact)[0]
  if (identifier) return `contact:${identifier}`

  const email = `${contact?.email || contact?.emails?.[0]?.email || contact?.emails?.[0] || ''}`.trim().toLowerCase()
  if (email) return `contact:email:${email}`

  const phone = `${contact?.phone || contact?.mobile_phone || contact?.phones?.[0]?.phone || contact?.phones?.[0] || ''}`
    .replace(/\D/g, '')
    .trim()
  if (phone) return `contact:phone:${phone}`

  const name = normalizeLabel(contact?.name || contact?.full_name || contact?.title || '')
  if (name) return `contact:name:${name}`

  return ''
}

function getDealKey(deal, fallback = '') {
  const identifier = `${deal?.id || deal?.uuid || deal?.deal_id || fallback || ''}`.trim()
  return identifier ? `deal:${identifier}` : ''
}

function normalizeAgendorStage(stage) {
  if (!stage || typeof stage !== 'object') return null

  const pipelineObject = stage.pipeline || stage.funnel || stage.dealPipeline || {}
  const pipelineId = `${pipelineObject.id || stage.pipelineId || stage.funnelId || ''}`.trim()
  const pipelineName = `${pipelineObject.name || stage.pipelineName || stage.funnelName || ''}`.trim()
  const stageId = `${stage.id || stage.stageId || stage.dealStageId || ''}`.trim()
  const stageName = `${stage.name || stage.title || stage.label || ''}`.trim()

  if (!stageId || !stageName) return null

  return {
    id: stageId,
    name: stageName,
    pipelineId: pipelineId || `pipeline:${normalizeLabel(pipelineName || stageName)}`,
    pipelineName: pipelineName || 'Pipeline não identificado',
    position: Number(stage.position ?? stage.order ?? stage.sequence ?? stage.index ?? 0) || 0,
  }
}

function normalizeAgendorDeal(deal, stagesById) {
  if (!deal || typeof deal !== 'object') return null

  const dealStageObject = deal.dealStage && typeof deal.dealStage === 'object'
    ? deal.dealStage
    : deal.stage && typeof deal.stage === 'object'
      ? deal.stage
      : deal.deal_stage && typeof deal.deal_stage === 'object'
        ? deal.deal_stage
        : {}
  const dealStatusObject = deal.dealStatus && typeof deal.dealStatus === 'object'
    ? deal.dealStatus
    : deal.status && typeof deal.status === 'object'
      ? deal.status
      : deal.deal_status && typeof deal.deal_status === 'object'
        ? deal.deal_status
        : {}
  const rawStageId = `${deal.dealStageId || deal.stageId || deal.deal_stage_id || deal.pipeline_stage_id || dealStageObject.id || dealStageObject.stageId || ''}`.trim()
  const stage = stagesById.get(rawStageId)
  const rawPipelineId = `${
    deal.pipelineId ||
    deal.funnelId ||
    deal.dealPipelineId ||
    dealStageObject.funnel?.id ||
    dealStageObject.pipeline?.id ||
    stage?.pipelineId ||
    ''
  }`.trim()
  const rawPipelineName = `${
    deal.pipelineName ||
    deal.funnelName ||
    deal.dealPipelineName ||
    dealStageObject.funnel?.name ||
    dealStageObject.pipeline?.name ||
    stage?.pipelineName ||
    'Pipeline não identificado'
  }`.trim()
  const person = deal.person && typeof deal.person === 'object' ? deal.person : deal.contact && typeof deal.contact === 'object' ? deal.contact : {}
  const company = deal.company && typeof deal.company === 'object'
    ? deal.company
    : deal.organization && typeof deal.organization === 'object'
      ? deal.organization
      : {}
  const owner = deal.owner && typeof deal.owner === 'object' ? deal.owner : deal.user && typeof deal.user === 'object' ? deal.user : {}
  const rawStatus = `${deal.status || deal.statusLabel || deal.statusName || dealStatusObject.name || dealStatusObject.label || deal.outcome || deal.result || ''}`.trim()
  const customFields = Array.isArray(deal.customFields)
    ? deal.customFields
    : Array.isArray(deal.custom_fields)
      ? deal.custom_fields
      : []

  return {
    id: `${deal.id || deal.dealId || deal.uuid || ''}`.trim(),
    amount: deal.value ?? deal.amount ?? deal.totalValue ?? deal.total_value ?? 0,
    created_at: deal.createdAt || deal.created_at || deal.startTime || person.createdAt || company.createdAt || '',
    updated_at: deal.updatedAt || deal.updated_at || deal.lastInteractionAt || deal.endTime || '',
    won_at: deal.wonAt || deal.won_at || '',
    closed_at: deal.closedAt || deal.closed_at || deal.finishedAt || deal.finished_at || deal.endTime || deal.lostAt || '',
    won: Boolean(deal.won || dealStatusObject.id === 2 || normalizeLabel(rawStatus).includes('ganh') || normalizeLabel(rawStatus).includes('vendid')),
    lost: Boolean(deal.lost || dealStatusObject.id === 3 || normalizeLabel(rawStatus).includes('perd') || normalizeLabel(rawStatus).includes('lost')),
    status: rawStatus,
    owner: {
      id: `${owner.id || owner.userId || owner.email || ''}`.trim(),
      name: `${owner.name || owner.fullName || owner.full_name || owner.email || ''}`.trim(),
    },
    user: {
      id: `${owner.id || owner.userId || owner.email || ''}`.trim(),
      name: `${owner.name || owner.fullName || owner.full_name || owner.email || ''}`.trim(),
    },
    pipeline: {
      id: rawPipelineId || stage?.pipelineId || 'unknown',
      name: rawPipelineName,
    },
    stage: {
      id: rawStageId || stage?.id || '',
      name: `${deal.dealStageName || deal.stageName || dealStageObject.name || dealStageObject.label || stage?.name || 'Sem etapa definida'}`.trim(),
      position: Number(deal.stageOrder ?? dealStageObject.sequence ?? dealStageObject.order ?? stage?.position ?? 0) || 0,
      pipeline_id: rawPipelineId || stage?.pipelineId || 'unknown',
    },
    deal_stage_name: `${deal.dealStageName || deal.stageName || dealStageObject.name || dealStageObject.label || stage?.name || ''}`.trim(),
    deal_stage_id: rawStageId || stage?.id || '',
    contact: {
      id: `${person.id || person.personId || company.id || company.companyId || deal.personId || deal.companyId || deal.id || ''}`.trim(),
      name: `${person.name || company.name || deal.title || 'Contato Agendor'}`.trim(),
      email: `${person.email || ''}`.trim(),
      created_at: person.createdAt || company.createdAt || deal.createdAt || deal.created_at || '',
      updated_at: person.updatedAt || company.updatedAt || deal.updatedAt || deal.updated_at || '',
      custom_fields: customFields,
      origem: `${deal.source || deal.origin || person.source || company.source || ''}`.trim(),
    },
    contact_id: `${person.id || person.personId || company.id || company.companyId || deal.personId || deal.companyId || deal.id || ''}`.trim(),
    source: `${deal.source || deal.origin || person.source || company.source || ''}`.trim(),
    origem: `${deal.source || deal.origin || person.source || company.source || ''}`.trim(),
    custom_fields: customFields,
    tags: Array.isArray(deal.tags) ? deal.tags : [],
  }
}

export async function GET(request) {
  try {
    const token = getRdToken(request)
    const provider = getCrmProvider(request)
    const { searchParams } = new URL(request.url)
    const selectedPipelineId = searchParams.get('pipeline_id') || ''
    const selectedPipelineIds = selectedPipelineId
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const selectedPipelineSet = new Set(selectedPipelineIds)
    const selectedSellerId = searchParams.get('seller_id') || 'all'
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    const qualifiedStages = searchParams
      .getAll('qualified_stage')
      .map((stage) => stage.trim())
      .filter(Boolean)
    const leadSources = searchParams
      .getAll('lead_source')
      .map((source) => source.trim())
      .filter(Boolean)
    const normalizedQualifiedStages = new Set(qualifiedStages.map((stage) => normalizeLabel(stage)))
    const normalizedLeadSources = new Set(leadSources.map((source) => normalizeLabel(source)))
    const hasQualifiedStageFilter = normalizedQualifiedStages.size > 0
    const hasLeadSourceFilter = normalizedLeadSources.size > 0
    const selectedRange = getDateRangeBounds(datePreset, since, until)

    if (!token) {
      return NextResponse.json({ error: provider === 'agendor' ? 'Informe o token do Agendor.' : 'Informe o token do RD Station CRM.' }, { status: 400 })
    }

    const [contacts, deals] = provider === 'agendor'
      ? await Promise.all([
        fetchPagedAgendorCollection('/deals', 'deals', token, 'Não foi possível consultar as negociações do Agendor.')
          .then((rawDeals) => {
            const contactsMap = new Map()
            rawDeals.forEach((deal) => {
              const person = deal?.person && typeof deal.person === 'object' ? deal.person : deal?.contact && typeof deal.contact === 'object' ? deal.contact : {}
              const company = deal?.company && typeof deal.company === 'object' ? deal.company : {}
              const id = `${person.id || person.personId || company.id || company.companyId || deal.id || ''}`.trim()
              if (!id) return
              contactsMap.set(id, {
                id,
                name: `${person.name || company.name || deal.title || 'Contato Agendor'}`.trim(),
                email: `${person.email || ''}`.trim(),
                created_at: person.createdAt || company.createdAt || deal.createdAt || deal.created_at || '',
                updated_at: person.updatedAt || company.updatedAt || deal.updatedAt || deal.updated_at || '',
                custom_fields: Array.isArray(deal.customFields) ? deal.customFields : Array.isArray(deal.custom_fields) ? deal.custom_fields : [],
                origem: `${deal.source || deal.origin || person.source || company.source || ''}`.trim(),
              })
            })
            return Array.from(contactsMap.values())
          }),
        Promise.all([
          fetchPagedAgendorCollection('/deal_stages', 'dealStages', token, 'Não foi possível consultar as etapas do Agendor.'),
          fetchPagedAgendorCollection('/deals', 'deals', token, 'Não foi possível consultar as negociações do Agendor.'),
        ]).then(([dealStages, rawDeals]) => {
          const stagesById = new Map(dealStages.map(normalizeAgendorStage).filter(Boolean).map((stage) => [stage.id, stage]))
          return rawDeals.map((deal) => normalizeAgendorDeal(deal, stagesById)).filter(Boolean)
        }),
      ])
      : await Promise.all([
        fetchPagedRdCollection(
          `https://crm.rdstation.com/api/v1/contacts?token=${encodeURIComponent(token)}&limit=200`,
          'contacts',
          'Não foi possível consultar os contatos do RD Station.'
        ),
        fetchPagedRdCollection(
          `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=200`,
          'deals',
          'Não foi possível consultar as negociações do RD Station.'
        ),
      ])
    const contactsById = new Map()
    contacts.forEach((contact) => {
      getContactIdentifiers(contact).forEach((identifier) => {
        contactsById.set(identifier, contact)
      })
    })
    const pipelineMap = new Map()

    deals.forEach((deal) => {
      const pipeline = getDealPipelineInfo(deal)
      const currentPipeline = pipelineMap.get(pipeline.id)

      if (currentPipeline) {
        currentPipeline.deals += 1
        return
      }

      pipelineMap.set(pipeline.id, {
        id: pipeline.id,
        name: pipeline.name,
        deals: 1,
      })
    })

    const availablePipelines = Array.from(pipelineMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    )
    const pipelineFilteredDeals = selectedPipelineSet.size
      ? deals.filter((deal) => selectedPipelineSet.has(getDealPipelineInfo(deal).id))
      : deals
    const pipelineContactIdentifiers = new Set()
    const pipelineContactKeys = new Set()

    pipelineFilteredDeals.forEach((deal) => {
      const relatedContactId = getDealRelatedContactId(deal)
      const relatedContact = contactsById.get(relatedContactId) || deal?.contact || null

      if (relatedContactId) {
        pipelineContactIdentifiers.add(relatedContactId)
      }

      if (relatedContact) {
        getContactIdentifiers(relatedContact).forEach((identifier) => {
          pipelineContactIdentifiers.add(identifier)
        })

        const contactKey = getContactKey(relatedContact)
        if (contactKey) {
          pipelineContactKeys.add(contactKey)
        }
      }
    })
    const contactsForSelectedPipeline = selectedPipelineId
      ? contacts.filter((contact) => {
          const identifiers = getContactIdentifiers(contact)
          const hasIdentifierMatch = identifiers.some((identifier) => pipelineContactIdentifiers.has(identifier))
          if (hasIdentifierMatch) return true

          const contactKey = getContactKey(contact)
          return contactKey ? pipelineContactKeys.has(contactKey) : false
        })
      : contacts
    const sellersMap = new Map()

    pipelineFilteredDeals.forEach((deal) => {
      const owner = getOwnerInfo(deal)
      if (!owner) return
      sellersMap.set(owner.id, owner)
    })

    const stageOrderMap = new Map()
    const stageIdOrderMap = new Map()
    const stageFirstSeenMap = new Map()

    pipelineFilteredDeals.forEach((deal, index) => {
      const label = getDealStageLabel(deal)
      if (!label) return

      if (!stageFirstSeenMap.has(label)) {
        stageFirstSeenMap.set(label, index)
      }

      const detectedOrder = getDealStageOrder(deal)
      if (detectedOrder === null) return

      const currentOrder = stageOrderMap.get(label)
      if (currentOrder === undefined || detectedOrder < currentOrder) {
        stageOrderMap.set(label, detectedOrder)
      }

      const stageId = getDealStageId(deal)
      if (stageId) {
        const currentIdOrder = stageIdOrderMap.get(label)
        const parsedStageId = Number(stageId)
        if (Number.isFinite(parsedStageId) && (currentIdOrder === undefined || parsedStageId < currentIdOrder)) {
          stageIdOrderMap.set(label, parsedStageId)
        }
      }
    })

    const availableStages = Array.from(stageFirstSeenMap.keys()).sort((a, b) => {
      const orderA = stageOrderMap.get(a)
      const orderB = stageOrderMap.get(b)

      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
        return orderA - orderB
      }

      if (orderA !== undefined && orderB === undefined) return -1
      if (orderA === undefined && orderB !== undefined) return 1

      const stageIdA = stageIdOrderMap.get(a)
      const stageIdB = stageIdOrderMap.get(b)
      if (stageIdA !== undefined && stageIdB !== undefined && stageIdA !== stageIdB) {
        return stageIdA - stageIdB
      }

      if (stageIdA !== undefined && stageIdB === undefined) return -1
      if (stageIdA === undefined && stageIdB !== undefined) return 1

      return (stageFirstSeenMap.get(a) || 0) - (stageFirstSeenMap.get(b) || 0)
    })
    const stageSequenceMap = new Map(availableStages.map((stage, index) => [normalizeLabel(stage), index]))
    const selectedQualifiedStageIndexes = qualifiedStages
      .map((stage) => stageSequenceMap.get(normalizeLabel(stage)))
      .filter((value) => value !== undefined)
    const qualifiedStageThreshold = selectedQualifiedStageIndexes.length
      ? Math.min(...selectedQualifiedStageIndexes)
      : null
    const availableSources = Array.from(
      new Set([
        ...contactsForSelectedPipeline.map((contact) => buildSourceLabel(null, contact)),
        ...pipelineFilteredDeals.map((deal) => {
          const relatedContactId = getDealRelatedContactId(deal)
          return buildSourceLabel(deal, contactsById.get(relatedContactId) || deal?.contact || null)
        }),
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    const filteredDeals = pipelineFilteredDeals.filter((deal) => {
      if (selectedSellerId === 'all') return true
      const owner = getOwnerInfo(deal)
      return owner?.id === selectedSellerId
    })
    const allDealsDiagnostics = summarizeDealDiagnostics(deals, selectedRange)
    const pipelineDealsDiagnostics = summarizeDealDiagnostics(pipelineFilteredDeals, selectedRange)
    const filteredDealsDiagnostics = summarizeDealDiagnostics(filteredDeals, selectedRange)
    const contactsCreatedInPeriod = contactsForSelectedPipeline.filter((contact) =>
      isWithinRange(getContactCreatedAt(contact), selectedRange)
    )
    const contactsCreatedInPeriodBySource = contactsCreatedInPeriod.filter((contact) => {
      if (!hasLeadSourceFilter) return true
      return normalizedLeadSources.has(normalizeLabel(buildSourceLabel(null, contact)))
    })

    const wonLeadToWonDays = []
    const wonDealToWonDays = []
    const globalWonLeadToWonDays = []
    const globalWonDealToWonDays = []

    pipelineFilteredDeals.forEach((deal) => {
      const type = classifyDealStatus(deal)
      if (type !== 'won') return

      const dealCreatedAt = getDealCreatedAt(deal)
      const dealClosedAt = getDealClosedAt(deal)
      if (!isWithinRange(dealClosedAt, selectedRange)) return
      const relatedContactId = getDealRelatedContactId(deal)
      const relatedContact = contactsById.get(relatedContactId) || deal?.contact || null
      const contactCreatedAt = getContactCreatedAt(relatedContact)

      const leadToWonDays = diffInDays(contactCreatedAt, dealClosedAt)
      if (leadToWonDays !== null) globalWonLeadToWonDays.push(leadToWonDays)

      const dealToWonDays = diffInDays(dealCreatedAt, dealClosedAt)
      if (dealToWonDays !== null) globalWonDealToWonDays.push(dealToWonDays)
    })

    const summary = filteredDeals.reduce(
      (accumulator, deal) => {
        const type = classifyDealStatus(deal)
        const amount = getNumericValue(deal)
        const owner = getOwnerInfo(deal)
        const dealCreatedAt = getDealCreatedAt(deal)
        const dealClosedAt = getDealClosedAt(deal)
        const dealMovedAt = getDealMovedAt(deal)
        const dealCreatedInRange = isWithinRange(dealCreatedAt, selectedRange)
        const dealClosedInRange = isWithinRange(dealClosedAt, selectedRange)
        const dealMovedInRange = isWithinRange(dealMovedAt, selectedRange)
        const relatedContactId = getDealRelatedContactId(deal)
        const relatedContact = contactsById.get(relatedContactId) || deal?.contact || null
        const contactCreatedAt = getContactCreatedAt(relatedContact)
        const contactUpdatedAt = getContactUpdatedAt(relatedContact)
        const contactCreatedInRange = isWithinRange(contactCreatedAt, selectedRange)
        const contactMovedInRange = isWithinRange(contactUpdatedAt, selectedRange)
        const sourceLabel = buildSourceLabel(deal, relatedContact)
        const sourceMatchesFilter = !hasLeadSourceFilter || normalizedLeadSources.has(normalizeLabel(sourceLabel))
        const stageLabel = getStageKey(deal)
        const stageSequence = stageSequenceMap.get(normalizeLabel(stageLabel))
        const createdOpportunityInRange = contactCreatedInRange || dealCreatedInRange
        const createdLeadInRange = contactCreatedInRange && sourceMatchesFilter
        const shouldCountWonByClosingDate = type === 'won' && dealClosedInRange
        const shouldCountWonByCreationDate =
          type === 'won' &&
          createdLeadInRange &&
          dealClosedInRange
        const shouldCountWonFromPreviousCohort =
          type === 'won' &&
          dealClosedInRange &&
          sourceMatchesFilter &&
          Boolean(contactCreatedAt) &&
          !contactCreatedInRange
        const shouldCountLostByClosingDate = type === 'lost' && dealClosedInRange
        const shouldCountOpenByMovementDate = type === 'open' && dealMovedInRange
        const hasReachedQualifiedStage = hasQualifiedStageFilter
          ? (
            normalizedQualifiedStages.has(normalizeLabel(stageLabel)) ||
            (qualifiedStageThreshold !== null &&
              stageSequence !== undefined &&
              stageSequence >= qualifiedStageThreshold)
          )
          : type !== 'lost'

        const shouldTrackStage =
          shouldCountWonByClosingDate ||
          shouldCountLostByClosingDate ||
          shouldCountOpenByMovementDate

        if (shouldTrackStage) {
          accumulator.stageStats[stageLabel] ||= {
            label: stageLabel,
            order: stageOrderMap.get(stageLabel) ?? stageFirstSeenMap.get(stageLabel) ?? Number.MAX_SAFE_INTEGER,
            stageIdOrder: stageIdOrderMap.get(stageLabel) ?? Number.MAX_SAFE_INTEGER,
            deals: 0,
            openDeals: 0,
            wonDeals: 0,
            lostDeals: 0,
            totalValue: 0,
            pipelineValue: 0,
            wonRevenue: 0,
          }
          accumulator.stageStats[stageLabel].deals += 1
          accumulator.stageStats[stageLabel].totalValue += amount
        }

        if ((dealMovedInRange || dealCreatedInRange) && sourceMatchesFilter) {
          accumulator.createdDeals += 1

          if (hasReachedQualifiedStage || type === 'won') {
            accumulator.qualifiedDeals += 1
          }
        }

        const relatedContactKey = getContactKey(relatedContact)
        const dealKey = getDealKey(
          deal,
          dealCreatedAt?.toISOString?.() || dealClosedAt?.toISOString?.() || stageLabel
        )

        if (createdOpportunityInRange && sourceMatchesFilter) {
          if (relatedContactKey) {
            accumulator.createdPeriodOpportunityContacts.add(relatedContactKey)
          } else if (dealKey) {
            accumulator.createdPeriodOpportunityContacts.add(dealKey)
          }
        }

        if ((dealMovedInRange || dealCreatedInRange) && (contactCreatedInRange || contactMovedInRange) && relatedContactKey && sourceMatchesFilter && (hasReachedQualifiedStage || type === 'won')) {
          accumulator.contactsWithQualifiedDeals.add(relatedContactKey)
        }

        if (createdOpportunityInRange && sourceMatchesFilter && (hasReachedQualifiedStage || type === 'won')) {
          if (relatedContactKey) {
            accumulator.createdPeriodQualifiedContacts.add(relatedContactKey)
          } else if (dealCreatedInRange && dealKey) {
            accumulator.createdPeriodQualifiedContacts.add(dealKey)
          }
        }

        if ((dealMovedInRange || dealCreatedInRange) && (contactCreatedInRange || contactMovedInRange) && relatedContactKey && sourceMatchesFilter) {
          accumulator.contactsWithDeals.add(relatedContactKey)
        }

        if (dealMovedInRange && relatedContactKey && sourceMatchesFilter) {
          accumulator.contactsMoved.add(relatedContactKey)
        }

        if (shouldCountWonByCreationDate) {
          if (relatedContactKey) {
            accumulator.createdPeriodWonContacts.add(relatedContactKey)
          } else if (dealKey) {
            accumulator.createdPeriodWonContacts.add(dealKey)
          }
          accumulator.createdPeriodWonRevenue += amount
        }

        if (shouldCountWonByClosingDate) {
          accumulator.wonDeals += 1
          accumulator.wonRevenue += amount
          accumulator.stageStats[stageLabel].wonDeals += 1
          accumulator.stageStats[stageLabel].wonRevenue += amount

          if (relatedContactKey && sourceMatchesFilter) {
            accumulator.contactsWithWonDeals.add(relatedContactKey)
          }

          const leadToWonDays = diffInDays(contactCreatedAt, dealClosedAt)
          if (leadToWonDays !== null) wonLeadToWonDays.push(leadToWonDays)

          const dealToWonDays = diffInDays(dealCreatedAt, dealClosedAt)
          if (dealToWonDays !== null) wonDealToWonDays.push(dealToWonDays)

          accumulator.sourceStats[sourceLabel] ||= {
            label: sourceLabel,
            wonDeals: 0,
            wonRevenue: 0,
          }
          accumulator.sourceStats[sourceLabel].wonDeals += 1
          accumulator.sourceStats[sourceLabel].wonRevenue += amount

          if (shouldCountWonFromPreviousCohort) {
            accumulator.wonDealsFromPreviousCohorts += 1
            accumulator.wonRevenueFromPreviousCohorts += amount
          }
        } else if (shouldCountLostByClosingDate) {
          accumulator.lostDeals += 1
          accumulator.stageStats[stageLabel].lostDeals += 1
          if (relatedContactId && sourceMatchesFilter) {
            accumulator.lostContacts.add(relatedContactId)
          }
        } else if (shouldCountOpenByMovementDate) {
          accumulator.openDeals += 1
          accumulator.openPipeline += amount
          accumulator.stageStats[stageLabel].openDeals += 1
          accumulator.stageStats[stageLabel].pipelineValue += amount
        }

        if ((shouldCountWonByClosingDate || shouldCountLostByClosingDate)) {
          accumulator.closedDeals += 1
        }

        if (type === 'lost' && createdOpportunityInRange && sourceMatchesFilter) {
          if (relatedContactKey) {
            accumulator.createdPeriodLostContacts.add(relatedContactKey)
          } else if (dealKey) {
            accumulator.createdPeriodLostContacts.add(dealKey)
          }
        }

        if (owner) {
          accumulator.sellerStats[owner.id] ||= {
            id: owner.id,
            name: owner.name,
            openDeals: 0,
            wonDeals: 0,
            lostDeals: 0,
            wonRevenue: 0,
          }

          if (shouldCountWonByClosingDate) {
            accumulator.sellerStats[owner.id].wonDeals += 1
            accumulator.sellerStats[owner.id].wonRevenue += amount
          } else if (shouldCountLostByClosingDate) {
            accumulator.sellerStats[owner.id].lostDeals += 1
          } else if (shouldCountOpenByMovementDate) {
            accumulator.sellerStats[owner.id].openDeals += 1
          }
        }

        return accumulator
      },
      {
        openDeals: 0,
        wonDeals: 0,
        lostDeals: 0,
        closedDeals: 0,
        createdDeals: 0,
        qualifiedDeals: 0,
        openPipeline: 0,
        wonRevenue: 0,
        createdPeriodWonRevenue: 0,
        wonDealsFromPreviousCohorts: 0,
        wonRevenueFromPreviousCohorts: 0,
        sellerStats: {},
        sourceStats: {},
        stageStats: {},
        contactsMoved: new Set(),
        lostContacts: new Set(),
        contactsWithDeals: new Set(),
        contactsWithQualifiedDeals: new Set(),
        contactsWithWonDeals: new Set(),
        createdPeriodOpportunityContacts: new Set(),
        createdPeriodQualifiedContacts: new Set(),
        createdPeriodWonContacts: new Set(),
        createdPeriodLostContacts: new Set(),
      }
    )

    const leadCount = contactsForSelectedPipeline.length
    const leadCountInPeriod = contactsCreatedInPeriod.length
    const leadCountInPeriodBySource = contactsCreatedInPeriodBySource.length
    const opportunityKeys = new Set(
      contactsCreatedInPeriodBySource.map((contact) => getContactKey(contact)).filter(Boolean)
    )
    summary.createdPeriodOpportunityContacts.forEach((key) => {
      opportunityKeys.add(key)
    })
    const opportunityCount = opportunityKeys.size
    const qualifiedOpportunityCount = summary.createdPeriodQualifiedContacts.size
    const wonOpportunityCount = summary.createdPeriodWonContacts.size
    const lostOpportunityCount = summary.createdPeriodLostContacts.size
    const leadRateBase = opportunityCount
    const qualifiedRateBase = qualifiedOpportunityCount
    const avgTicketWonByCreation = wonOpportunityCount > 0 ? summary.createdPeriodWonRevenue / wonOpportunityCount : 0
    const avgTicketWon = summary.wonDeals > 0 ? summary.wonRevenue / summary.wonDeals : 0
    const avgTicketWonPreviousCohorts =
      summary.wonDealsFromPreviousCohorts > 0
        ? summary.wonRevenueFromPreviousCohorts / summary.wonDealsFromPreviousCohorts
        : 0
    const closeRate = summary.closedDeals > 0 ? (summary.wonDeals / summary.closedDeals) * 100 : 0
    const qualifiedToWonRate = qualifiedRateBase > 0 ? (wonOpportunityCount / qualifiedRateBase) * 100 : 0
    const leadToQualifiedRate = leadRateBase > 0 ? (qualifiedOpportunityCount / leadRateBase) * 100 : 0
    const dealToWonRate = summary.createdDeals > 0 ? (summary.wonDeals / summary.createdDeals) * 100 : 0
    const leadToDealRate = leadRateBase > 0 ? (summary.contactsWithDeals.size / leadRateBase) * 100 : 0
    const leadToWonRate = leadRateBase > 0 ? (wonOpportunityCount / leadRateBase) * 100 : 0
    const avgLeadToWonDays = average(globalWonLeadToWonDays)
    const avgDealToWonDays = average(globalWonDealToWonDays)
    const avgLeadToWonDaysFiltered = average(wonLeadToWonDays)
    const avgDealToWonDaysFiltered = average(wonDealToWonDays)
    const sourceConversionRate = leadRateBase > 0 ? (wonOpportunityCount / leadRateBase) * 100 : 0
    const sellers = Array.from(sellersMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const sellerRanking = Object.values(summary.sellerStats)
      .sort((a, b) => {
        if (b.wonRevenue !== a.wonRevenue) return b.wonRevenue - a.wonRevenue
        return b.wonDeals - a.wonDeals
      })
      .slice(0, 5)
    const sourceRanking = Object.values(summary.sourceStats)
      .sort((a, b) => {
        if (b.wonRevenue !== a.wonRevenue) return b.wonRevenue - a.wonRevenue
        return b.wonDeals - a.wonDeals
      })
      .slice(0, 8)
    const stageRanking = Object.values(summary.stageStats)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        if (a.stageIdOrder !== b.stageIdOrder) return a.stageIdOrder - b.stageIdOrder
        return a.label.localeCompare(b.label, 'pt-BR')
      })

    return NextResponse.json({
      contacts: leadCount,
      contactsInPeriod: leadCountInPeriod,
      contactsInPeriodBySource: leadCountInPeriodBySource,
      opportunityCount,
      qualifiedOpportunityCount,
      wonOpportunityCount,
      lostOpportunityCount,
      wonOpportunityRevenue: summary.createdPeriodWonRevenue,
      contactsMoved: summary.contactsMoved.size,
      lostContacts: summary.lostContacts.size,
      ...summary,
      avgTicketWonByCreation,
      avgTicketWon,
      avgTicketWonPreviousCohorts,
      closeRate,
      availableStages,
      availablePipelines,
      availableSources,
      selectedLeadSources: leadSources,
      selectedPipelineId: selectedPipelineIds.join(','),
      qualifiedStages,
      qualifiedDeals: summary.qualifiedDeals,
      qualifiedContacts: summary.contactsWithQualifiedDeals.size,
      wonDealsFromPreviousCohorts: summary.wonDealsFromPreviousCohorts,
      wonRevenueFromPreviousCohorts: summary.wonRevenueFromPreviousCohorts,
      stageRanking,
      leadToQualifiedRate,
      qualifiedToWonRate,
      dealToWonRate,
      leadToDealRate,
      leadToWonRate,
      sourceConversionRate,
      avgLeadToWonDays,
      avgDealToWonDays,
      avgLeadToWonDaysFiltered,
      avgDealToWonDaysFiltered,
      contactsWithDeals: summary.contactsWithDeals.size,
      contactsWithWonDeals: summary.contactsWithWonDeals.size,
      sellers,
      sellerRanking,
      sourceRanking,
      selectedSellerId,
      diagnostics: {
        pipelineFilterApplied: Boolean(selectedPipelineId),
        selectedPipelineId,
        pipelineOptionsCount: pipelineMap.size,
        sellerFilterApplied: selectedSellerId !== 'all',
        selectedSellerId,
        sellerOptionsCount: sellersMap.size,
        leadSourceFilterApplied: hasLeadSourceFilter,
        qualifiedStageFilterApplied: hasQualifiedStageFilter,
        dateRange: selectedRange
          ? {
              start: selectedRange.start.toISOString(),
              end: selectedRange.end.toISOString(),
            }
          : null,
        allDeals: allDealsDiagnostics,
        pipelineDeals: pipelineDealsDiagnostics,
        filteredDeals: filteredDealsDiagnostics,
      },
    })
  } catch (error) {
    console.error('CRM summary error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
