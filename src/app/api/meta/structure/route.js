import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveMetaDateSelection } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

function buildInsightsParams(searchParams, token) {
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const datePreset = searchParams.get('date_preset') || 'last_7d'
  const params = new URLSearchParams({
    access_token: token,
    fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend',
    level: 'ad',
  })
  const resolvedDateSelection = resolveMetaDateSelection(datePreset, since, until)

  if (resolvedDateSelection.mode === 'time_range') {
    params.set(
      'time_range',
      JSON.stringify({ since: resolvedDateSelection.since, until: resolvedDateSelection.until })
    )
  } else {
    params.set('date_preset', resolvedDateSelection.datePreset)
  }

  return params
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta ou informe um token manual para carregar a estrutura.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const structureParams = buildInsightsParams(searchParams, token)
    const structureUrl = `https://graph.facebook.com/v19.0/${id}/insights?${structureParams.toString()}`

    const data = await fetchMetaJson(
      structureUrl,
      'A Meta demorou para responder ao carregar campanhas, conjuntos e anúncios. Tente novamente em alguns instantes.',
      { maxPages: 4 }
    )

    const rows = (data.data || [])
      .map((item) => ({
        campaignId: item.campaign_id || '',
        campaignName: item.campaign_name || 'Campanha sem nome',
        adsetId: item.adset_id || '',
        adsetName: item.adset_name || 'Conjunto sem nome',
        adId: item.ad_id || '',
        adName: item.ad_name || 'Anúncio sem nome',
        spend: Number(item.spend || 0),
      }))
      .filter((item) => item.campaignId && item.adsetId && item.adId && item.spend > 0)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Meta structure error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
