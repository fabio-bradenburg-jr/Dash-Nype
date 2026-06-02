import { after, NextResponse } from 'next/server'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

const BACKGROUND_WARM_DELAY_MS = 8_000

function buildInternalMetaUrl(origin, pathname, params) {
  return `${origin}${pathname}?${params.toString()}`
}

async function warmMetaDashboard({ origin, token, params }) {
  await new Promise((resolve) => setTimeout(resolve, BACKGROUND_WARM_DELAY_MS))

  const headers = {
    'x-meta-access-token': token,
  }
  const datePreset = params.get('date_preset') || 'last_7d'
  const warmParamGroups = [params]

  ;['last_7d', 'last_30d'].forEach((nextDatePreset) => {
    if (nextDatePreset === datePreset) return

    warmParamGroups.push(new URLSearchParams({
      ad_account_id: params.get('ad_account_id'),
      date_preset: nextDatePreset,
    }))
  })

  let rejectedCount = 0
  for (const warmParams of warmParamGroups) {
    const requests = [
      buildInternalMetaUrl(origin, '/api/meta/structure', warmParams),
      buildInternalMetaUrl(origin, '/api/meta/insights', warmParams),
      buildInternalMetaUrl(origin, '/api/meta/campaigns', warmParams),
      buildInternalMetaUrl(origin, '/api/meta/breakdowns', warmParams),
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

    rejectedCount += results.filter((result) => result.status === 'rejected').length
  }

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

    after(() => warmMetaDashboard({ origin, token, params }))

    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch (error) {
    console.error('Meta background warm error:', error)
    return NextResponse.json({ error: 'Não foi possível iniciar o carregamento em segundo plano.' }, { status: 500 })
  }
}
