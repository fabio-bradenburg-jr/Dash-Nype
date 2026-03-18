import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

function getMetaToken(request) {
  const headerToken = request.headers.get('x-meta-access-token')
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return headerToken || bearerToken || process.env.META_ACCESS_TOKEN
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const token = getMetaToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Informe a chave da Meta e a conta de anúncio para carregar a estrutura.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const fields = 'id,name,campaign_id,campaign{name},adset_id,adset{name}'
    const structureUrl = `https://graph.facebook.com/v19.0/${id}/ads?fields=${fields}&limit=500&access_token=${token}`

    const data = await fetchMetaJson(
      structureUrl,
      'A Meta demorou para responder ao carregar campanhas, conjuntos e anúncios. Tente novamente em alguns instantes.'
    )

    const rows = (data.data || [])
      .map((item) => ({
        campaignId: item.campaign_id || item.campaign?.id || '',
        campaignName: item.campaign?.name || 'Campanha sem nome',
        adsetId: item.adset_id || item.adset?.id || '',
        adsetName: item.adset?.name || 'Conjunto sem nome',
        adId: item.id || '',
        adName: item.name || 'Anúncio sem nome',
      }))
      .filter((item) => item.campaignId && item.adsetId && item.adId)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Meta structure error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
