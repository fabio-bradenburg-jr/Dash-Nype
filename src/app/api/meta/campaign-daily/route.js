import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entityId') || ''
    const datePreset = searchParams.get('date_preset') || 'last_30d'
    const since = searchParams.get('since') || ''
    const until = searchParams.get('until') || ''

    if (!entityId) {
      return NextResponse.json({ error: 'entityId é obrigatório.' }, { status: 400 })
    }

    const token = await resolveWorkspaceMetaAccessToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta.' }, { status: 400 })
    }

    const params = new URLSearchParams({
      access_token: token,
      fields: 'spend,impressions,clicks,actions,date_start,date_stop',
      time_increment: '1',
      limit: '90',
    })

    if (since && until) {
      params.set('time_range', JSON.stringify({ since, until }))
    } else {
      params.set('date_preset', datePreset)
    }

    const url = `https://graph.facebook.com/v19.0/${entityId}/insights?${params.toString()}`
    const raw = await fetchMetaJson(url, 'A Meta demorou para responder.', { maxPages: 2 })
    const rows = (raw?.data || []).map((row) => {
      const formatted = formatInsightsWithConversions(row)
      const actions = row.actions || []
      const purchase = actions.find((a) => a.action_type === 'purchase')
      const lead = actions.find((a) => a.action_type === 'lead')
      const results = parseFloat((purchase || lead || {}).value || 0)
      const ctr = parseFloat(row.clicks || 0) > 0 && parseFloat(row.impressions || 0) > 0
        ? (parseFloat(row.clicks) / parseFloat(row.impressions)) * 100
        : 0

      return {
        date_start: row.date_start,
        date_stop: row.date_stop,
        spend: parseFloat(row.spend || 0),
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        results,
        ctr: parseFloat(ctr.toFixed(4)),
      }
    })

    return NextResponse.json({ data: rows })
  } catch (error) {
    console.error('Campaign daily insights error:', error)
    return NextResponse.json(
      { error: normalizeMetaError(error, 'Não foi possível carregar dados diários da campanha.') },
      { status: 500 }
    )
  }
}