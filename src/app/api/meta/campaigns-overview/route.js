import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { formatInsightsWithConversions } from '@/lib/meta-metrics'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveMetaDateSelection } from '@/lib/server/meta-date-range'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext, isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'
import { getDashboardState } from '@/lib/server/dashboard-store'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

const CAMPAIGN_OVERVIEW_FIELDS = 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,actions,action_values,cost_per_action_type'

async function getDashboardAccessContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  const adminSupabase = createAdminClient()
  if (user) {
    return {
      adminSupabase,
      accessContext: await getAccessContext(supabase, user, { adminSupabase }),
    }
  }

  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }

  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '').replace(/^supabase:/, '')
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, role, ai_access_level, can_edit_integrations, workspace_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile?.workspace_id) {
    return { errorResponse: NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 }) }
  }

  const { data: workspace, error: workspaceError } = await adminSupabase
    .from('workspaces')
    .select('id, name, owner_user_id')
    .eq('id', profile.workspace_id)
    .maybeSingle()

  if (workspaceError) throw workspaceError

  const isPrimaryAdmin = isPrimaryAdminEmail(profile.email)
  const isWorkspaceOwner = Boolean(workspace?.owner_user_id && workspace.owner_user_id === profile.id)
  const role = isPrimaryAdmin ? USER_ROLES.MASTER : profile.role === USER_ROLES.MASTER ? USER_ROLES.VIEWER : profile.role || USER_ROLES.VIEWER

  return {
    adminSupabase,
    accessContext: {
      profile,
      role,
      aiAccessLevel: profile.ai_access_level || (isPrimaryAdmin ? 'master' : 'team'),
      workspaceId: profile.workspace_id,
      workspace: workspace || null,
      isWorkspaceOwner,
      canManageUsers: isPrimaryAdmin || isWorkspaceOwner,
      canManageClients: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.OPERATOR,
      canEditIntegrations: isPrimaryAdmin || isWorkspaceOwner || Boolean(profile.can_edit_integrations),
      canViewDashboard: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.OPERATOR,
      canUseAi: profile.ai_access_level !== 'none',
      isClientRole: role === USER_ROLES.CLIENT,
      viewableClientIds: [],
      editableClientIds: [],
    },
  }
}

function buildBaseParams({ token, datePreset, since, until }) {
  const params = new URLSearchParams({
    access_token: token,
    fields: CAMPAIGN_OVERVIEW_FIELDS,
    level: 'ad',
    limit: '200',
  })
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

function normalizeClientStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function isVisibleClient(client) {
  const status = normalizeClientStatus(client?.status)
  return Boolean(
    client?.id &&
    client?.metaAdAccountId &&
    client?.dashboardEnabled !== false &&
    status !== 'churn' &&
    status !== 'pausado'
  )
}

function emptyMetrics() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
  }
}

function addMetrics(target, row) {
  target.spend += Number(row.spend || 0)
  target.impressions += Number(row.impressions || 0)
  target.clicks += Number(row.clicks || 0)
  target.results += Number(row.custom_metrics?.totalConversions || 0)
}

function sortBySpend(items) {
  return items.sort((left, right) => Number(right.spend || 0) - Number(left.spend || 0))
}

function aggregateHierarchy(rows) {
  const campaignsById = new Map()
  const totals = emptyMetrics()

  rows.forEach((rawRow) => {
    const formatted = formatInsightsWithConversions(rawRow)
    const row = {
      campaignId: rawRow.campaign_id || '',
      campaignName: rawRow.campaign_name || 'Campanha sem nome',
      adsetId: rawRow.adset_id || '',
      adsetName: rawRow.adset_name || 'Conjunto sem nome',
      adId: rawRow.ad_id || '',
      adName: rawRow.ad_name || 'Anúncio sem nome',
      spend: Number.parseFloat(formatted.spend || 0),
      impressions: Number.parseInt(formatted.impressions || 0, 10),
      clicks: Number.parseInt(formatted.clicks || 0, 10),
      custom_metrics: formatted.custom_metrics || {},
    }

    if (!row.campaignId || !row.adsetId || !row.adId || row.spend <= 0) return

    addMetrics(totals, row)

    if (!campaignsById.has(row.campaignId)) {
      campaignsById.set(row.campaignId, {
        campaignId: row.campaignId,
        name: row.campaignName,
        ...emptyMetrics(),
        adsetsById: new Map(),
      })
    }
    const campaign = campaignsById.get(row.campaignId)
    addMetrics(campaign, row)

    if (!campaign.adsetsById.has(row.adsetId)) {
      campaign.adsetsById.set(row.adsetId, {
        adsetId: row.adsetId,
        name: row.adsetName,
        ...emptyMetrics(),
        ads: [],
      })
    }
    const adset = campaign.adsetsById.get(row.adsetId)
    addMetrics(adset, row)
    adset.ads.push({
      adId: row.adId,
      name: row.adName,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      results: Number(row.custom_metrics?.totalConversions || 0),
    })
  })

  const campaigns = Array.from(campaignsById.values()).map((campaign) => {
    const adsets = Array.from(campaign.adsetsById.values()).map((adset) => ({
      ...adset,
      ads: sortBySpend(adset.ads),
    }))
    delete campaign.adsetsById
    return {
      ...campaign,
      adsets: sortBySpend(adsets),
    }
  })

  return {
    totals,
    campaigns: sortBySpend(campaigns),
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

async function fetchClientCampaignTree({ client, token, datePreset, since, until }) {
  const adAccountId = String(client.metaAdAccountId || '').replace(/^act_/, '')
  const params = buildBaseParams({ token, datePreset, since, until })
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?${params.toString()}`

  try {
    const data = await fetchMetaJson(url, 'A Meta demorou para responder ao carregar campanhas.', {
      cacheContext: {
        clientKey: adAccountId,
        resourceKind: 'campaigns_overview',
      },
      maxPages: 3,
    })
    const hierarchy = aggregateHierarchy(data?.data || [])

    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      clientStatus: client.status || '',
      metaAdAccountId: adAccountId,
      totals: hierarchy.totals,
      campaigns: hierarchy.campaigns,
      error: '',
    }
  } catch (error) {
    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      clientStatus: client.status || '',
      metaAdAccountId: adAccountId,
      totals: emptyMetrics(),
      campaigns: [],
      error: normalizeMetaError(error, 'Não foi possível carregar as campanhas deste cliente.'),
    }
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const datePreset = searchParams.get('date_preset') || 'last_7d'
    const since = searchParams.get('since') || ''
    const until = searchParams.get('until') || ''
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token) {
      return NextResponse.json({ error: 'Conecte uma conta da Meta para carregar campanhas.' }, { status: 400 })
    }

    const authorized = await getDashboardAccessContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    if (!accessContext.canViewDashboard && !accessContext.canManageClients) {
      return NextResponse.json({ error: 'Sem permissão para visualizar campanhas.' }, { status: 403 })
    }

    const dashboardState = await getDashboardState(adminSupabase, accessContext)
    const visibleClients = (dashboardState.clients || [])
      .filter(isVisibleClient)
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))

    const rows = await mapWithConcurrency(
      visibleClients,
      3,
      (client) => fetchClientCampaignTree({ client, token, datePreset, since, until })
    )

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      period: resolveMetaDateSelection(datePreset, since, until),
      rows,
    })
  } catch (error) {
    console.error('Meta campaigns overview error:', error)
    return NextResponse.json({ error: normalizeMetaError(error, 'Não foi possível carregar campanhas.') }, { status: 500 })
  }
}
