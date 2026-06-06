import { after, NextResponse } from 'next/server'
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

const CREATIVE_INSIGHT_FIELDS = 'ad_id,ad_name,campaign_id,adset_id,spend,impressions,clicks,actions,action_values,cost_per_action_type'

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
    fields: CREATIVE_INSIGHT_FIELDS,
    level: 'ad',
    limit: '100',
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

function isClientVisibleInAdsOverview(client) {
  const status = normalizeClientStatus(client?.status)
  return Boolean(
    client?.id &&
    client?.metaAdAccountId &&
    client?.dashboardEnabled !== false &&
    status !== 'churn' &&
    status !== 'pausado'
  )
}

function buildCreativeThumbnailUrl(adAccountId, adId) {
  const params = new URLSearchParams({
    ad_account_id: String(adAccountId || '').replace(/^act_/, ''),
    ad_id: adId,
  })

  return `/api/meta/creative-thumbnail?${params.toString()}`
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
    // Cache de criativo nao deve bloquear a tela.
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

async function fetchClientTopAds({ client, token, datePreset, since, until, usersById }) {
  const adAccountId = String(client.metaAdAccountId || '').replace(/^act_/, '')
  const params = buildBaseParams({ token, datePreset, since, until })
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?${params.toString()}`

  try {
    const data = await fetchMetaJson(url, 'A Meta demorou para responder ao carregar os anúncios.', {
      cacheContext: {
        clientKey: adAccountId,
        resourceKind: 'ads_overview',
      },
      maxPages: 2,
    })
    const investedRows = (data?.data || []).filter((ad) => Number.parseFloat(ad.spend || 0) > 0)
    const savedDetails = await readSavedCreativeDetails(adAccountId, investedRows)
    const creatives = investedRows
      .map((row) => {
        const formatted = formatInsightsWithConversions(row)
        const saved = savedDetails.get(row.ad_id) || {}

        return {
          adId: row.ad_id || '',
          campaignId: row.campaign_id || '',
          adsetId: row.adset_id || '',
          label: row.ad_name || saved.label || 'Criativo sem nome',
          imageUrl: saved.imageUrl || buildCreativeThumbnailUrl(adAccountId, row.ad_id),
          spend: Number.parseFloat(formatted.spend || 0),
          impressions: Number.parseInt(formatted.impressions || 0, 10),
          clicks: Number.parseInt(formatted.clicks || 0, 10),
          custom_metrics: formatted.custom_metrics || {},
        }
      })
      .sort((left, right) => Number(right.custom_metrics?.totalConversions || 0) - Number(left.custom_metrics?.totalConversions || 0))

    after(() => saveCreativeRanking(adAccountId, creatives))

    const manager = usersById.get(client.resultManagerUserId || '')
    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      clientStatus: client.status || '',
      resultManagerUserId: client.resultManagerUserId || '',
      resultManagerName: manager?.full_name || manager?.email || '',
      metaAdAccountId: adAccountId,
      ads: creatives.slice(0, 5),
      error: '',
    }
  } catch (error) {
    const manager = usersById.get(client.resultManagerUserId || '')
    return {
      clientId: client.id,
      clientName: client.name || 'Cliente sem nome',
      clientLogoUrl: client.logoUrl || '',
      clientStatus: client.status || '',
      resultManagerUserId: client.resultManagerUserId || '',
      resultManagerName: manager?.full_name || manager?.email || '',
      metaAdAccountId: adAccountId,
      ads: [],
      error: normalizeMetaError(error, 'Não foi possível carregar os anúncios deste cliente.'),
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
      return NextResponse.json({ error: 'Conecte uma conta da Meta para carregar os anúncios.' }, { status: 400 })
    }

    const authorized = await getDashboardAccessContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    if (!accessContext.canViewDashboard && !accessContext.canManageClients) {
      return NextResponse.json({ error: 'Sem permissão para visualizar anúncios.' }, { status: 403 })
    }

    const dashboardState = await getDashboardState(adminSupabase, accessContext)
    const usersById = new Map((dashboardState.users || []).map((item) => [item.id, item]))
    const visibleClients = (dashboardState.clients || [])
      .filter(isClientVisibleInAdsOverview)
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))

    const rows = await mapWithConcurrency(
      visibleClients,
      3,
      (client) => fetchClientTopAds({ client, token, datePreset, since, until, usersById })
    )

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      period: resolveMetaDateSelection(datePreset, since, until),
      rows,
    })
  } catch (error) {
    console.error('Meta ads overview error:', error)
    return NextResponse.json({ error: normalizeMetaError(error, 'Não foi possível carregar os anúncios.') }, { status: 500 })
  }
}
