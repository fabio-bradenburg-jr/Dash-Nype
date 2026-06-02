import { after, NextResponse } from 'next/server'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveMetaDateSelection } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'
import { createAdminClient } from '@/lib/server/supabase-admin'

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

function normalizeStringValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeDetailDailyRows(rows = [], labelKey) {
  return rows
    .map((row) => {
      const formatted = formatInsightsWithConversions(row)
      return {
        date_start: row.date_start || '',
        date_stop: row.date_stop || '',
        label: row[labelKey] || row.region || row.age || row.city || row.name || 'Não informado',
        spend: parseFloat(row.spend || 0),
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        custom_metrics: formatted.custom_metrics,
      }
    })
    .sort((left, right) => String(left.date_start).localeCompare(String(right.date_start)))
}

async function readSavedCreativeDetails(adAccountId, ads) {
  const adIds = ads.map((ad) => ad.ad_id).filter(Boolean)
  if (!adAccountId || !adIds.length) return new Map()

  try {
    const clientKey = String(adAccountId).replace(/^act_/, '')
    const supabase = createAdminClient()
    const detailsByAdId = new Map()

    for (let index = 0; index < adIds.length; index += 250) {
      const { data, error } = await supabase
        .from('meta_creative_cache')
        .select('ad_id,payload')
        .eq('client_key', clientKey)
        .in('ad_id', adIds.slice(index, index + 250))

      if (error) throw error
      ;(data || []).forEach((item) => detailsByAdId.set(item.ad_id, item.payload || {}))
    }

    return detailsByAdId
  } catch {
    return new Map()
  }
}

async function saveCreativeRanking(adAccountId, creatives) {
  if (!adAccountId || !creatives.length) return

  try {
    const clientKey = String(adAccountId).replace(/^act_/, '')
    const supabase = createAdminClient()
    const rows = creatives.map((creative) => ({
          client_key: clientKey,
          ad_id: creative.adId,
          payload: {
            ...creative,
            previewLoaded: false,
          },
          fetched_at: new Date().toISOString(),
        }))

    for (let index = 0; index < rows.length; index += 250) {
      const { error } = await supabase
        .from('meta_creative_cache')
        .upsert(rows.slice(index, index + 250), {
          onConflict: 'client_key,ad_id',
          ignoreDuplicates: true,
        })

      if (error) throw error
    }
  } catch {
    // Ranking persistence must not prevent the dashboard from rendering Meta results.
  }
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
    const detailType = searchParams.get('detail_type') || ''
    const detailScope = searchParams.get('detail_scope') || ''
    const detailValue = searchParams.get('detail_value') || ''
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

    const creativeParams = buildBaseParams({ token, datePreset, since, until, fields: `ad_id,ad_name,campaign_id,adset_id,${creativeInsightFields}` })
    creativeParams.set('level', 'ad')
    appendMetaEntityFiltering(creativeParams, campaignIds, adsetIds, adIds)

    const creativeUrl = `https://graph.facebook.com/v19.0/${id}/insights?${creativeParams.toString()}`
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
      cityRows = stateResult.data?.data || []
      cityLabelKey = 'region'
      geoScope = 'region'
      cityError = stateResult.error || cityError

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

    let detailDaily = []
    if (detailType && detailValue) {
      const breakdownKey = detailScope
        || (detailType === 'states'
          ? 'region'
          : detailType === 'ages'
            ? 'age'
            : detailType === 'cities'
              ? 'city'
              : '')

      if (breakdownKey) {
        const detailParams = buildBaseParams({ token, datePreset, since, until, fields: geographicInsightFields })
        detailParams.set('breakdowns', breakdownKey)
        detailParams.set('time_increment', '1')
        appendMetaEntityFiltering(detailParams, campaignIds, adsetIds, adIds)

        const detailResult = await fetchMetaBreakdownSafely(
          `https://graph.facebook.com/v19.0/${id}/insights?${detailParams.toString()}`,
          'A Meta demorou para responder ao carregar a evolução detalhada desse item.'
        )

        const normalizedDetailValue = normalizeStringValue(detailValue)
        detailDaily = normalizeDetailDailyRows(
          (detailResult.data?.data || []).filter((row) => normalizeStringValue(row[breakdownKey]) === normalizedDetailValue),
          breakdownKey
        )
      }
    }

    const investedCreativeRows = (creativeResult.data?.data || [])
      .filter((ad) => parseFloat(ad.spend || 0) > 0)
    const creativeDetailsByAdId = await readSavedCreativeDetails(adAccountId, investedCreativeRows)
    const creatives = investedCreativeRows
      .map((insightRow) => {
        const ad = creativeDetailsByAdId.get(insightRow.ad_id) || {}
        const insight = formatInsightsWithConversions(insightRow)
        return {
          adId: insightRow.ad_id || '',
          campaignId: insightRow.campaign_id || '',
          adsetId: insightRow.adset_id || '',
          label: insightRow.ad_name || ad.label || 'Criativo sem nome',
          imageUrl: ad.imageUrl || '',
          spend: parseFloat(insight.spend || 0),
          impressions: parseInt(insight.impressions || 0, 10),
          clicks: parseInt(insight.clicks || 0, 10),
          custom_metrics: insight.custom_metrics || {},
        }
      })
      .sort((a, b) => (b.custom_metrics?.totalConversions || 0) - (a.custom_metrics?.totalConversions || 0))

    after(() => saveCreativeRanking(adAccountId, creatives))

    return NextResponse.json({
      ad_account_id: adAccountId,
      ages: normalizeBreakdownRows(ageResult.data?.data || [], 'age', { limit: Number.MAX_SAFE_INTEGER }),
      states: normalizeBreakdownRows(stateResult.data?.data || [], 'region', { limit: Number.MAX_SAFE_INTEGER }),
      cities: normalizeBreakdownRows(cityRows, cityLabelKey, { limit: 100 }),
      creatives,
      detail_daily: detailDaily,
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
