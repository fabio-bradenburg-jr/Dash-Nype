import { NextResponse } from 'next/server'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveMetaDateSelection } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('ad_account_id')
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    const campaignIds = searchParams.getAll('campaign_ids').flatMap((value) => value.split(',')).filter(Boolean)
    const adsetIds = searchParams.getAll('adset_ids').flatMap((value) => value.split(',')).filter(Boolean)
    const adIds = searchParams.getAll('ad_ids').flatMap((value) => value.split(',')).filter(Boolean)
    
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta ou informe um token manual para carregar os dados.' }, { status: 400 })
    }

    // Ensure the act_ prefix
    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    
    // Facebook API Fields for KPIs
    const fields = 'spend,reach,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type,video_play_actions,video_p25_watched_actions,video_thruplay_watched_actions'
    const baseParams = new URLSearchParams({ fields, access_token: token })
    const resolvedDateSelection = resolveMetaDateSelection(datePreset, since, until)

    if (resolvedDateSelection.mode === 'time_range') {
      baseParams.set(
        'time_range',
        JSON.stringify({ since: resolvedDateSelection.since, until: resolvedDateSelection.until })
      )
    } else {
      baseParams.set('date_preset', resolvedDateSelection.datePreset)
    }

    if (campaignIds.includes('__none__') || adsetIds.includes('__none__') || adIds.includes('__none__')) {
      return NextResponse.json({
        summary: formatInsightsWithConversions(null),
        daily: [],
      })
    }

    if (adIds.length > 0) {
      baseParams.set(
        'filtering',
        JSON.stringify([
          {
            field: 'ad.id',
            operator: 'IN',
            value: adIds,
          },
        ])
      )
    } else if (adsetIds.length > 0) {
      baseParams.set(
        'filtering',
        JSON.stringify([
          {
            field: 'adset.id',
            operator: 'IN',
            value: adsetIds,
          },
        ])
      )
    } else if (campaignIds.length > 0) {
      baseParams.set(
        'filtering',
        JSON.stringify([
          {
            field: 'campaign.id',
            operator: 'IN',
            value: campaignIds,
          },
        ])
      )
    }
    
    const dailyParams = new URLSearchParams(baseParams)
    dailyParams.set('time_increment', '1')
    const dailyUrl = `https://graph.facebook.com/v19.0/${id}/insights?${dailyParams.toString()}`

    const dailyCampaignParams = new URLSearchParams(baseParams)
    dailyCampaignParams.set('time_increment', '1')
    dailyCampaignParams.set('level', 'campaign')
    dailyCampaignParams.set(
      'fields',
      `campaign_id,campaign_name,${fields}`
    )
    const dailyCampaignUrl = `https://graph.facebook.com/v19.0/${id}/insights?${dailyCampaignParams.toString()}`

    const [dailyData, dailyCampaignData] = await Promise.all([
      fetchMetaJson(
        dailyUrl,
        'A Meta demorou para responder ao carregar os indicadores principais. Tente novamente em alguns instantes.'
      ),
      fetchMetaJson(
        dailyCampaignUrl,
        'A Meta demorou para responder ao carregar a evolução por campanha. Tente novamente em alguns instantes.'
      ),
    ])

    const mergeMetricArrays = (items = []) => {
      const totals = new Map()

      items.flat().forEach((item) => {
        if (!item?.action_type) return

        const current = totals.get(item.action_type) || 0
        totals.set(item.action_type, current + parseFloat(item.value || 0))
      })

      return Array.from(totals.entries()).map(([action_type, value]) => ({
        action_type,
        value: value.toString(),
      }))
    }

    const rawDailyRows = dailyData.data || []
    const summaryBase = rawDailyRows.reduce((accumulator, row) => {
      accumulator.spend += parseFloat(row.spend || 0)
      accumulator.reach += parseInt(row.reach || 0, 10)
      accumulator.impressions += parseInt(row.impressions || 0, 10)
      accumulator.clicks += parseInt(row.clicks || 0, 10)
      accumulator.actions.push(row.actions || [])
      accumulator.action_values.push(row.action_values || [])
      accumulator.cost_per_action_type.push(row.cost_per_action_type || [])
      accumulator.video_play_actions.push(row.video_play_actions || [])
      accumulator.video_p25_watched_actions.push(row.video_p25_watched_actions || [])
      accumulator.video_thruplay_watched_actions.push(row.video_thruplay_watched_actions || [])
      return accumulator
    }, {
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      actions: [],
      action_values: [],
      cost_per_action_type: [],
      video_play_actions: [],
      video_p25_watched_actions: [],
      video_thruplay_watched_actions: [],
    })

    const summaryRaw = rawDailyRows.length > 0 ? {
      spend: summaryBase.spend.toString(),
      reach: summaryBase.reach.toString(),
      impressions: summaryBase.impressions.toString(),
      clicks: summaryBase.clicks.toString(),
      cpc: summaryBase.clicks > 0 ? (summaryBase.spend / summaryBase.clicks).toString() : '0',
      ctr: summaryBase.impressions > 0 ? ((summaryBase.clicks / summaryBase.impressions) * 100).toString() : '0',
      actions: mergeMetricArrays(summaryBase.actions),
      action_values: mergeMetricArrays(summaryBase.action_values),
      cost_per_action_type: mergeMetricArrays(summaryBase.cost_per_action_type),
      video_play_actions: mergeMetricArrays(summaryBase.video_play_actions),
      video_p25_watched_actions: mergeMetricArrays(summaryBase.video_p25_watched_actions),
      video_thruplay_watched_actions: mergeMetricArrays(summaryBase.video_thruplay_watched_actions),
    } : null
      
    return NextResponse.json({
      summary: formatInsightsWithConversions(summaryRaw),
      daily: rawDailyRows.map(formatInsightsWithConversions),
      daily_by_campaign: (dailyCampaignData.data || []).map(formatInsightsWithConversions),
    })
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json({ error: normalizeMetaError(error, 'A Meta demorou para responder ao carregar os indicadores principais. Tente novamente em alguns instantes.') }, { status: 500 })
  }
}
