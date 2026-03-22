import { NextResponse } from 'next/server'
import {
  buildEventPayload,
  getAuthorizedGoogleCalendarContext,
  getWorkspaceGoogleCalendarConnection,
  googleCalendarFetch,
  mapGoogleEvent,
} from '@/lib/server/google-calendar'

async function resolveRouteContext(request, params) {
  const { adminSupabase, accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })
  const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, accessContext.workspaceId)

  if (!connection) {
    throw new Error('Conecte uma conta do Google Calendar antes de editar eventos.')
  }

  const resolvedParams = await params
  const eventId = resolvedParams.eventId
  const calendarId = request.nextUrl.searchParams.get('calendarId') || connection.selected_calendar_id || 'primary'

  return {
    adminSupabase,
    accessContext,
    eventId,
    calendarId,
  }
}

export async function PATCH(request, { params }) {
  try {
    const { adminSupabase, accessContext, eventId, calendarId } = await resolveRouteContext(request, params)
    const body = await request.json()
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
      adminSupabase,
      workspaceId: accessContext.workspaceId,
      path: `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      method: 'PATCH',
      query,
      body: payload,
    })

    return NextResponse.json({
      event: mapGoogleEvent(data),
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar o evento.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { adminSupabase, accessContext, eventId, calendarId } = await resolveRouteContext(request, params)

    await googleCalendarFetch({
      request,
      adminSupabase,
      workspaceId: accessContext.workspaceId,
      path: `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      method: 'DELETE',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível excluir o evento.' }, { status: 500 })
  }
}
