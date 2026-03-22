import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { buildMetaInsightsFilterExpression } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

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
    
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta ou informe um token manual para carregar as campanhas.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    
    const timeFilter = buildMetaInsightsFilterExpression(datePreset, since, until)
    
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
