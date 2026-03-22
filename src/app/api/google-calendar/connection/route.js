import { NextResponse } from 'next/server'
import {
  deleteWorkspaceGoogleCalendarConnection,
  getAuthorizedGoogleCalendarContext,
  getWorkspaceGoogleCalendarConnection,
  isMissingRelationError,
  mapGoogleCalendarConnection,
  updateWorkspaceGoogleCalendarSelection,
} from '@/lib/server/google-calendar'

export async function GET() {
  try {
    const { adminSupabase, accessContext } = await getAuthorizedGoogleCalendarContext()
    const connection = await getWorkspaceGoogleCalendarConnection(adminSupabase, accessContext.workspaceId)

    return NextResponse.json({
      connection: mapGoogleCalendarConnection(connection),
    })
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({
        connection: mapGoogleCalendarConnection(null),
        setupRequired: true,
        error: 'A tabela do Google Calendar ainda não foi criada no Supabase. Aplique a migration para liberar essa integração.',
      })
    }
    return NextResponse.json({ error: error.message || 'Não foi possível carregar a conexão do Google Calendar.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { adminSupabase, accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })
    const body = await request.json()

    const connection = await updateWorkspaceGoogleCalendarSelection(adminSupabase, accessContext.workspaceId, {
      calendarId: body.calendarId,
      calendarSummary: body.calendarSummary,
    })

    return NextResponse.json({
      connection: mapGoogleCalendarConnection(connection),
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar a conexão do Google Calendar.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { adminSupabase, accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })
    await deleteWorkspaceGoogleCalendarConnection(adminSupabase, accessContext.workspaceId)

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível desconectar o Google Calendar.' }, { status: 500 })
  }
}
