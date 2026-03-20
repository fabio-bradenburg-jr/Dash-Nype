import { NextResponse } from 'next/server'

function getRdToken(request) {
  return request.headers.get('x-rd-station-token') || ''
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

export async function GET(request) {
  try {
    const token = getRdToken(request)
    const { searchParams } = new URL(request.url)
    const selectedPipelineId = searchParams.get('pipeline_id') || ''

    if (!token) {
      return NextResponse.json({ error: 'Informe o token do RD Station CRM.' }, { status: 400 })
    }

    const dealsUrl = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=200`
    const deals = await fetchPagedRdCollection(
      dealsUrl,
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

    const dealsForSelectedPipeline = selectedPipelineId
      ? deals.filter((deal) => getDealPipelineInfo(deal).id === selectedPipelineId)
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
      selectedPipelineId,
    })
  } catch (error) {
    console.error('RD pipelines error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os funis do RD Station.' }, { status: 500 })
  }
}
