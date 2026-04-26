import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'

type UnknownRecord = Record<string, unknown>

function readArrayPayload(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) return payload.filter(Boolean) as UnknownRecord[]
  if (!payload || typeof payload !== 'object') return []
  const record = payload as UnknownRecord

  const candidates = [
    record.data,
    record.items,
    record.results,
    record.content,
    record.dealStages,
    record.pipelines,
    record.funnels,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(Boolean) as UnknownRecord[]
  }

  return []
}

function asPipelineOption(item: UnknownRecord) {
  const id = String(item.id || item.pipelineId || item.stageId || item.dealStageId || '').trim()
  const name = String(item.name || item.title || item.label || '').trim()
  const pipelineName = String(
    (item.pipeline as UnknownRecord | undefined)?.name ||
      (item.funnel as UnknownRecord | undefined)?.name ||
      (item.dealPipeline as UnknownRecord | undefined)?.name ||
      (item.dealFunnel as UnknownRecord | undefined)?.name ||
      item.pipelineName ||
      item.funnelName ||
      ''
  ).trim()

  if (!id || !name) return null

  return {
    id,
    name,
    label: pipelineName && pipelineName !== name ? `${pipelineName} • ${name}` : name,
  }
}

function extractPipelineOptions(payload: unknown) {
  const baseItems = readArrayPayload(payload)
  const directOptions = baseItems.map(asPipelineOption).filter(Boolean) as Array<{ id: string; name: string; label: string }>
  if (directOptions.length) return directOptions

  const stageMap = new Map<string, { id: string; name: string; label: string }>()
  for (const item of baseItems) {
    const dealStage = item.dealStage
    if (dealStage && typeof dealStage === 'object') {
      const normalized = asPipelineOption(dealStage as UnknownRecord)
      if (normalized) stageMap.set(normalized.id, normalized)
    }
  }

  return Array.from(stageMap.values())
}

async function fetchAgendorJson(path: string, token: string) {
  const response = await fetch(`https://api.agendor.com.br/v3${path}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  return { response, data }
}

const CANDIDATE_ENDPOINTS = ['/deal_stages', '/dealStages', '/pipelines', '/funnels', '/deals?limit=100']

export async function POST(request: Request) {
  const sessionToken = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!sessionToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const payload = await request.json().catch(() => ({}))
  const token = String(payload?.token || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Informe o token do Agendor.' }, { status: 400 })
  }

  let lastError = 'Não foi possível ler os pipelines do Agendor.'

  for (const endpoint of CANDIDATE_ENDPOINTS) {
    try {
      const { response, data } = await fetchAgendorJson(endpoint, token)
      if (!response.ok) {
        lastError = String((data as UnknownRecord)?.message || (data as UnknownRecord)?.error || lastError)
        continue
      }

      const pipelines = extractPipelineOptions(data)
      if (pipelines.length > 0) {
        return NextResponse.json({ pipelines })
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  return NextResponse.json(
    {
      error:
        lastError ||
        'Não encontramos pipelines no token informado. Confira a permissão do token e se a conta tem pipelines cadastrados.',
    },
    { status: 400 }
  )
}
