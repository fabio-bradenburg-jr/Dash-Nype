import { after, NextResponse } from 'next/server'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

const DEFAULT_BACKGROUND_WARM_DELAY_MS = 8_000
const MAX_BACKGROUND_WARM_DELAY_MS = 60_000

function buildInternalMetaUrl(origin, pathname, params) {
  return `${origin}${pathname}?${params.toString()}`
}

function resolveBackgroundWarmDelay(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_BACKGROUND_WARM_DELAY_MS
  return Math.min(Math.max(Math.round(parsed), 0), MAX_BACKGROUND_WARM_DELAY_MS)
}

async function warmMetaDashboard({ origin, token, params, delayMs }) {
  await new Promise((resolve) => setTimeout(resolve, delayMs))

  const headers = {
    'x-meta-access-token': token,
  }
  const requests = [
    buildInternalMetaUrl(origin, '/api/meta/structure', params),
    buildInternalMetaUrl(origin, '/api/meta/insights', params),
    buildInternalMetaUrl(origin, '/api/meta/campaigns', params),
    buildInternalMetaUrl(origin, '/api/meta/breakdowns', params),
  ]

  const results = await Promise.allSettled(
    requests.map(async (url) => {
      const response = await fetch(url, {
        headers,
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Meta warm request failed with status ${response.status}.`)
      }
    })
  )

  const rejectedCount = results.filter((result) => result.status === 'rejected').length
  if (rejectedCount > 0) {
    console.error(`Meta background warm completed with ${rejectedCount} failed request(s).`)
  }
}

export async function GET(request) {
  try {
    const { origin, searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    const delayMs = resolveBackgroundWarmDelay(searchParams.get('delay_ms'))
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Informe uma conta Meta válida para aquecer o dashboard.' }, { status: 400 })
    }

    if (datePreset === 'custom' && (!since || !until)) {
      return NextResponse.json({ error: 'Informe o período personalizado completo para aquecer o dashboard.' }, { status: 400 })
    }

    const params = new URLSearchParams({
      ad_account_id: adAccountId,
      date_preset: datePreset,
    })

    if (datePreset === 'custom') {
      params.set('since', since)
      params.set('until', until)
    }

    after(() => warmMetaDashboard({ origin, token, params, delayMs }))

    return NextResponse.json({ accepted: true, delayMs }, { status: 202 })
  } catch (error) {
    console.error('Meta background warm error:', error)
    return NextResponse.json({ error: 'Não foi possível iniciar o carregamento em segundo plano.' }, { status: 500 })
  }
}
