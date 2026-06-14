import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { getWorkspaceGoogleCalendarConnection, googleCalendarFetch } = require('@/lib/server/google-calendar') as { getWorkspaceGoogleCalendarConnection: any; googleCalendarFetch: any }

async function getAuthorizedContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminSupabase = createAdminClient()

  if (user) {
    const accessContext = await getAccessContext(supabase, user, { adminSupabase })
    return { adminSupabase, accessContext }
  }

  const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
  if (!token) return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }

  const payload = await verifyLocalAccessToken(token)
  const userId = String(payload.sub || '').replace(/^supabase:/, '')
  const { data: profile } = await adminSupabase.from('profiles').select('id, email, full_name, role, workspace_id').eq('id', userId).maybeSingle()
  if (!profile?.workspace_id) return { errorResponse: NextResponse.json({ error: 'Workspace não encontrado.' }, { status: 404 }) }

  return {
    adminSupabase,
    accessContext: { workspaceId: profile.workspace_id, role: profile.role, profile },
  }
}

async function createGoogleCalendarEvent(request: Request, adminSupabase: any, workspaceId: string, training: any) {
  try {
    const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)
    if (!connection) return null

    const startMs = new Date(training.scheduled_at).getTime()
    const endMs = startMs + (Number(training.duration_minutes) || 60) * 60 * 1000

    const attendees = String(training.attendee_emails || '')
      .split(/[,\n;]/).map((e: string) => e.trim()).filter(Boolean).map((email: string) => ({ email }))

    const eventBody: any = {
      summary: training.title,
      description: training.description || '',
      start: { dateTime: new Date(startMs).toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: new Date(endMs).toISOString(), timeZone: 'America/Sao_Paulo' },
      conferenceData: {
        createRequest: {
          requestId: `pac-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }
    if (attendees.length) eventBody.attendees = attendees

    const calendarId = encodeURIComponent(connection.selected_calendar_id || 'primary')
    const { data: event } = await googleCalendarFetch({
      request,
      adminSupabase,
      workspaceId,
      path: `calendars/${calendarId}/events`,
      method: 'POST',
      query: { conferenceDataVersion: '1', sendUpdates: attendees.length ? 'all' : 'none' },
      body: eventBody,
    })

    const meetLink = event?.hangoutLink
      || event?.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
      || null

    return { eventId: event?.id || null, meetLink, eventHtmlLink: event?.htmlLink || null }
  } catch (err) {
    console.warn('[PAC] Google Calendar sync failed (non-fatal):', err)
    return null
  }
}

async function updateGoogleCalendarEvent(request: Request, adminSupabase: any, workspaceId: string, eventId: string, training: any) {
  try {
    const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)
    if (!connection || !eventId) return

    const startMs = new Date(training.scheduled_at).getTime()
    const endMs = startMs + (Number(training.duration_minutes) || 60) * 60 * 1000

    const attendees = String(training.attendee_emails || '')
      .split(/[,\n;]/).map((e: string) => e.trim()).filter(Boolean).map((email: string) => ({ email }))

    const eventBody: any = {
      summary: training.title,
      description: training.description || '',
      start: { dateTime: new Date(startMs).toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: new Date(endMs).toISOString(), timeZone: 'America/Sao_Paulo' },
    }
    if (attendees.length) eventBody.attendees = attendees

    const calendarId = encodeURIComponent(connection.selected_calendar_id || 'primary')
    await googleCalendarFetch({
      request,
      adminSupabase,
      workspaceId,
      path: `calendars/${calendarId}/events/${eventId}`,
      method: 'PATCH',
      query: { sendUpdates: attendees.length ? 'all' : 'none' },
      body: eventBody,
    })
  } catch (err) {
    console.warn('[PAC] Google Calendar update failed (non-fatal):', err)
  }
}

export async function GET(request: Request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId } = accessContext
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')

    let query = adminSupabase
      .from('pac_trainings')
      .select(`*, client:workspace_clients(id, name), training_type:pac_training_types(id, name, color, icon)`)
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: true })

    if (month) {
      const [y, m] = month.split('-')
      const startDate = `${y}-${m}-01T00:00:00`
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59`
      query = query.gte('scheduled_at', startDate).lte('scheduled_at', endDate)
    } else if (year) {
      query = query.gte('scheduled_at', `${year}-01-01T00:00:00`).lte('scheduled_at', `${year}-12-31T23:59:59`)
    }

    if (status) query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query
    if (error) throw error

    // Check if Google Calendar is connected
    const gcalConnection = await getWorkspaceGoogleCalendarConnection(adminSupabase, workspaceId)

    return NextResponse.json({ trainings: data || [], gcalConnected: Boolean(gcalConnection) })
  } catch (error) {
    console.error('[GET /api/pac/trainings]', error)
    return NextResponse.json({ error: 'Erro ao buscar treinamentos.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse, adminSupabase, accessContext } = await getAuthorizedContext() as any
    if (errorResponse) return errorResponse

    const { workspaceId, profile } = accessContext
    const body = await request.json()
    const {
      title, description, client_id, training_type_id,
      scheduled_at, duration_minutes, status, platform, link, attendee_emails,
    } = body

    if (!title?.trim()) return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 })

    // Try to create Google Calendar event + Meet link
    const gcal = scheduled_at ? await createGoogleCalendarEvent(request, adminSupabase, workspaceId, {
      title: title.trim(), description, scheduled_at, duration_minutes: duration_minutes || 60, attendee_emails,
    }) : null

    const { data, error } = await adminSupabase
      .from('pac_trainings')
      .insert({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description || null,
        client_id: client_id || null,
        training_type_id: training_type_id || null,
        scheduled_at: scheduled_at || null,
        duration_minutes: duration_minutes ? Number(duration_minutes) : 60,
        status: status || 'agendado',
        platform: platform || null,
        link: gcal?.meetLink || link || null,
        meet_link: gcal?.meetLink || null,
        google_calendar_event_id: gcal?.eventId || null,
        attendee_emails: attendee_emails || null,
        created_by: profile?.id || null,
      })
      .select(`*, client:workspace_clients(id, name), training_type:pac_training_types(id, name, color, icon)`)
      .single()

    if (error) throw error

    return NextResponse.json({ training: data, gcalSynced: Boolean(gcal?.eventId) }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/pac/trainings]', error)
    return NextResponse.json({ error: 'Erro ao criar treinamento.' }, { status: 500 })
  }
}
