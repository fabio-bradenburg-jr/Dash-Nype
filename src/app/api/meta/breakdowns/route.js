import { NextResponse } from 'next/server'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { buildMetaInsightsFilterExpression, resolveMetaDateSelection } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'

function buildBaseParams({ token, datePreset, since, until, fields }) {
  const params = new URLSearchParams({ access_token: token, fields })
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

function appendMetaEntityFiltering(params, campaignIds = [], adsetIds = [], adIds = []) {
  if (campaignIds.includes('__none__') || adsetIds.includes('__none__') || adIds.includes('__none__')) return

  if (adIds.length > 0) {
    params.set(
      'filtering',
      JSON.stringify([
        {
          field: 'ad.id',
          operator: 'IN',
          value: adIds,
        },
      ])
    )
    return
  }

  if (adsetIds.length > 0) {
    params.set(
      'filtering',
      JSON.stringify([
        {
          field: 'adset.id',
          operator: 'IN',
          value: adsetIds,
        },
      ])
    )
    return
  }

  if (campaignIds.length > 0) {
    params.set(
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
}

function normalizeBreakdownRows(rows = [], labelKey, { limit = 5 } = {}) {
  return rows
    .map((row) => {
      const formatted = formatInsightsWithConversions(row)
      return {
        label: row[labelKey] || row.region || row.age || row.name || 'Não informado',
        city: row.city || '',
        region: row.region || '',
        country: row.country || '',
        age: row.age || '',
        spend: parseFloat(row.spend || 0),
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        custom_metrics: formatted.custom_metrics,
      }
    })
    .sort((a, b) => (b.custom_metrics?.totalConversions || 0) - (a.custom_metrics?.totalConversions || 0))
    .slice(0, limit)
}

function normalizeCreativeLabel(ad) {
  const rawLabel = ad.name || ad.creative?.name || 'Criativo sem nome'

  return rawLabel
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchMetaBreakdownSafely(url, fallbackMessage) {
  try {
    const data = await fetchMetaJson(url, fallbackMessage)
    return {
      data,
      error: '',
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeMetaError(error, fallbackMessage),
    }
  }
}

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
      return NextResponse.json({ error: 'Conecte uma conta da Meta ou informe um token manual para carregar os rankings.' }, { status: 400 })
    }

    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const geographicInsightFields = 'spend,impressions,clicks,actions,action_values'
    const creativeInsightFields = 'spend,impressions,clicks,actions,action_values,cost_per_action_type'

    if (campaignIds.includes('__none__') || adsetIds.includes('__none__') || adIds.includes('__none__')) {
      return NextResponse.json({
        ages: [],
        states: [],
        cities: [],
        creatives: [],
      })
    }

    const ageParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
    ageParams.set('breakdowns', 'age')
    appendMetaEntityFiltering(ageParams, campaignIds, adsetIds, adIds)

    const cityParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
    cityParams.set('breakdowns', 'city')
    appendMetaEntityFiltering(cityParams, campaignIds, adsetIds, adIds)

    const stateParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
    stateParams.set('breakdowns', 'region')
    appendMetaEntityFiltering(stateParams, campaignIds, adsetIds, adIds)

    const creativeTimeFilter = buildMetaInsightsFilterExpression(datePreset, since, until)

    const creativeUrl = `https://graph.facebook.com/v19.0/${id}/ads?fields=id,name,campaign_id,adset_id,creative{name,thumbnail_url,image_url,effective_object_story_id,object_story_spec},${creativeTimeFilter}{${creativeInsightFields}}&limit=100&access_token=${token}`

    const [ageResult, cityResult, stateResult, creativeResult] = await Promise.all([
      fetchMetaBreakdownSafely(
        `https://graph.facebook.com/v19.0/${id}/insights?${ageParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
      fetchMetaBreakdownSafely(
        `https://graph.facebook.com/v19.0/${id}/insights?${cityParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
      fetchMetaBreakdownSafely(
        `https://graph.facebook.com/v19.0/${id}/insights?${stateParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
      fetchMetaBreakdownSafely(
        creativeUrl,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      ),
    ])

    let cityRows = cityResult.data?.data || []
    let cityLabelKey = 'city'
    let cityError = cityResult.error || ''
    let geoScope = 'city'

    if (!cityRows.length && cityError) {
      const regionParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
      regionParams.set('breakdowns', 'region')
      appendMetaEntityFiltering(regionParams, campaignIds, adsetIds, adIds)
      const regionResult = await fetchMetaBreakdownSafely(
        `https://graph.facebook.com/v19.0/${id}/insights?${regionParams.toString()}`,
        'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
      )

      cityRows = regionResult.data?.data || []
      cityLabelKey = 'region'
      geoScope = 'region'
      cityError = regionResult.error || cityError

      if (!cityRows.length && cityError) {
        const countryParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
        countryParams.set('breakdowns', 'country')
        appendMetaEntityFiltering(countryParams, campaignIds, adsetIds, adIds)
        const countryResult = await fetchMetaBreakdownSafely(
          `https://graph.facebook.com/v19.0/${id}/insights?${countryParams.toString()}`,
          'A Meta demorou para responder ao carregar os rankings detalhados. Tente novamente em alguns instantes.'
        )

        cityRows = countryResult.data?.data || []
        cityLabelKey = 'country'
        geoScope = 'country'
        cityError = countryResult.error || cityError
      }
    }

    const creatives = (creativeResult.data?.data || [])
      .filter((ad) => {
        if (adIds.length > 0) return adIds.includes(ad.id)
        if (adsetIds.length > 0) return adsetIds.includes(ad.adset_id)
        if (campaignIds.length > 0) return campaignIds.includes(ad.campaign_id)
        return true
      })
      .map((ad) => {
        const insight = formatInsightsWithConversions(ad.insights?.data?.[0] || {})
        return {
          label: normalizeCreativeLabel(ad),
          imageUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || '',
          spend: parseFloat(insight.spend || 0),
          impressions: parseInt(insight.impressions || 0, 10),
          clicks: parseInt(insight.clicks || 0, 10),
          custom_metrics: insight.custom_metrics || {},
        }
      })
      .sort((a, b) => (b.custom_metrics?.totalConversions || 0) - (a.custom_metrics?.totalConversions || 0))
      .slice(0, 5)

    return NextResponse.json({
      ages: normalizeBreakdownRows(ageResult.data?.data || [], 'age'),
      states: normalizeBreakdownRows(stateResult.data?.data || [], 'region', { limit: Number.MAX_SAFE_INTEGER }),
      cities: normalizeBreakdownRows(cityRows, cityLabelKey),
      creatives,
      geoScope,
      errors: {
        ages: ageResult.error || '',
        states: stateResult.error || '',
        cities: cityError,
        creatives: creativeResult.error || '',
      },
    })
  } catch (error) {
    console.error('Meta breakdowns error:', error)
    return NextResponse.json({ error: normalizeMetaError(error) }, { status: 500 })
  }
}
