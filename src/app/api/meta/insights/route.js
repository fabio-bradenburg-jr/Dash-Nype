import { NextResponse } from 'next/server'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
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
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since')
    const until = searchParams.get('until')
    const campaignIds = searchParams.getAll('campaign_ids').flatMap((value) => value.split(',')).filter(Boolean)
    
    const token = getMetaToken(request)

    if (!token || !adAccountId) {
      return NextResponse.json({ error: 'Informe a chave da Meta e a conta de anúncio para carregar os dados.' }, { status: 400 })
    }

    // Ensure the act_ prefix
    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    
    // Facebook API Fields for KPIs
    const fields = 'spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type'
    const baseParams = new URLSearchParams({ fields, access_token: token })

    if (datePreset === 'custom' && since && until) {
      baseParams.set('time_range', JSON.stringify({ since, until }))
    } else {
      baseParams.set('date_preset', datePreset)
    }

    if (campaignIds.includes('__none__')) {
      return NextResponse.json({
        summary: formatInsightsWithConversions(null),
        daily: [],
      })
    }

    if (campaignIds.length > 0) {
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

    const dailyData = await fetchMetaJson(
      dailyUrl,
      'A Meta demorou para responder ao carregar os indicadores principais. Tente novamente em alguns instantes.'
    )

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
      accumulator.impressions += parseInt(row.impressions || 0, 10)
      accumulator.clicks += parseInt(row.clicks || 0, 10)
      accumulator.actions.push(row.actions || [])
      accumulator.action_values.push(row.action_values || [])
      accumulator.cost_per_action_type.push(row.cost_per_action_type || [])
      return accumulator
    }, {
      spend: 0,
      impressions: 0,
      clicks: 0,
      actions: [],
      action_values: [],
      cost_per_action_type: [],
    })

    const summaryRaw = rawDailyRows.length > 0 ? {
      spend: summaryBase.spend.toString(),
      impressions: summaryBase.impressions.toString(),
      clicks: summaryBase.clicks.toString(),
      cpc: summaryBase.clicks > 0 ? (summaryBase.spend / summaryBase.clicks).toString() : '0',
      ctr: summaryBase.impressions > 0 ? ((summaryBase.clicks / summaryBase.impressions) * 100).toString() : '0',
      actions: mergeMetricArrays(summaryBase.actions),
      action_values: mergeMetricArrays(summaryBase.action_values),
      cost_per_action_type: mergeMetricArrays(summaryBase.cost_per_action_type),
    } : null
      
    return NextResponse.json({
      summary: formatInsightsWithConversions(summaryRaw),
      daily: rawDailyRows.map(formatInsightsWithConversions)
    })
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json({ error: normalizeMetaError(error, 'A Meta demorou para responder ao carregar os indicadores principais. Tente novamente em alguns instantes.') }, { status: 500 })
  }
}
