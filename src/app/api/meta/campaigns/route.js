import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

function getMetaToken(request) {
  const headerToken = request.headers.get('x-meta-access-token')
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return headerToken || bearerToken || process.env.META_ACCESS_TOKEN
}

function normalizeCampaign(campaign) {
  const insight = campaign?.insights?.data?.[0] || {}

  return {
    id: campaign?.id || '',
    name: campaign?.name || 'Campanha sem nome',
    status: campaign?.status || '',
    objective: campaign?.objective || '',
    reach: Number(insight?.reach || 0),
    spend: Number(insight?.spend || 0),
    impressions: Number(insight?.impressions || 0),
    cpc: Number(insight?.cpc || 0),
    actions: Array.isArray(insight?.actions) ? insight.actions : [],
    action_values: Array.isArray(insight?.action_values) ? insight.action_values : [],
    cost_per_action_type: Array.isArray(insight?.cost_per_action_type)
      ? insight.cost_per_action_type
      : [],
  }
}

function hasSpendInSelectedPeriod(campaign) {
  return Number(campaign?.spend || 0) > 0
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    
    const token = getMetaToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Informe a chave da Meta e a conta de anúncio para carregar as campanhas.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    
    let timeFilter = `insights.date_preset(${datePreset})`
    if (datePreset === 'custom' && since && until) {
      timeFilter = `insights.time_range({"since":"${since}","until":"${until}"})`
    }
    
    // We use the time filter syntax to fetch campaign details along with their metrics in one call
    const campaignsUrl = `https://graph.facebook.com/v19.0/${id}/campaigns?fields=id,name,status,objective,${timeFilter}{spend,reach,impressions,cpc,actions,action_values,cost_per_action_type}&limit=50&access_token=${token}`
    
    const data = await fetchMetaJson(
      campaignsUrl,
      'A Meta demorou para responder ao carregar as campanhas. Tente novamente em alguns instantes.'
    )

    return NextResponse.json(
      (data.data || [])
        .map(normalizeCampaign)
        .filter(hasSpendInSelectedPeriod)
    )
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
