import { NextResponse } from 'next/server'

function getRdToken(request) {
  return request.headers.get('x-rd-station-token') || ''
}

function getCrmProvider(request) {
  const provider = String(request.headers.get('x-crm-provider') || '').trim().toLowerCase()
  return provider === 'agendor' ? 'agendor' : 'rd_station'
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
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

function normalizeCollection(payload, preferredKey) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[preferredKey])) return payload[preferredKey]
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

async function fetchPagedRdCollection(baseUrl, preferredKey, errorMessage) {
  const collectedItems = []
  let requestUrl = baseUrl
  let pageCount = 0

  while (requestUrl && pageCount < 100) {
    const response = await fetch(requestUrl)
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

  while (page <= 100) {
    const requestUrl = new URL(`https://api.agendor.com.br/v3${path}`)
    if (!requestUrl.searchParams.has('limit')) requestUrl.searchParams.set('limit', '100')
    requestUrl.searchParams.set('page', String(page))

    const response = await fetch(requestUrl.toString(), {
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

    const found = candidates.find((candidate) => candidate !== undefined && candidate !== null && `${candidate}`.trim())
    if (found !== undefined) return String(found).trim()
  }

  return ''
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

  const rawStageId = `${deal.dealStageId || deal.stageId || deal.deal_stage_id || deal.pipeline_stage_id || ''}`.trim()
  const stage = stagesById.get(rawStageId)
  const rawPipelineId = `${deal.pipelineId || deal.funnelId || stage?.pipelineId || ''}`.trim()
  const person = deal.person && typeof deal.person === 'object' ? deal.person : deal.contact && typeof deal.contact === 'object' ? deal.contact : {}
  const company = deal.company && typeof deal.company === 'object' ? deal.company : {}
  const owner = deal.owner && typeof deal.owner === 'object' ? deal.owner : deal.user && typeof deal.user === 'object' ? deal.user : {}
  const rawStatus = `${deal.status || deal.statusLabel || deal.statusName || deal.outcome || deal.result || ''}`.trim()
  const customFields = Array.isArray(deal.customFields)
    ? deal.customFields
    : Array.isArray(deal.custom_fields)
      ? deal.custom_fields
      : []

  return {
    id: `${deal.id || deal.dealId || deal.uuid || ''}`.trim(),
    amount: deal.value ?? deal.amount ?? deal.totalValue ?? deal.total_value ?? 0,
    created_at: deal.createdAt || deal.created_at || person.createdAt || company.createdAt || '',
    updated_at: deal.updatedAt || deal.updated_at || deal.lastInteractionAt || '',
    won_at: deal.wonAt || deal.won_at || '',
    closed_at: deal.closedAt || deal.closed_at || deal.finishedAt || deal.finished_at || '',
    won: Boolean(deal.won || normalizeLabel(rawStatus).includes('ganh') || normalizeLabel(rawStatus).includes('vendid')),
    lost: Boolean(deal.lost || normalizeLabel(rawStatus).includes('perd') || normalizeLabel(rawStatus).includes('lost')),
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
      name: `${deal.pipelineName || deal.funnelName || stage?.pipelineName || 'Pipeline não identificado'}`.trim(),
    },
    stage: {
      id: rawStageId || stage?.id || '',
      name: `${deal.dealStageName || deal.stageName || stage?.name || 'Sem etapa definida'}`.trim(),
      position: Number(deal.stageOrder ?? stage?.position ?? 0) || 0,
      pipeline_id: rawPipelineId || stage?.pipelineId || 'unknown',
    },
    deal_stage_name: `${deal.dealStageName || deal.stageName || stage?.name || ''}`.trim(),
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

    if (!token) {
      return NextResponse.json({ error: provider === 'agendor' ? 'Informe o token do Agendor.' : 'Informe o token do RD Station CRM.' }, { status: 400 })
    }

    const deals = provider === 'agendor'
      ? (() => Promise.all([
        fetchPagedAgendorCollection('/deal_stages', 'dealStages', token, 'Não foi possível consultar as etapas do Agendor.'),
        fetchPagedAgendorCollection('/deals', 'deals', token, 'Não foi possível consultar as negociações do Agendor.'),
      ]).then(([dealStages, rawDeals]) => {
        const stagesById = new Map(dealStages.map(normalizeAgendorStage).filter(Boolean).map((stage) => [stage.id, stage]))
        return rawDeals.map((deal) => normalizeAgendorDeal(deal, stagesById)).filter(Boolean)
      }))()
      : fetchPagedRdCollection(
        `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=200`,
        'deals',
        'Não foi possível consultar as negociações do RD Station.'
      )

    const pipelineMap = new Map()

    deals.forEach((deal) => {
      const pipeline = getDealPipelineInfo(deal)
      const current = pipelineMap.get(pipeline.id)

      if (current) {
        current.deals += 1
        return
      }

      pipelineMap.set(pipeline.id, {
        id: pipeline.id,
        name: pipeline.name,
        deals: 1,
      })
    })

    const pipelines = Array.from(pipelineMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    const dealsForSelectedPipeline = selectedPipelineSet.size
      ? deals.filter((deal) => selectedPipelineSet.has(getDealPipelineInfo(deal).id))
      : deals

    const stageOrderMap = new Map()
    const stageIdOrderMap = new Map()
    const stageFirstSeenMap = new Map()

    dealsForSelectedPipeline.forEach((deal, index) => {
      const label = getDealStageLabel(deal)
      if (!label) return

      if (!stageFirstSeenMap.has(label)) {
        stageFirstSeenMap.set(label, index)
      }

      const detectedOrder = getDealStageOrder(deal)
      if (detectedOrder !== null) {
        const currentOrder = stageOrderMap.get(label)
        if (currentOrder === undefined || detectedOrder < currentOrder) {
          stageOrderMap.set(label, detectedOrder)
        }
      }

      const stageId = getDealStageId(deal)
      if (stageId) {
        const parsedStageId = Number(stageId)
        const currentIdOrder = stageIdOrderMap.get(label)
        if (Number.isFinite(parsedStageId) && (currentIdOrder === undefined || parsedStageId < currentIdOrder)) {
          stageIdOrderMap.set(label, parsedStageId)
        }
      }
    })

    const stages = Array.from(stageFirstSeenMap.keys()).sort((a, b) => {
      const orderA = stageOrderMap.get(a)
      const orderB = stageOrderMap.get(b)

      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) return orderA - orderB
      if (orderA !== undefined && orderB === undefined) return -1
      if (orderA === undefined && orderB !== undefined) return 1

      const stageIdA = stageIdOrderMap.get(a)
      const stageIdB = stageIdOrderMap.get(b)
      if (stageIdA !== undefined && stageIdB !== undefined && stageIdA !== stageIdB) return stageIdA - stageIdB
      if (stageIdA !== undefined && stageIdB === undefined) return -1
      if (stageIdA === undefined && stageIdB !== undefined) return 1

      return (stageFirstSeenMap.get(a) || 0) - (stageFirstSeenMap.get(b) || 0)
    })

    return NextResponse.json({
      pipelines,
      stages,
      selectedPipelineId: selectedPipelineIds.join(','),
    })
  } catch (error) {
    console.error('CRM pipelines error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os funis do CRM.' }, { status: 500 })
  }
}
