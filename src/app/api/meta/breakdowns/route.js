import { NextResponse } from 'next/server'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'

function getMetaToken(request) {
  const headerToken = request.headers.get('x-meta-access-token')
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return headerToken || bearerToken || process.env.META_ACCESS_TOKEN
}

function buildBaseParams({ token, datePreset, since, until, fields }) {
  const params = new URLSearchParams({ access_token: token, fields })

  if (datePreset === 'custom' && since && until) {
    params.set('time_range', JSON.stringify({ since, until }))
  } else {
    params.set('date_preset', datePreset)
  }

  return params
}

function normalizeBreakdownRows(rows = [], labelKey) {
  return rows
    .map((row) => {
      const formatted = formatInsightsWithConversions(row)
      return {
        label: row[labelKey] || row.region || row.age || row.name || 'Não informado',
        spend: parseFloat(row.spend || 0),
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        custom_metrics: formatted.custom_metrics,
      }
    })
    .sort((a, b) => (b.custom_metrics?.totalConversions || 0) - (a.custom_metrics?.totalConversions || 0))
    .slice(0, 5)
}

function normalizeCreativeLabel(ad) {
  const rawLabel = ad.name || ad.creative?.name || 'Criativo sem nome'

  return rawLabel
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchMetaPayload(url) {
  const response = await fetch(url)
  return response.json()
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
      return NextResponse.json({ error: 'Informe a chave da Meta e a conta de anúncio para carregar os rankings.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const insightFields = 'spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type'

    const ageParams = buildBaseParams({ token, datePreset, since, until, fields: insightFields })
    ageParams.set('breakdowns', 'age')

    const cityParams = buildBaseParams({ token, datePreset, since, until, fields: insightFields })
    cityParams.set('breakdowns', 'city')

    const creativeTimeFilter = datePreset === 'custom' && since && until
      ? `insights.time_range({"since":"${since}","until":"${until}"})`
      : `insights.date_preset(${datePreset})`

    const creativeUrl = `https://graph.facebook.com/v19.0/${id}/ads?fields=name,creative{name,thumbnail_url,image_url,effective_object_story_id,object_story_spec},${creativeTimeFilter}{spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type}&limit=100&access_token=${token}`

    const [ageData, cityData, creativeData] = await Promise.all([
      fetchMetaJson(
        `https://graph.facebook.com/v19.0/${id}/insights?${ageParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
      fetchMetaPayload(`https://graph.facebook.com/v19.0/${id}/insights?${cityParams.toString()}`),
      fetchMetaJson(
        creativeUrl,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
    ])

    let cityRows = cityData.data || []
    let cityLabelKey = 'city'

    if (cityData.error) {
      const regionParams = buildBaseParams({ token, datePreset, since, until, fields: insightFields })
      regionParams.set('breakdowns', 'region')
      const regionData = await fetchMetaJson(
        `https://graph.facebook.com/v19.0/${id}/insights?${regionParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      )

      cityRows = regionData.data || []
      cityLabelKey = 'region'
    }

    if (ageData.error) throw new Error(ageData.error.message)
    if (creativeData.error) throw new Error(creativeData.error.message)

    const creatives = (creativeData.data || [])
      .map((ad) => {
        const insight = formatInsightsWithConversions(ad.insights?.data?.[0] || {})
        return {
          label: normalizeCreativeLabel(ad),
          imageUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || '',
          spend: parseFloat(insight.spend || 0),
          impressions: parseInt(insight.impressions || 0, 10),
          clicks: parseInt(insight.clicks || 0, 10),
          custom_metrics: insight.custom_metrics || {},
        }
      })
      .sort((a, b) => (b.custom_metrics?.totalConversions || 0) - (a.custom_metrics?.totalConversions || 0))
      .slice(0, 5)

    return NextResponse.json({
      ages: normalizeBreakdownRows(ageData.data || [], 'age'),
      cities: normalizeBreakdownRows(cityRows, cityLabelKey),
      creatives,
    })
  } catch (error) {
    console.error('Meta breakdowns error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
