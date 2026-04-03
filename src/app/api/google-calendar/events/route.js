import { NextResponse } from 'next/server'
import {
  buildEventPayload,
  getAuthorizedGoogleCalendarContext,
  getWorkspaceGoogleCalendarConnection,
  googleCalendarFetch,
  mapGoogleEvent,
} from '@/lib/server/google-calendar'

function resolveCalendarId(searchParams, connection) {
  return searchParams.get('calendarId') || connection?.selected_calendar_id || 'primary'
}

export async function GET(request) {
  try {
    const { supabase, accessContext } = await getAuthorizedGoogleCalendarContext()
    const connection = await getWorkspaceGoogleCalendarConnection(supabase, accessContext.workspaceId)

    if (!connection) {
      return NextResponse.json({
        events: [],
        selectedCalendarId: 'primary',
      })
    }

    const calendarId = resolveCalendarId(request.nextUrl.searchParams, connection)
    const { data } = await googleCalendarFetch({
      request,
      adminSupabase: supabase,
      workspaceId: accessContext.workspaceId,
      path: `calendars/${encodeURIComponent(calendarId)}/events`,
      query: {
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: request.nextUrl.searchParams.get('timeMin') || undefined,
        timeMax: request.nextUrl.searchParams.get('timeMax') || undefined,
        maxResults: request.nextUrl.searchParams.get('maxResults') || '100',
      },
    })

    return NextResponse.json({
      events: (data?.items || []).map(mapGoogleEvent),
      selectedCalendarId: calendarId,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os eventos.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { supabase, accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })
    const connection = await getWorkspaceGoogleCalendarConnection(supabase, accessContext.workspaceId)

    if (!connection) {
      throw new Error('Conecte uma conta do Google Calendar antes de criar eventos.')
    }

    const body = await request.json()
    const calendarId = body.calendarId || connection.selected_calendar_id || 'primary'
    const payload = buildEventPayload(body)

    const query = {}

    if (body.withMeet) {
      query.conferenceDataVersion = '1'
      payload.conferenceData = {
        createRequest: {
          requestId: globalThis.crypto?.randomUUID?.() || `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      }
    }

    const { data } = await googleCalendarFetch({
      request,
      adminSupabase: supabase,
      workspaceId: accessContext.workspaceId,
      path: `calendars/${encodeURIComponent(calendarId)}/events`,
      method: 'POST',
      query,
      body: payload,
    })

    return NextResponse.json({
      event: mapGoogleEvent(data),
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível criar o evento.' }, { status: 500 })
  }
}
