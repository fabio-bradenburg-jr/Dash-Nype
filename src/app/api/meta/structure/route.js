import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { buildMetaInsightsFilterExpression } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

function buildInsightsField(searchParams) {
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const datePreset = searchParams.get('date_preset') || 'last_7d'
  return `${buildMetaInsightsFilterExpression(datePreset, since, until)}.limit(1){spend}`
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const token = await resolveWorkspaceMetaAccessToken(request)
    const insightsField = buildInsightsField(searchParams)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta ou informe um token manual para carregar a estrutura.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const fields =
      `id,name,campaign_id,campaign{name},adset_id,adset{name},${insightsField}`
    const structureUrl = `https://graph.facebook.com/v19.0/${id}/ads?fields=${encodeURIComponent(fields)}&limit=500&access_token=${token}`

    const data = await fetchMetaJson(
      structureUrl,
      'A Meta demorou para responder ao carregar campanhas, conjuntos e anúncios. Tente novamente em alguns instantes.',
      { maxPages: 2 }
    )

    const rows = (data.data || [])
      .map((item) => ({
        campaignId: item.campaign_id || item.campaign?.id || '',
        campaignName: item.campaign?.name || 'Campanha sem nome',
        adsetId: item.adset_id || item.adset?.id || '',
        adsetName: item.adset?.name || 'Conjunto sem nome',
        adId: item.id || '',
        adName: item.name || 'Anúncio sem nome',
        spend: Number(item.insights?.data?.[0]?.spend || 0),
      }))
      .filter((item) => item.campaignId && item.adsetId && item.adId && item.spend > 0)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Meta structure error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
