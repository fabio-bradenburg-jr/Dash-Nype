const DEFAULT_FUNNEL_STEPS = ['impressions', 'clicks', 'leads', 'purchases']

function normalizeClientRecord(client) {
  const payload = client?.payload && typeof client.payload === 'object' ? client.payload : client || {}

  return {
    id: client?.id || payload.id || '',
    name: client?.name || payload.name || 'Novo cliente',
    dashboardColor: payload.dashboardColor || 'blue',
    logoUrl: payload.logoUrl || '',
    metaAdAccountId: payload.metaAdAccountId || '',
    googleAdsAccountId: payload.googleAdsAccountId || '',
    tiktokAdsAccountId: payload.tiktokAdsAccountId || '',
    linkedInAdsAccountId: payload.linkedInAdsAccountId || '',
    rdStationAccountId: payload.rdStationAccountId || '',
    salesforceAccountId: payload.salesforceAccountId || '',
    agendorAccountId: payload.agendorAccountId || '',
    rdQualifiedStages: Array.isArray(payload.rdQualifiedStages) ? payload.rdQualifiedStages : [],
    funnelSteps: Array.isArray(payload.funnelSteps) ? payload.funnelSteps : DEFAULT_FUNNEL_STEPS,
    integrations: {
      metaAccessToken: payload.integrations?.metaAccessToken || '',
      metaAdAccountId: payload.integrations?.metaAdAccountId || '',
      googleAdsToken: payload.integrations?.googleAdsToken || '',
      tiktokAdsToken: payload.integrations?.tiktokAdsToken || '',
      linkedinAdsToken: payload.integrations?.linkedinAdsToken || '',
      clickUpToken: payload.integrations?.clickUpToken || '',
      rdStationToken: payload.integrations?.rdStationToken || '',
      salesforceToken: payload.integrations?.salesforceToken || '',
      agendorToken: payload.integrations?.agendorToken || '',
    },
  }
}

export async function getDashboardState(supabase, userId) {
  const [{ data: preferenceRow, error: preferenceError }, { data: clientRows, error: clientsError }] = await Promise.all([
    supabase
      .from('dashboard_preferences')
      .select('theme_color, metric_1, metric_2, active_client_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('dashboard_clients')
      .select('id, name, payload')
      .eq('user_id', userId)
      .order('name', { ascending: true }),
  ])

  if (preferenceError) throw preferenceError
  if (clientsError) throw clientsError

  const clients = (clientRows || []).map(normalizeClientRecord)

  return {
    themeColor: preferenceRow?.theme_color || 'blue',
    metric1: preferenceRow?.metric_1 || 'spend',
    metric2: preferenceRow?.metric_2 || 'roas',
    activeClientId: preferenceRow?.active_client_id || clients[0]?.id || '',
    clients,
  }
}

export async function saveDashboardState(supabase, userId, state) {
  const clients = Array.isArray(state.clients) ? state.clients : []

  const { error: preferenceError } = await supabase
    .from('dashboard_preferences')
    .upsert(
      {
        user_id: userId,
        theme_color: state.themeColor || 'blue',
        metric_1: state.metric1 || 'spend',
        metric_2: state.metric2 || 'roas',
        active_client_id: state.activeClientId || clients[0]?.id || null,
      },
      { onConflict: 'user_id' }
    )

  if (preferenceError) throw preferenceError

  const { error: deleteError } = await supabase
    .from('dashboard_clients')
    .delete()
    .eq('user_id', userId)
  if (deleteError) throw deleteError

  if (clients.length > 0) {
    const rows = clients.map((client) => {
      const normalized = normalizeClientRecord(client)

      return {
        user_id: userId,
        id: normalized.id,
        name: normalized.name,
        payload: normalized,
      }
    })

    const { error: upsertError } = await supabase
      .from('dashboard_clients')
      .upsert(rows, { onConflict: 'user_id,id' })

    if (upsertError) throw upsertError
  }

  return getDashboardState(supabase, userId)
}
