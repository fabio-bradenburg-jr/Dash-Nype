import { NextResponse } from 'next/server'
import {
  createGoogleAuthorizationUrl,
  getAuthorizedGoogleCalendarContext,
  setGoogleOauthCookie,
} from '@/lib/server/google-calendar'

export async function GET(request) {
  try {
    const { accessContext } = await getAuthorizedGoogleCalendarContext({ requireEdit: true })
    const returnTo = request.nextUrl.searchParams.get('return_to') || '/calendar'
    const authorization = await createGoogleAuthorizationUrl(request, accessContext.workspaceId, returnTo)
    const response = NextResponse.redirect(authorization.url)

    await setGoogleOauthCookie(response, {
      state: authorization.state,
      workspaceId: accessContext.workspaceId,
      returnTo: authorization.returnTo,
    })

    return response
  } catch (error) {
    const fallback = new URL('/calendar', request.url)
    fallback.searchParams.set('google_calendar_error', error.message || 'Não foi possível iniciar a conexão com o Google Calendar.')
    return NextResponse.redirect(fallback)
  }
}
