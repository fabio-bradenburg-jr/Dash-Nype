import { NextResponse } from 'next/server'
import { googleAdsApiFetch, formatGoogleAdsCustomerId } from '@/lib/server/google-ads'

function normalizeCustomerId(value) {
  return String(value || '').replace(/\D/g, '')
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveDateRange(datePreset, since, until) {
  if (datePreset === 'custom' && since && until) {
    return { since, until }
  }

  const end = new Date()
  end.setHours(0, 0, 0, 0)
  if (datePreset === 'this_month') {
    const start = new Date(end.getFullYear(), end.getMonth(), 1)
    return { since: formatDate(start), until: formatDate(end) }
  }
  const start = new Date(end)
  const days = datePreset === 'last_30d' ? 29 : datePreset === 'last_14d' ? 13 : 6
  start.setDate(end.getDate() - days)
  return { since: formatDate(start), until: formatDate(end) }
}

function microsToCurrency(value) {
  return Number(value || 0) / 1000000
}

function normalizeCampaignRow(row) {
  const campaign = row?.campaign || {}
  const metrics = row?.metrics || {}
  const cost = microsToCurrency(metrics.costMicros || metrics.cost_micros)
  const clicks = Number(metrics.clicks || 0)
  const conversions = Number(metrics.conversions || 0)
  const impressions = Number(metrics.impressions || 0)

  return {
    id: String(campaign.id || ''),
    name: campaign.name || 'Campanha sem nome',
    status: campaign.status || '',
    spend: cost,
    impressions,
    clicks,
    conversions,
    conversionValue: Number(metrics.conversionsValue || metrics.conversions_value || 0),
    ctr: Number(metrics.ctr || 0) * 100,
    cpc: microsToCurrency(metrics.averageCpc || metrics.average_cpc || (clicks > 0 ? (cost * 1000000) / clicks : 0)),
    costPerConversion: conversions > 0 ? cost / conversions : 0,
    roas: cost > 0 ? Number(metrics.conversionsValue || metrics.conversions_value || 0) / cost : 0,
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = normalizeCustomerId(searchParams.get('customer_id'))
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const { since, until } = resolveDateRange(datePreset, searchParams.get('since'), searchParams.get('until'))

    if (!customerId) {
      return NextResponse.json({ error: 'Selecione uma conta do Google Ads para carregar os dados.' }, { status: 400 })
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND campaign.status != REMOVED
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `
    const { data } = await googleAdsApiFetch(request, `customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      customerId,
      body: { query },
    })
    const campaigns = (Array.isArray(data) ? data : [])
      .flatMap((chunk) => chunk.results || [])
      .map(normalizeCampaignRow)
      .filter((campaign) => campaign.spend > 0 || campaign.impressions > 0 || campaign.clicks > 0 || campaign.conversions > 0)

    const summary = campaigns.reduce(
      (accumulator, campaign) => {
        accumulator.spend += campaign.spend
        accumulator.impressions += campaign.impressions
        accumulator.clicks += campaign.clicks
        accumulator.conversions += campaign.conversions
        accumulator.conversionValue += campaign.conversionValue
        return accumulator
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
    )

    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0
    summary.costPerConversion = summary.conversions > 0 ? summary.spend / summary.conversions : 0
    summary.roas = summary.spend > 0 ? summary.conversionValue / summary.spend : 0

    return NextResponse.json({
      customerId,
      accountLabel: formatGoogleAdsCustomerId(customerId),
      since,
      until,
      summary,
      campaigns,
    })
  } catch (error) {
    console.error('Google Ads API Error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os dados do Google Ads.' }, { status: 500 })
  }
}
