import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { getDashboardState } from '@/lib/server/dashboard-store'
import { requestDashboardInsights, resolveDashboardAiConfig } from '@/lib/server/ai-dashboard'

function normalizeInsightPayload(body) {
  const payload = body && typeof body === 'object' ? body : {}

  return {
    source: String(payload.source || 'dashboard').trim(),
    dashboardName: String(payload.dashboardName || '').trim(),
    clientName: String(payload.clientName || '').trim(),
    period: payload.period && typeof payload.period === 'object' ? payload.period : {},
    filters: payload.filters && typeof payload.filters === 'object' ? payload.filters : {},
    summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : {},
    previousSummary: payload.previousSummary && typeof payload.previousSummary === 'object' ? payload.previousSummary : {},
    daily: Array.isArray(payload.daily) ? payload.daily : [],
    topCampaigns: Array.isArray(payload.topCampaigns) ? payload.topCampaigns : [],
    topCreatives: Array.isArray(payload.topCreatives) ? payload.topCreatives : [],
    topAges: Array.isArray(payload.topAges) ? payload.topAges : [],
    topRegions: Array.isArray(payload.topRegions) ? payload.topRegions : [],
    rankingLayers: Array.isArray(payload.rankingLayers) ? payload.rankingLayers : [],
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    generatedAt: new Date().toISOString(),
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      throw error
    }

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const adminSupabase = createAdminClient()
    const accessContext = await getAccessContext(adminSupabase, user)

    if (!accessContext.canViewDashboard) {
      return NextResponse.json({ error: 'Seu usuário não tem permissão para usar os insights com IA.' }, { status: 403 })
    }

    const dashboardState = await getDashboardState(adminSupabase, accessContext)
    const aiConfig = resolveDashboardAiConfig(dashboardState.globalIntegrations)
    const payload = normalizeInsightPayload(body)
    const result = await requestDashboardInsights(aiConfig, payload)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Dashboard AI insights error:', error)
    return NextResponse.json(
      { error: error.message || 'Não foi possível gerar os insights com IA.' },
      { status: 500 }
    )
  }
}
