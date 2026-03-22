import { NextResponse } from 'next/server'
import {
  getAuthorizedGoogleCalendarContext,
  googleCalendarFetch,
} from '@/lib/server/google-calendar'

export async function GET(request) {
  try {
    const { adminSupabase, accessContext } = await getAuthorizedGoogleCalendarContext()
    const { data, connection } = await googleCalendarFetch({
      request,
      adminSupabase,
      workspaceId: accessContext.workspaceId,
      path: 'users/me/calendarList',
    })

    return NextResponse.json({
      calendars: (data?.items || []).map((calendar) => ({
        id: calendar.id,
        summary: calendar.summary || 'Calendário sem nome',
        primary: Boolean(calendar.primary),
        accessRole: calendar.accessRole || '',
        backgroundColor: calendar.backgroundColor || '',
        timeZone: calendar.timeZone || '',
      })),
      selectedCalendarId: connection.selected_calendar_id || 'primary',
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível carregar os calendários.' }, { status: 500 })
  }
}
