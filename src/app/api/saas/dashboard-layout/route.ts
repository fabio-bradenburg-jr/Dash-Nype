import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { updateLocalSaasClientDashboardLayout } from '@/lib/saas/local-api'
import { getPlatformApiUrl } from '@/lib/saas/server-api'
import { getAccessContext } from '@/lib/server/access-control'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { createClient } from '@/lib/supabase/server'

const API_URL = getPlatformApiUrl()

function buildLayoutData(payload: Record<string, unknown>) {
  return {
    dashboardTemplates: Array.isArray(payload.dashboardTemplates) ? payload.dashboardTemplates : [],
    activeDashboardTemplateId: String(payload.activeDashboardTemplateId || ''),
    funnelSteps: Array.isArray(payload.funnelSteps) ? payload.funnelSteps : [],
    dashboardButtonColor: String(payload.dashboardButtonColor || ''),
    dashboardAccentColor: String(payload.dashboardAccentColor || ''),
    logoUrl: String(payload.logoUrl || ''),
    dashboardTheme:
      payload.dashboardTheme && typeof payload.dashboardTheme === 'object'
        ? payload.dashboardTheme
        : {
            buttonColor: String(payload.dashboardButtonColor || ''),
            accentColor: String(payload.dashboardAccentColor || ''),
          },
  }
}

async function saveLayoutWithSupabaseSession(clientId: string, payload: Record<string, unknown>) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const adminSupabase = createAdminClient()
  const access = await getAccessContext(supabase, user, { adminSupabase })
  const canEditClient = access.canManageClients || access.editableClientIds.includes(clientId)

  if (!canEditClient) {
    return NextResponse.json({ error: 'Você não tem permissão para salvar este layout.' }, { status: 403 })
  }

  const { data: currentClient, error: loadError } = await adminSupabase
    .from('workspace_clients')
    .select('id, name, payload, updated_at')
    .eq('workspace_id', access.workspaceId)
    .eq('id', clientId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!currentClient) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  const currentPayload =
    currentClient.payload && typeof currentClient.payload === 'object'
      ? (currentClient.payload as Record<string, unknown>)
      : {}
  const currentBusinessData =
    currentPayload.business_data && typeof currentPayload.business_data === 'object'
      ? (currentPayload.business_data as Record<string, unknown>)
      : {}

  const nextPayload = {
    ...currentPayload,
    business_data: {
      ...currentBusinessData,
      ...buildLayoutData(payload),
    },
  }

  const { data, error: updateError } = await adminSupabase
    .from('workspace_clients')
    .update({ payload: nextPayload })
    .eq('workspace_id', access.workspaceId)
    .eq('id', clientId)
    .select('id, name, payload, updated_at')
    .single()

  if (updateError) throw updateError

  return NextResponse.json({ client: data })
}

export async function PUT(request: Request) {
  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  const payload = await request.json()
  const clientId = String(payload.clientId || '').trim()

  if (!clientId) {
    return NextResponse.json({ error: 'Cliente obrigatório para salvar o layout.' }, { status: 400 })
  }

  const supabaseResponse = await saveLayoutWithSupabaseSession(clientId, payload)
  if (supabaseResponse) return supabaseResponse

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const currentResponse = await fetch(`${API_URL}/clients/${clientId}`, {
      headers,
      cache: 'no-store',
    })

    const currentClient = currentResponse.ok ? await currentResponse.json().catch(() => ({})) : {}
    const response = await fetch(`${API_URL}/clients/${clientId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        business_data: {
          ...(currentClient.business_data || {}),
          ...buildLayoutData(payload),
        },
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || data?.detail || 'Não foi possível salvar o layout pelo backend principal.')
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    try {
      const client = await updateLocalSaasClientDashboardLayout(token, payload)
      return NextResponse.json({ client })
    } catch (fallbackError) {
      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível salvar o layout do dashboard.',
        },
        { status: 500 }
      )
    }
  }
}
